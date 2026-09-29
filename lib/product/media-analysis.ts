import { createHash, randomUUID } from "crypto";
import path from "path";
import JSZip from "jszip";
import { generateFreeAnalysis } from "./free-analysis";
import { initializeFormalDocument } from "./formal-analysis";
import { MediaLeaseLostError, type MediaTask } from "./media-task-repository";
import { readPrivateFile } from "./private-storage";
import { mediaTaskRepository, modelCallRepository } from "./product-data-ports";
import { rebuildUnifiedKnowledge } from "./unified-knowledge";
import { openAIResponseError, ProviderConfigurationError, providerErrorCode } from "./openai-errors";
import { modelExecutionWindow } from "./model-execution-window";

export async function processNextMediaTask(workerId = `media-${randomUUID()}`) {
  const repository = mediaTaskRepository();
  const recovered = await recoverStaleMediaTasks();
  const userConcurrency = Math.max(1, Math.floor(Number(process.env.PRODUCT_MEDIA_USER_CONCURRENCY || 4)));
  const task = await repository.findNext(userConcurrency);
  if (!task) return { status: "idle", recovered };
  const executionWindow = modelExecutionWindow();
  if (!executionWindow.allowed) {
    // Keep the task unclaimed: it must not consume a retry or select a fallback
    // merely because its provider is intentionally paused for daytime pricing.
    return { status: "deferred_to_model_window", recovered, solutionId: task.solutionId, taskId: task.id, route: task.route, executionWindow };
  }
  const leaseSeconds = Math.max(180, Number(process.env.PRODUCT_MEDIA_LEASE_SECONDS || 900));
  if (!await repository.claim(task.id, workerId, leaseSeconds)) return { status: "contended", recovered };
  try {
    const media = await loadTaskMedia(task);
    const result = task.route === "ocr_standard" ? await callStandardOcr(media, task) : await callVision(media, task);
    const canonicalText = result.text.trim();
    if (!canonicalText) throw new Error("MEDIA_ANALYSIS_EMPTY");
    const contentHash = createHash("sha256").update(canonicalText).digest("hex");
    const remaining = await repository.complete(task, workerId, { canonicalText, contentHash, confidence: result.confidence, provider: result.provider, model: result.model });
    if (!remaining) await continueAfterMedia(task.solutionId, task.userId);
    return { status: "processed", recovered, solutionId: task.solutionId, taskId: task.id, route: task.route, remaining };
  } catch (error) {
    const code = errorCode(error);
    if (error instanceof MediaLeaseLostError) return { status: "lease_lost", recovered, solutionId: task.solutionId, taskId: task.id, route: task.route, errorCode: "MEDIA_LEASE_LOST" };
    if (error instanceof ProviderConfigurationError) {
      const fallback = configuredFallback(task);
      if (fallback) {
        if (!await repository.scheduleFallback(task.id, workerId, fallback.route, fallback.fallback, code)) return { status: "lease_lost", recovered, solutionId: task.solutionId, taskId: task.id, route: task.route, errorCode: "MEDIA_LEASE_LOST" };
        return { status: "fallback_scheduled", recovered, solutionId: task.solutionId, taskId: task.id, failedRoute: task.route, route: fallback.route, errorCode: code };
      }
      const maxAttempts = Math.min(10, Math.max(2, Number(process.env.PRODUCT_MEDIA_CONFIGURATION_MAX_ATTEMPTS || 5)));
      const exhausted = task.attemptCount + 1 >= maxAttempts;
      const retrySeconds = Math.max(60, Number(process.env.PRODUCT_MEDIA_CONFIGURATION_RETRY_SECONDS || 300));
      if (!await repository.recordConfigurationFailure(task, workerId, exhausted, code, retrySeconds)) return { status: "lease_lost", recovered, solutionId: task.solutionId, taskId: task.id, route: task.route, errorCode: "MEDIA_LEASE_LOST" };
      return { status: exhausted ? "failed" : "awaiting_configuration", recovered, solutionId: task.solutionId, taskId: task.id, route: task.route, errorCode: exhausted ? "MEDIA_CONFIGURATION_RETRY_EXHAUSTED" : code };
    }
    const nextRoute = nextFallback(task);
    if (nextRoute) {
      if (!await repository.scheduleFallback(task.id, workerId, nextRoute.route, nextRoute.fallback, code)) return { status: "lease_lost", recovered, solutionId: task.solutionId, taskId: task.id, route: task.route, errorCode: "MEDIA_LEASE_LOST" };
      return { status: "fallback_scheduled", recovered, solutionId: task.solutionId, taskId: task.id, failedRoute: task.route, route: nextRoute.route, errorCode: code };
    }
    const failure = await repository.recordTerminalFailure(task, workerId, code);
    if (!failure.owned) return { status: "lease_lost", recovered, solutionId: task.solutionId, taskId: task.id, route: task.route, errorCode: "MEDIA_LEASE_LOST" };
    return { status: "failed", recovered, solutionId: task.solutionId, taskId: task.id, route: task.route, errorCode: code, terminal: failure.terminal };
  }
}

export async function processMediaBatch(limit = 1) {
  const repaired = await repairFailedMediaTasks();
  const workerId = `media-${randomUUID()}`;
  const configuredLimit = Math.max(1, Number(process.env.PRODUCT_MEDIA_BATCH_CONCURRENCY || 4));
  const safeLimit = Math.min(10, configuredLimit, Math.max(1, Math.floor(limit)));
  // Each invocation synchronously claims a different row before its first await;
  // external OCR/vision calls then run concurrently.
  const results = await Promise.all(Array.from({ length: safeLimit }, () => processNextMediaTask(workerId)));
  return { workerId, requested: safeLimit, processed: results.filter((item) => ["processed", "fallback_scheduled", "failed"].includes(item.status)).length, repaired, results };
}

export async function recoverStaleMediaTasks() {
  const seconds = Math.max(180, Number(process.env.PRODUCT_MEDIA_STALE_AFTER_SECONDS || 900));
  return mediaTaskRepository().recoverStale(seconds);
}

async function repairFailedMediaTasks() {
  const seconds = Math.min(604800, Math.max(3600, Number(process.env.PRODUCT_MEDIA_AUTO_REPAIR_SECONDS || 21600)));
  return mediaTaskRepository().repairFailed(seconds);
}

async function continueAfterMedia(solutionId: string, userId: string) {
  const unified = rebuildUnifiedKnowledge(solutionId);
  await generateFreeAnalysis(solutionId, userId, unified.facts.slice(0, 24));
  initializeFormalDocument(solutionId);
  await mediaTaskRepository().advanceToFormalAnalysis(solutionId);
}

async function loadTaskMedia(task: MediaTask) {
  let bytes = await readPrivateFile(task.storageKey);
  let mimeType = mimeFor(task.detectedFormat, task.originalName);
  if (task.detectedFormat === "pptx") {
    const metadata = JSON.parse(task.metadataJson || "{}") as { structuredData?: { target?: string } };
    const target = metadata.structuredData?.target;
    if (!target || target.includes("..") || target.startsWith("/")) throw new Error("PPT_MEDIA_TARGET_INVALID");
    const entry = (await JSZip.loadAsync(bytes)).file(target);
    if (!entry) throw new Error("PPT_MEDIA_NOT_FOUND");
    bytes = Buffer.from(await entry.async("uint8array"));
    mimeType = mimeFor(path.extname(target).slice(1), target);
  }
  return { bytes, mimeType, filename: task.originalName };
}

async function callStandardOcr(media: { bytes: Buffer; mimeType: string; filename: string }, task: MediaTask) {
  const endpoint = process.env.PRODUCT_OCR_ENDPOINT;
  if (!endpoint) throw new ProviderConfigurationError("OCR_PROVIDER_NOT_CONFIGURED");
  const provider = process.env.PRODUCT_OCR_PROVIDER || "ocr_http", model = process.env.PRODUCT_OCR_MODEL || "standard-ocr";
  const callId = await beginExternalCall(task.solutionId, "media_analysis:ocr_standard", provider, model);
  return withProviderPermit("ocr", async () => { try {
    const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json", ...(process.env.PRODUCT_OCR_API_KEY ? { Authorization: `Bearer ${process.env.PRODUCT_OCR_API_KEY}` } : {}) }, body: JSON.stringify({ contentBase64: media.bytes.toString("base64"), mimeType: media.mimeType, filename: media.filename, languageHints: ["zh", "en"] }), signal: AbortSignal.timeout(Number(process.env.PRODUCT_OCR_TIMEOUT_MS || 60000)) });
    if (!response.ok) throw new Error(`OCR_PROVIDER_${response.status}`);
    const payload = await response.json() as any;
    const text = payload.text || payload.data?.text || payload.result?.text;
    if (typeof text !== "string") throw new Error("OCR_PROVIDER_INVALID_RESPONSE");
    await completeExternalCall(callId, payload.usage, "OCR");
    return { text, confidence: Number(payload.confidence ?? payload.data?.confidence ?? 0), provider, model };
  } catch (error) { await failExternalCall(callId, error); throw error; } });
}

async function callVision(media: { bytes: Buffer; mimeType: string }, task: MediaTask) {
  if (!process.env.OPENAI_API_KEY) throw new ProviderConfigurationError("VISION_PROVIDER_NOT_CONFIGURED");
  const model = task.route === "vision_premium" ? (process.env.PRODUCT_VISION_PREMIUM_MODEL || "gpt-5.4") : (process.env.PRODUCT_VISION_LOW_COST_MODEL || "gpt-5.4-mini");
  const callId = await beginExternalCall(task.solutionId, `media_analysis:${task.route}`, "openai", model);
  const content = media.mimeType === "application/pdf"
    ? [{ type: "input_file", filename: "source.pdf", file_data: `data:${media.mimeType};base64,${media.bytes.toString("base64")}` }, { type: "input_text", text: mediaPrompt }]
    : [{ type: "input_image", image_url: `data:${media.mimeType};base64,${media.bytes.toString("base64")}` }, { type: "input_text", text: mediaPrompt }];
  return withProviderPermit(task.route === "vision_premium" ? "vision_premium" : "vision_low_cost", async () => { try {
    const response = await fetch(`${process.env.OPENAI_BASE_URL || "https://api.openai.com/v1"}/responses`, { method: "POST", headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ model, store: false, max_output_tokens: 2400, input: [{ role: "user", content }], text: { format: { type: "json_schema", name: "media_analysis", strict: true, schema: mediaSchema } } }), signal: AbortSignal.timeout(Number(process.env.PRODUCT_VISION_TIMEOUT_MS || 90000)) });
    if (!response.ok) throw await openAIResponseError(response, "VISION_PROVIDER");
    const payload = await response.json() as any;
    const output = payload.output_text || payload.output?.flatMap((item: any) => item.content || []).find((item: any) => item.type === "output_text")?.text;
    if (!output) throw new Error("VISION_PROVIDER_EMPTY");
    const parsed = JSON.parse(output);
    await completeExternalCall(callId, payload.usage, "VISION");
    return { text: [parsed.extractedText, parsed.visualDescription, ...(parsed.businessFacts || [])].filter(Boolean).join("\n"), confidence: parsed.confidence, provider: "openai", model };
  } catch (error) { await failExternalCall(callId, error); throw error; } });
}

async function beginExternalCall(solutionId: string, purpose: string, provider: string, model: string) {
  const id = randomUUID();
  const candidate = mediaCandidateMetadata(purpose, model);
  await modelCallRepository().start({ id, solutionId, purpose, provider, model, ...candidate });
  return id;
}
function mediaCandidateMetadata(purpose: string, model: string) {
  const ocr = purpose === "media_analysis:ocr_standard";
  const modelVersion = ocr ? (process.env.PRODUCT_OCR_MODEL_VERSION || model) : (process.env.PRODUCT_VISION_MODEL_VERSION || model);
  const promptVersion = ocr ? (process.env.PRODUCT_OCR_PROMPT_VERSION || "ocr-request-v1") : (process.env.PRODUCT_VISION_PROMPT_VERSION || "media-analysis-v1");
  const parserVersion = process.env.PRODUCT_MEDIA_PARSER_VERSION || "media-parser-v1";
  const configuration = { purpose, model, modelVersion, promptVersion, parserVersion, maxOutputTokens: ocr ? null : 2400 };
  return { modelVersion, promptVersion, parserVersion, configurationHash: createHash("sha256").update(JSON.stringify(configuration)).digest("hex") };
}
async function completeExternalCall(id: string, usage: any, ratePrefix: "OCR" | "VISION") {
  const input = usage?.input_tokens ?? null, output = usage?.output_tokens ?? null;
  const cost = input == null || output == null ? null : Math.round(input * Number(process.env[`PRODUCT_${ratePrefix}_INPUT_USD_PER_MILLION`] || 0) + output * Number(process.env[`PRODUCT_${ratePrefix}_OUTPUT_USD_PER_MILLION`] || 0));
  await modelCallRepository().succeed(id, { inputTokens: input, outputTokens: output, estimatedCostMicrousd: cost });
}
async function failExternalCall(id: string, error: unknown) { await modelCallRepository().fail(id, errorCode(error)); }

function nextFallback(task: MediaTask) {
  if (task.route === "ocr_standard") return { route: "vision_low_cost", fallback: "vision_premium" };
  if (task.route === "vision_low_cost") return { route: "vision_premium", fallback: "none" };
  return task.attemptCount + 1 < 3 ? { route: "vision_premium", fallback: "none" } : null;
}
function configuredFallback(task: MediaTask) {
  if (task.route === "ocr_standard" && process.env.OPENAI_API_KEY) return { route: "vision_low_cost", fallback: "vision_premium" };
  return null;
}
function mimeFor(format: string, filename: string) { const value = format.toLowerCase(); if (value === "png") return "image/png"; if (value === "jpg" || value === "jpeg") return "image/jpeg"; if (value === "webp") return "image/webp"; if (value === "pdf") return "application/pdf"; const ext = path.extname(filename).toLowerCase(); return ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : "image/jpeg"; }
function errorCode(error: unknown) { return providerErrorCode(error, "MEDIA_ANALYSIS_FAILED"); }
type ProviderLane = "ocr" | "vision_low_cost" | "vision_premium";
const providerLanes = new Map<ProviderLane, { active: number; waiters: Array<() => void> }>();
async function withProviderPermit<T>(lane: ProviderLane, operation: () => Promise<T>) {
  const state = providerLanes.get(lane) || { active: 0, waiters: [] };
  providerLanes.set(lane, state);
  const envKey = lane === "ocr" ? "PRODUCT_OCR_CONCURRENCY" : lane === "vision_low_cost" ? "PRODUCT_VISION_LOW_COST_CONCURRENCY" : "PRODUCT_VISION_PREMIUM_CONCURRENCY";
  const fallback = lane === "ocr" ? 8 : lane === "vision_low_cost" ? 4 : 2;
  const capacity = Math.max(1, Math.floor(Number(process.env[envKey] || fallback)));
  if (state.active >= capacity) await new Promise<void>((resolve) => state.waiters.push(resolve));
  state.active++;
  try { return await operation(); }
  finally { state.active--; state.waiters.shift()?.(); }
}
const mediaPrompt = "提取图片中的全部可读文字，并简要描述与企业项目需求有关的图表、界面、流程和业务事实。不得猜测看不清的信息。";
const mediaSchema = { type: "object", additionalProperties: false, required: ["extractedText", "visualDescription", "businessFacts", "confidence"], properties: { extractedText: { type: "string" }, visualDescription: { type: "string" }, businessFacts: { type: "array", items: { type: "string" } }, confidence: { type: "number", minimum: 0, maximum: 1 } } };
