import { createHash, randomUUID } from "crypto";
import fs from "fs/promises";
import path from "path";
import JSZip from "jszip";
import { productSqlite } from "./db";
import { generateFreeAnalysis } from "./free-analysis";
import { initializeFormalDocument } from "./formal-analysis";
import { privateStorageRoot } from "./private-storage";
import { rebuildUnifiedKnowledge } from "./unified-knowledge";
import { openAIResponseError, ProviderConfigurationError, providerErrorCode } from "./openai-errors";
import { modelExecutionWindow } from "./model-execution-window";

type MediaTask = {
  id: string; solutionId: string; sourceFileId: string; sourceBlockId: string; route: string;
  fallbackRoute: string; attemptCount: number; userId: string; detectedFormat: string;
  storageKey: string; originalName: string; metadataJson: string;
};

export async function processNextMediaTask(workerId = `media-${randomUUID()}`) {
  const recovered = recoverStaleMediaTasks();
  const userConcurrency = Math.max(1, Math.floor(Number(process.env.PRODUCT_MEDIA_USER_CONCURRENCY || 4)));
  const task = productSqlite.prepare(`SELECT t.id, t.solution_id AS solutionId, t.source_file_id AS sourceFileId,
      t.source_block_id AS sourceBlockId, t.route, t.fallback_route AS fallbackRoute, t.attempt_count AS attemptCount,
      s.owner_user_id AS userId, f.detected_format AS detectedFormat, f.storage_key AS storageKey,
      f.original_name AS originalName, b.metadata_json AS metadataJson
    FROM media_analysis_tasks t
    JOIN product_solutions s ON s.id = t.solution_id
    JOIN source_files f ON f.id = t.source_file_id
    JOIN source_blocks b ON b.id = t.source_block_id
    WHERE t.status IN ('queued', 'awaiting_configuration') AND (t.next_attempt_at IS NULL OR t.next_attempt_at <= CURRENT_TIMESTAMP) AND s.status NOT IN ('deletion_pending', 'deleted')
      AND (SELECT COUNT(*) FROM media_analysis_tasks active JOIN product_solutions active_solution ON active_solution.id = active.solution_id
        WHERE active_solution.owner_user_id = s.owner_user_id AND active.status = 'processing' AND active.lease_until > CURRENT_TIMESTAMP) < ?
    ORDER BY t.updated_at, t.id LIMIT 1`).get(userConcurrency) as MediaTask | undefined;
  if (!task) return { status: "idle", recovered };
  const executionWindow = modelExecutionWindow();
  if (!executionWindow.allowed) {
    // Keep the task unclaimed: it must not consume a retry or select a fallback
    // merely because its provider is intentionally paused for daytime pricing.
    return { status: "deferred_to_model_window", recovered, solutionId: task.solutionId, taskId: task.id, route: task.route, executionWindow };
  }
  const leaseSeconds = Math.max(180, Number(process.env.PRODUCT_MEDIA_LEASE_SECONDS || 900));
  const claimed = productSqlite.prepare("UPDATE media_analysis_tasks SET status = 'processing', attempt_count = attempt_count + 1, lease_owner = ?, lease_until = datetime('now', ?), next_attempt_at = NULL, error_code = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status IN ('queued', 'awaiting_configuration') AND (next_attempt_at IS NULL OR next_attempt_at <= CURRENT_TIMESTAMP)").run(workerId, `+${leaseSeconds} seconds`, task.id);
  if (!claimed.changes) return { status: "contended", recovered };
  try {
    const media = await loadTaskMedia(task);
    const result = task.route === "ocr_standard" ? await callStandardOcr(media, task) : await callVision(media, task);
    const canonicalText = result.text.trim();
    if (!canonicalText) throw new Error("MEDIA_ANALYSIS_EMPTY");
    const contentHash = createHash("sha256").update(canonicalText).digest("hex");
    productSqlite.transaction(() => {
      const completed = productSqlite.prepare("UPDATE media_analysis_tasks SET status = 'completed', lease_owner = NULL, lease_until = NULL, next_attempt_at = NULL, failed_at = NULL, error_code = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'processing' AND lease_owner = ? AND lease_until > CURRENT_TIMESTAMP").run(task.id, workerId);
      if (!completed.changes) throw new LeaseLostError();
      productSqlite.prepare("UPDATE source_blocks SET canonical_text = ?, content_hash = ?, metadata_json = json_set(metadata_json, '$.mediaAnalysis', json(?)) WHERE id = ?").run(canonicalText, contentHash, JSON.stringify({ route: task.route, confidence: result.confidence, provider: result.provider, model: result.model }), task.sourceBlockId);
    })();
    const remaining = remainingMediaTasks(task.solutionId);
    if (!remaining) await continueAfterMedia(task.solutionId, task.userId);
    return { status: "processed", recovered, solutionId: task.solutionId, taskId: task.id, route: task.route, remaining };
  } catch (error) {
    const code = errorCode(error);
    if (error instanceof LeaseLostError) return { status: "lease_lost", recovered, solutionId: task.solutionId, taskId: task.id, route: task.route, errorCode: code };
    if (error instanceof ProviderConfigurationError) {
      const fallback = configuredFallback(task);
      if (fallback) {
        const released = productSqlite.prepare("UPDATE media_analysis_tasks SET route = ?, fallback_route = ?, status = 'queued', lease_owner = NULL, lease_until = NULL, next_attempt_at = CURRENT_TIMESTAMP, error_code = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND lease_owner = ?").run(fallback.route, fallback.fallback, code, task.id, workerId);
        if (!released.changes) return { status: "lease_lost", recovered, solutionId: task.solutionId, taskId: task.id, route: task.route, errorCode: "MEDIA_LEASE_LOST" };
        return { status: "fallback_scheduled", recovered, solutionId: task.solutionId, taskId: task.id, failedRoute: task.route, route: fallback.route, errorCode: code };
      }
      const maxAttempts = Math.min(10, Math.max(2, Number(process.env.PRODUCT_MEDIA_CONFIGURATION_MAX_ATTEMPTS || 5)));
      const exhausted = task.attemptCount + 1 >= maxAttempts;
      const released = productSqlite.prepare(`UPDATE media_analysis_tasks SET status = ?, lease_owner = NULL, lease_until = NULL, error_code = ?,
        next_attempt_at = CASE WHEN ? = 'failed' THEN NULL ELSE datetime('now', ?) END,
        failed_at = CASE WHEN ? = 'failed' THEN CURRENT_TIMESTAMP ELSE NULL END, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND lease_owner = ?`).run(exhausted ? "failed" : "awaiting_configuration", exhausted ? "MEDIA_CONFIGURATION_RETRY_EXHAUSTED" : code, exhausted ? "failed" : "awaiting_configuration", `+${Math.max(60, Number(process.env.PRODUCT_MEDIA_CONFIGURATION_RETRY_SECONDS || 300))} seconds`, exhausted ? "failed" : "awaiting_configuration", task.id, workerId);
      if (!released.changes) return { status: "lease_lost", recovered, solutionId: task.solutionId, taskId: task.id, route: task.route, errorCode: "MEDIA_LEASE_LOST" };
      if (exhausted) productSqlite.prepare("UPDATE product_solutions SET status = 'blocked', stage = 'media_analysis', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(task.solutionId);
      return { status: exhausted ? "failed" : "awaiting_configuration", recovered, solutionId: task.solutionId, taskId: task.id, route: task.route, errorCode: exhausted ? "MEDIA_CONFIGURATION_RETRY_EXHAUSTED" : code };
    }
    const nextRoute = nextFallback(task);
    if (nextRoute) {
      const released = productSqlite.prepare("UPDATE media_analysis_tasks SET route = ?, fallback_route = ?, status = 'queued', lease_owner = NULL, lease_until = NULL, next_attempt_at = CURRENT_TIMESTAMP, error_code = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND lease_owner = ?").run(nextRoute.route, nextRoute.fallback, code, task.id, workerId);
      if (!released.changes) return { status: "lease_lost", recovered, solutionId: task.solutionId, taskId: task.id, route: task.route, errorCode: "MEDIA_LEASE_LOST" };
      return { status: "fallback_scheduled", recovered, solutionId: task.solutionId, taskId: task.id, failedRoute: task.route, route: nextRoute.route, errorCode: code };
    }
    const failed = productSqlite.prepare("UPDATE media_analysis_tasks SET status = 'failed', lease_owner = NULL, lease_until = NULL, next_attempt_at = NULL, failed_at = CURRENT_TIMESTAMP, error_code = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND lease_owner = ?").run(code, task.id, workerId);
    if (!failed.changes) return { status: "lease_lost", recovered, solutionId: task.solutionId, taskId: task.id, route: task.route, errorCode: "MEDIA_LEASE_LOST" };
    // Once every media task has either completed or failed, keep the solution from
    // remaining in `recovering` forever. A fully exhausted media batch is a
    // terminal, repairable block; the automatic repair worker can reopen it later.
    const retryable = productSqlite.prepare(`SELECT COUNT(*) AS count FROM media_analysis_tasks
      WHERE solution_id = ? AND status IN ('queued', 'processing', 'awaiting_configuration')`).get(task.solutionId) as { count: number };
    productSqlite.prepare("UPDATE product_solutions SET status = ?, stage = 'media_analysis', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(retryable.count ? "recovering" : "blocked", task.solutionId);
    return { status: "failed", recovered, solutionId: task.solutionId, taskId: task.id, route: task.route, errorCode: code, terminal: retryable.count === 0 };
  }
}

export async function processMediaBatch(limit = 1) {
  const repaired = repairFailedMediaTasks();
  const workerId = `media-${randomUUID()}`;
  const configuredLimit = Math.max(1, Number(process.env.PRODUCT_MEDIA_BATCH_CONCURRENCY || 4));
  const safeLimit = Math.min(10, configuredLimit, Math.max(1, Math.floor(limit)));
  // Each invocation synchronously claims a different row before its first await;
  // external OCR/vision calls then run concurrently.
  const results = await Promise.all(Array.from({ length: safeLimit }, () => processNextMediaTask(workerId)));
  return { workerId, requested: safeLimit, processed: results.filter((item) => ["processed", "fallback_scheduled", "failed"].includes(item.status)).length, repaired, results };
}

export function recoverStaleMediaTasks() {
  const seconds = Math.max(180, Number(process.env.PRODUCT_MEDIA_STALE_AFTER_SECONDS || 900));
  return productSqlite.prepare("UPDATE media_analysis_tasks SET status = 'queued', lease_owner = NULL, lease_until = NULL, next_attempt_at = CURRENT_TIMESTAMP, error_code = 'STALE_WORK_RECOVERED', updated_at = CURRENT_TIMESTAMP WHERE status = 'processing' AND (lease_until < CURRENT_TIMESTAMP OR (lease_until IS NULL AND updated_at < datetime('now', ?)))").run(`-${seconds} seconds`).changes;
}

function repairFailedMediaTasks() {
  const seconds = Math.min(604800, Math.max(3600, Number(process.env.PRODUCT_MEDIA_AUTO_REPAIR_SECONDS || 21600)));
  return productSqlite.transaction(() => {
    const solutions = productSqlite.prepare("SELECT DISTINCT solution_id AS solutionId FROM media_analysis_tasks WHERE status = 'failed' AND failed_at <= datetime('now', ?)").all(`-${seconds} seconds`) as Array<{ solutionId: string }>;
    const repaired = productSqlite.prepare("UPDATE media_analysis_tasks SET status = 'queued', attempt_count = 0, next_attempt_at = CURRENT_TIMESTAMP, failed_at = NULL, error_code = 'MEDIA_AUTO_REPAIR', updated_at = CURRENT_TIMESTAMP WHERE status = 'failed' AND failed_at <= datetime('now', ?)").run(`-${seconds} seconds`).changes;
    const restore = productSqlite.prepare("UPDATE product_solutions SET status = 'recovering', stage = 'media_analysis', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'blocked'");
    for (const solution of solutions) restore.run(solution.solutionId);
    return repaired;
  })();
}

async function continueAfterMedia(solutionId: string, userId: string) {
  const unified = rebuildUnifiedKnowledge(solutionId);
  await generateFreeAnalysis(solutionId, userId, unified.facts.slice(0, 24));
  initializeFormalDocument(solutionId);
  productSqlite.prepare("UPDATE product_solutions SET stage = 'formal_analysis', status = 'processing', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(solutionId);
}

function remainingMediaTasks(solutionId: string) {
  return (productSqlite.prepare("SELECT COUNT(*) AS count FROM media_analysis_tasks WHERE solution_id = ? AND status != 'completed'").get(solutionId) as { count: number }).count;
}

async function loadTaskMedia(task: MediaTask) {
  const storedPath = storageKeyToPath(task.storageKey);
  let bytes = await fs.readFile(storedPath);
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
  const callId = beginExternalCall(task.solutionId, "media_analysis:ocr_standard", provider, model);
  return withProviderPermit("ocr", async () => { try {
    const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json", ...(process.env.PRODUCT_OCR_API_KEY ? { Authorization: `Bearer ${process.env.PRODUCT_OCR_API_KEY}` } : {}) }, body: JSON.stringify({ contentBase64: media.bytes.toString("base64"), mimeType: media.mimeType, filename: media.filename, languageHints: ["zh", "en"] }), signal: AbortSignal.timeout(Number(process.env.PRODUCT_OCR_TIMEOUT_MS || 60000)) });
    if (!response.ok) throw new Error(`OCR_PROVIDER_${response.status}`);
    const payload = await response.json() as any;
    const text = payload.text || payload.data?.text || payload.result?.text;
    if (typeof text !== "string") throw new Error("OCR_PROVIDER_INVALID_RESPONSE");
    completeExternalCall(callId, payload.usage, "OCR");
    return { text, confidence: Number(payload.confidence ?? payload.data?.confidence ?? 0), provider, model };
  } catch (error) { failExternalCall(callId, error); throw error; } });
}

async function callVision(media: { bytes: Buffer; mimeType: string }, task: MediaTask) {
  if (!process.env.OPENAI_API_KEY) throw new ProviderConfigurationError("VISION_PROVIDER_NOT_CONFIGURED");
  const model = task.route === "vision_premium" ? (process.env.PRODUCT_VISION_PREMIUM_MODEL || "gpt-5.4") : (process.env.PRODUCT_VISION_LOW_COST_MODEL || "gpt-5.4-mini");
  const callId = beginExternalCall(task.solutionId, `media_analysis:${task.route}`, "openai", model);
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
    completeExternalCall(callId, payload.usage, "VISION");
    return { text: [parsed.extractedText, parsed.visualDescription, ...(parsed.businessFacts || [])].filter(Boolean).join("\n"), confidence: parsed.confidence, provider: "openai", model };
  } catch (error) { failExternalCall(callId, error); throw error; } });
}

function beginExternalCall(solutionId: string, purpose: string, provider: string, model: string) {
  const id = randomUUID();
  const candidate = mediaCandidateMetadata(purpose, model);
  productSqlite.prepare(`INSERT INTO model_calls
    (id, solution_id, purpose, provider, model, model_version, prompt_version, parser_version, configuration_hash, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'running')`).run(id, solutionId, purpose, provider, model, candidate.modelVersion, candidate.promptVersion, candidate.parserVersion, candidate.configurationHash);
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
function completeExternalCall(id: string, usage: any, ratePrefix: "OCR" | "VISION") {
  const input = usage?.input_tokens ?? null, output = usage?.output_tokens ?? null;
  const cost = input == null || output == null ? null : Math.round(input * Number(process.env[`PRODUCT_${ratePrefix}_INPUT_USD_PER_MILLION`] || 0) + output * Number(process.env[`PRODUCT_${ratePrefix}_OUTPUT_USD_PER_MILLION`] || 0));
  productSqlite.prepare("UPDATE model_calls SET status = 'succeeded', input_tokens = ?, output_tokens = ?, estimated_cost_microusd = ?, completed_at = CURRENT_TIMESTAMP WHERE id = ?").run(input, output, cost, id);
}
function failExternalCall(id: string, error: unknown) { productSqlite.prepare("UPDATE model_calls SET status = 'failed', error_code = ?, completed_at = CURRENT_TIMESTAMP WHERE id = ?").run(errorCode(error), id); }

function nextFallback(task: MediaTask) {
  if (task.route === "ocr_standard") return { route: "vision_low_cost", fallback: "vision_premium" };
  if (task.route === "vision_low_cost") return { route: "vision_premium", fallback: "none" };
  return task.attemptCount + 1 < 3 ? { route: "vision_premium", fallback: "none" } : null;
}
function configuredFallback(task: MediaTask) {
  if (task.route === "ocr_standard" && process.env.OPENAI_API_KEY) return { route: "vision_low_cost", fallback: "vision_premium" };
  return null;
}
function storageKeyToPath(key: string) { const parts = key.split("/"); if (parts.length !== 4 || parts[0] !== "private" || parts.slice(1).some((part) => !/^[0-9a-f-]{36}$/i.test(part))) throw new Error("INVALID_STORAGE_KEY"); return path.join(privateStorageRoot(), ...parts.slice(1)); }
function mimeFor(format: string, filename: string) { const value = format.toLowerCase(); if (value === "png") return "image/png"; if (value === "jpg" || value === "jpeg") return "image/jpeg"; if (value === "webp") return "image/webp"; if (value === "pdf") return "application/pdf"; const ext = path.extname(filename).toLowerCase(); return ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : "image/jpeg"; }
function errorCode(error: unknown) { return providerErrorCode(error, "MEDIA_ANALYSIS_FAILED"); }
class LeaseLostError extends Error { constructor() { super("MEDIA_LEASE_LOST"); } }
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
