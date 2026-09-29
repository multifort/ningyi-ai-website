import { execFile } from "child_process";
import { createHash, randomUUID } from "crypto";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { promisify } from "util";
import { generateFreeAnalysis } from "./free-analysis";
import { initializeFormalDocument } from "./formal-analysis";
import { readPrivateFile } from "./private-storage";
import { sourceProcessingRepository } from "./product-data-ports";
import type { PersistedSourceBlock } from "./source-processing-repository";
import { rebuildUnifiedKnowledge } from "./unified-knowledge";

const execFileAsync = promisify(execFile);

type SourceBlock = PersistedSourceBlock & { sourcePath: string };

export async function processSolution(solutionId: string, userId: string, options: { runAlreadyClaimed?: boolean; workerId?: string } = {}) {
  const runId = randomUUID();
  const repository = sourceProcessingRepository();
  let workRoot: string | null = null;
  if (!options.runAlreadyClaimed) await repository.startInline(runId, solutionId, userId);
  try {
    const { files, intake } = await repository.loadInput(solutionId, userId);
    const blocks: Array<SourceBlock & { sourceFileId: string | null }> = [];
    workRoot = await fs.mkdtemp(path.join(os.tmpdir(), `ningyi-source-${solutionId}-`));
    for (const file of files.filter((item) => item.category === "content")) {
      const inputPath = path.join(workRoot, `${file.id}-${safeName(file.originalName)}`);
      const outputPath = path.join(workRoot, `${file.id}.jsonl`);
      await fs.writeFile(inputPath, await readPrivateFile(file.storageKey), { mode: 0o600 });
      await execFileAsync(process.env.PRODUCT_PYTHON_PATH || "python3", [
        path.join(process.cwd(), "docs/product/v1-design/spikes/source-ingestion/extract_source_blocks.py"),
        "--input", inputPath, "--base", workRoot, "--output", outputPath,
      ], { timeout: 120000, maxBuffer: 2 * 1024 * 1024 });
      const lines = (await fs.readFile(outputPath, "utf8")).split("\n").filter(Boolean);
      blocks.push(...lines.map((line) => ({ ...(JSON.parse(line) as SourceBlock), sourceFileId: file.id })));
    }
    if (intake.needDescription.trim()) {
      blocks.unshift({ id: randomUUID(), blockType: "intake_description", canonicalText: intake.needDescription.trim(), locator: { field: "needDescription" }, contentHash: digest(intake.needDescription.trim()), sourcePath: "intake", sourceFileId: null });
    }
    const intakeFields = normalizeIntakeFields(intake.purposePrimary, intake.formData);
    for (const field of intakeFields.reverse()) {
      blocks.unshift({ id: randomUUID(), blockType: "intake_field", canonicalText: `${field.label}：${field.value}`, locator: { field: field.key }, contentHash: digest(`${field.key}:${field.value}`), sourcePath: "intake", sourceFileId: null });
    }
    const mediaRoutes = blocks.flatMap((block) => block.sourceFileId ? routeMediaBlock(block) : []);
    const pendingMedia = mediaRoutes.filter((route) => route.status === "queued");
    const distinctText = [...new Set(blocks.filter(isUsableTextBlock).map((block) => block.canonicalText.trim()).filter(Boolean))];
    const facts = distinctText.slice(0, 12).map((text, index) => ({ id: `FACT-${String(index + 1).padStart(3, "0")}`, text: text.slice(0, 500), sourceBlockId: blocks.find((block) => block.canonicalText.trim() === text)?.id }));
    const summary = facts.length ? `系统已从文字说明和材料中识别 ${facts.length} 条首批项目信息，正在进一步核对范围、用户、功能与约束。` : "材料已接收，暂未提取到可用文字，系统将进入图片或扫描件识别。";
    await repository.commitParsed({ solutionId, workerId: options.workerId, blocks, mediaRoutes, facts, summary, pendingMedia: pendingMedia.length > 0 });
    const unified = rebuildUnifiedKnowledge(solutionId);
    const freeAnalysis = await generateFreeAnalysis(solutionId, userId, unified.facts.slice(0, 24));
    const formalDocument = pendingMedia.length ? null : initializeFormalDocument(solutionId);
    await fs.rm(workRoot, { recursive: true, force: true });
    workRoot = null;
    return { blockCount: blocks.length, factCount: unified.facts.length, conflictCount: unified.knowledge.stats.conflictCount, mediaTaskCount: mediaRoutes.length, pendingMediaTaskCount: pendingMedia.length, summary: unified.summary, freeAnalysisOrigin: freeAnalysis.origin, freeAnalysisModel: freeAnalysis.model, formalStatus: formalDocument?.status || null };
  } catch (error) {
    if (!(error instanceof Error && error.message === "SOURCE_LEASE_LOST")) {
      const attemptCount = await repository.attemptCount(solutionId);
      const maxAttempts = Math.min(10, Math.max(2, Number(process.env.PRODUCT_SOURCE_MAX_ATTEMPTS || 5)));
      const exhausted = attemptCount >= maxAttempts;
      const retryDelays = [5, 30, 120, 600];
      const retrySeconds = retryDelays[Math.min(Math.max(0, attemptCount - 1), retryDelays.length - 1)];
      await repository.recordFailure(solutionId, options.workerId, exhausted, retrySeconds);
    }
    throw error;
  } finally {
    if (workRoot) await fs.rm(workRoot, { recursive: true, force: true }).catch(() => undefined);
  }
}

export async function enqueueSourceProcessing(solutionId: string, userId: string) {
  return sourceProcessingRepository().enqueue(randomUUID(), solutionId, userId);
}

export async function processSourceBatch(limit = 1) {
  const recovered = await recoverStaleSourceProcessing();
  const repaired = await repairExhaustedSourceProcessing();
  const workerId = `source-${randomUUID()}`;
  const configured = Math.max(1, Number(process.env.PRODUCT_SOURCE_BATCH_CONCURRENCY || 2));
  const safeLimit = Math.min(8, configured, Math.max(1, Math.floor(limit)));
  const results = await Promise.all(Array.from({ length: safeLimit }, () => processNextSourceTask(workerId)));
  return { workerId, requested: safeLimit, processed: results.filter((item) => item.status === "processed" || item.status === "failed").length, recovered, repaired, results };
}

async function processNextSourceTask(workerId: string) {
  const userConcurrency = Math.max(1, Math.floor(Number(process.env.PRODUCT_SOURCE_USER_CONCURRENCY || 2)));
  const leaseSeconds = Math.max(180, Number(process.env.PRODUCT_SOURCE_LEASE_SECONDS || 900));
  const claim = await sourceProcessingRepository().claimNext(workerId, userConcurrency, leaseSeconds);
  if (claim.status !== "claimed") return claim;
  const next = claim.task;
  try {
    const result = await processSolution(next.solutionId, next.userId, { runAlreadyClaimed: true, workerId });
    return { status: "processed", solutionId: next.solutionId, result };
  } catch (error) { const leaseLost = error instanceof Error && error.message === "SOURCE_LEASE_LOST"; return { status: leaseLost ? "lease_lost" : "failed", solutionId: next.solutionId, errorCode: leaseLost ? "SOURCE_LEASE_LOST" : "SOURCE_INGESTION_FAILED" }; }
}

export async function recoverStaleSourceProcessing() {
  const seconds = Math.max(180, Number(process.env.PRODUCT_SOURCE_STALE_AFTER_SECONDS || 900));
  return sourceProcessingRepository().recoverStale(seconds);
}

async function repairExhaustedSourceProcessing() {
  const seconds = Math.min(604800, Math.max(3600, Number(process.env.PRODUCT_SOURCE_AUTO_REPAIR_SECONDS || 21600)));
  return sourceProcessingRepository().repairFailed(seconds);
}

function safeName(name: string) { return path.basename(name).replace(/[^\p{L}\p{N}._-]+/gu, "_").slice(-160); }
function digest(value: string) { return createHash("sha256").update(value).digest("hex"); }

function isUsableTextBlock(block: SourceBlock & { sourceFileId: string | null }) {
  return block.blockType !== "image" && !(block.warnings || []).includes("ocr_required") && !block.canonicalText.startsWith("[scanned page]");
}

function routeMediaBlock(block: SourceBlock & { sourceFileId: string | null }) {
  const sourceFormat = block.sourceFormat;
  const warnings = new Set(block.warnings || []);
  if (!block.sourceFileId || !["pdf", "image", "pptx"].includes(sourceFormat || "")) return [];
  if (sourceFormat === "pptx" && block.blockType !== "image") return [];
  const isMedia = block.blockType === "image" || warnings.has("ocr_required");
  if (sourceFormat === "pdf" && !isMedia) return [{ sourceFileId: block.sourceFileId, sourceBlockId: block.id, route: "deterministic_text", fallbackRoute: "none", status: "completed", requiresModel: false, reasonCodes: ["native_text_layer_available"], signals: { nativeTextChars: block.canonicalText.length, hasTextLayer: true, ocrConfidence: null, layoutComplexity: "unknown" }, inputHash: block.contentHash }];
  const route = sourceFormat === "image" || warnings.has("ocr_required") ? "ocr_standard" : "vision_low_cost";
  return [{ sourceFileId: block.sourceFileId, sourceBlockId: block.id, route, fallbackRoute: route === "ocr_standard" ? "vision_low_cost" : "vision_premium", status: "queued", requiresModel: route.startsWith("vision_"), reasonCodes: [route === "ocr_standard" ? "no_usable_text_layer" : "embedded_visual_requires_semantic_analysis"], signals: { nativeTextChars: 0, hasTextLayer: false, ocrConfidence: null, layoutComplexity: "unknown" }, inputHash: block.contentHash }];
}

function normalizeIntakeFields(purposePrimary: string, formDataText: string) {
  let data: Record<string, unknown> = {};
  try { data = JSON.parse(formDataText) as Record<string, unknown>; } catch { data = {}; }
  const definitions: Array<[string, string]> = [
    ["organizationName", "组织或客户"], ["industry", "所在行业"], ["actualUsers", "实际使用者"], ["shapes", "希望的产品形态"],
    ["desiredGoals", "希望达到的目标"], ["currentState", "当前现状"], ["includedScope", "本期包含范围"], ["excludedScope", "明确不包含内容"],
    ["budget", "预算范围"], ["timeline", "期望周期"], ["otherConstraints", "其他限制或备注"],
  ];
  const result = purposePrimary.trim() ? [{ key: "purposePrimary", label: "方案主要用途", value: purposePrimary.trim() }] : [];
  for (const [key, label] of definitions) {
    const raw = data[key];
    const value = Array.isArray(raw) ? raw.filter((item): item is string => typeof item === "string" && Boolean(item.trim())).join("、") : typeof raw === "string" ? raw.trim() : "";
    if (value) result.push({ key, label, value });
  }
  return result;
}
