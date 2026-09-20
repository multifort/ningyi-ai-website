import { execFile } from "child_process";
import { createHash, randomUUID } from "crypto";
import fs from "fs/promises";
import path from "path";
import { promisify } from "util";
import { productSqlite } from "./db";
import { generateFreeAnalysis } from "./free-analysis";
import { initializeFormalDocument } from "./formal-analysis";
import { privateStorageRoot } from "./private-storage";
import { rebuildUnifiedKnowledge } from "./unified-knowledge";

const execFileAsync = promisify(execFile);

type StoredFile = { id: string; original_name: string; detected_format: string; storage_key: string; category: string };
type SourceBlock = { id: string; blockType: string; canonicalText: string; locator: any; contentHash: string; sourcePath: string; sourceFormat?: string; warnings?: string[]; confidence?: number; structuredData?: unknown; parser?: unknown };

export async function processSolution(solutionId: string, userId: string, options: { runAlreadyClaimed?: boolean; workerId?: string } = {}) {
  const runId = randomUUID();
  if (!options.runAlreadyClaimed) productSqlite.prepare("INSERT INTO processing_runs (id, solution_id, user_id, run_type, status, attempt_count, started_at) VALUES (?, ?, ?, 'source_ingestion', 'running', 1, CURRENT_TIMESTAMP) ON CONFLICT(solution_id, run_type) DO UPDATE SET status = 'running', attempt_count = attempt_count + 1, error_code = NULL, started_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP").run(runId, solutionId, userId);
  try {
    const files = productSqlite.prepare("SELECT id, original_name, detected_format, storage_key, category FROM source_files WHERE solution_id = ? AND user_id = ? AND status = 'uploaded' ORDER BY created_at, id").all(solutionId, userId) as StoredFile[];
    const intake = productSqlite.prepare("SELECT purpose_primary, need_description, form_data FROM intake_drafts WHERE solution_id = ? AND user_id = ?").get(solutionId, userId) as { purpose_primary: string; need_description: string; form_data: string };
    const blocks: Array<SourceBlock & { sourceFileId: string | null }> = [];
    const workRoot = path.join(privateStorageRoot(), userId, solutionId, ".processing");
    await fs.mkdir(workRoot, { recursive: true, mode: 0o700 });
    for (const file of files.filter((item) => item.category === "content")) {
      const inputPath = path.join(workRoot, `${file.id}-${safeName(file.original_name)}`);
      const outputPath = path.join(workRoot, `${file.id}.jsonl`);
      const storedPath = storageKeyToPath(file.storage_key);
      await fs.copyFile(storedPath, inputPath);
      await execFileAsync(process.env.PRODUCT_PYTHON_PATH || "python3", [
        path.join(process.cwd(), "docs/product/v1-design/spikes/source-ingestion/extract_source_blocks.py"),
        "--input", inputPath, "--base", workRoot, "--output", outputPath,
      ], { timeout: 120000, maxBuffer: 2 * 1024 * 1024 });
      const lines = (await fs.readFile(outputPath, "utf8")).split("\n").filter(Boolean);
      blocks.push(...lines.map((line) => ({ ...(JSON.parse(line) as SourceBlock), sourceFileId: file.id })));
    }
    if (intake.need_description.trim()) {
      blocks.unshift({ id: randomUUID(), blockType: "intake_description", canonicalText: intake.need_description.trim(), locator: { field: "needDescription" }, contentHash: digest(intake.need_description.trim()), sourcePath: "intake", sourceFileId: null });
    }
    const intakeFields = normalizeIntakeFields(intake.purpose_primary, intake.form_data);
    for (const field of intakeFields.reverse()) {
      blocks.unshift({ id: randomUUID(), blockType: "intake_field", canonicalText: `${field.label}：${field.value}`, locator: { field: field.key }, contentHash: digest(`${field.key}:${field.value}`), sourcePath: "intake", sourceFileId: null });
    }
    const mediaRoutes = blocks.flatMap((block) => block.sourceFileId ? routeMediaBlock(block) : []);
    const pendingMedia = mediaRoutes.filter((route) => route.status === "queued");
    const distinctText = [...new Set(blocks.filter(isUsableTextBlock).map((block) => block.canonicalText.trim()).filter(Boolean))];
    const facts = distinctText.slice(0, 12).map((text, index) => ({ id: `FACT-${String(index + 1).padStart(3, "0")}`, text: text.slice(0, 500), sourceBlockId: blocks.find((block) => block.canonicalText.trim() === text)?.id }));
    const summary = facts.length ? `系统已从文字说明和材料中识别 ${facts.length} 条首批项目信息，正在进一步核对范围、用户、功能与约束。` : "材料已接收，暂未提取到可用文字，系统将进入图片或扫描件识别。";
    productSqlite.transaction(() => {
      if (options.workerId && !productSqlite.prepare("SELECT 1 FROM processing_runs WHERE solution_id = ? AND run_type = 'source_ingestion' AND status = 'running' AND lease_owner = ? AND lease_until > CURRENT_TIMESTAMP").get(solutionId, options.workerId)) throw new Error("SOURCE_LEASE_LOST");
      productSqlite.prepare("DELETE FROM media_analysis_tasks WHERE solution_id = ?").run(solutionId);
      productSqlite.prepare("DELETE FROM source_blocks WHERE solution_id = ?").run(solutionId);
      const insert = productSqlite.prepare("INSERT INTO source_blocks (id, solution_id, source_file_id, block_type, canonical_text, locator_json, content_hash, source_format, metadata_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");
      for (const block of blocks) insert.run(block.id, solutionId, block.sourceFileId, block.blockType, block.canonicalText, JSON.stringify(block.locator), block.contentHash, block.sourceFormat || null, JSON.stringify({ warnings: block.warnings || [], confidence: block.confidence ?? null, structuredData: block.structuredData ?? null, parser: block.parser ?? null }));
      const insertMedia = productSqlite.prepare(`INSERT INTO media_analysis_tasks
        (id, solution_id, source_file_id, source_block_id, route, fallback_route, status, requires_model, reason_codes_json, signals_json, input_hash)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
      for (const route of mediaRoutes) insertMedia.run(randomUUID(), solutionId, route.sourceFileId, route.sourceBlockId, route.route, route.fallbackRoute, route.status, route.requiresModel ? 1 : 0, JSON.stringify(route.reasonCodes), JSON.stringify(route.signals), route.inputHash);
      productSqlite.prepare("INSERT INTO solution_understandings (solution_id, summary, facts_json, source_block_count, status) VALUES (?, ?, ?, ?, 'ready') ON CONFLICT(solution_id) DO UPDATE SET summary = excluded.summary, facts_json = excluded.facts_json, source_block_count = excluded.source_block_count, status = 'ready', updated_at = CURRENT_TIMESTAMP").run(solutionId, summary, JSON.stringify(facts), blocks.length);
      productSqlite.prepare(`UPDATE processing_runs SET status = 'succeeded', lease_owner = NULL, lease_until = NULL, completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE solution_id = ? AND run_type = 'source_ingestion'${options.workerId ? " AND lease_owner = ?" : ""}`).run(solutionId, ...(options.workerId ? [options.workerId] : []));
      productSqlite.prepare("UPDATE product_solutions SET stage = ?, status = 'processing', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(pendingMedia.length ? "media_analysis" : "formal_analysis", solutionId);
    })();
    const unified = rebuildUnifiedKnowledge(solutionId);
    const freeAnalysis = await generateFreeAnalysis(solutionId, userId, unified.facts.slice(0, 24));
    const formalDocument = pendingMedia.length ? null : initializeFormalDocument(solutionId);
    await fs.rm(workRoot, { recursive: true, force: true });
    return { blockCount: blocks.length, factCount: unified.facts.length, conflictCount: unified.knowledge.stats.conflictCount, mediaTaskCount: mediaRoutes.length, pendingMediaTaskCount: pendingMedia.length, summary: unified.summary, freeAnalysisOrigin: freeAnalysis.origin, freeAnalysisModel: freeAnalysis.model, formalStatus: formalDocument?.status || null };
  } catch (error) {
    if (!(error instanceof Error && error.message === "SOURCE_LEASE_LOST")) {
      const run = productSqlite.prepare("SELECT attempt_count AS attemptCount FROM processing_runs WHERE solution_id = ? AND run_type = 'source_ingestion'").get(solutionId) as { attemptCount: number } | undefined;
      const maxAttempts = Math.min(10, Math.max(2, Number(process.env.PRODUCT_SOURCE_MAX_ATTEMPTS || 5)));
      const exhausted = Number(run?.attemptCount || 1) >= maxAttempts;
      const retryDelays = [5, 30, 120, 600];
      const retrySeconds = retryDelays[Math.min(Math.max(0, Number(run?.attemptCount || 1) - 1), retryDelays.length - 1)];
      productSqlite.prepare(`UPDATE processing_runs SET status = ?, lease_owner = NULL, lease_until = NULL, error_code = ?,
        next_attempt_at = CASE WHEN ? = 'failed' THEN NULL ELSE datetime('now', ?) END,
        completed_at = CASE WHEN ? = 'failed' THEN CURRENT_TIMESTAMP ELSE NULL END, updated_at = CURRENT_TIMESTAMP
        WHERE solution_id = ? AND run_type = 'source_ingestion'${options.workerId ? " AND lease_owner = ?" : ""}`).run(exhausted ? "failed" : "retry_wait", exhausted ? "SOURCE_RETRY_EXHAUSTED" : "SOURCE_INGESTION_FAILED", exhausted ? "failed" : "retry_wait", `+${retrySeconds} seconds`, exhausted ? "failed" : "retry_wait", solutionId, ...(options.workerId ? [options.workerId] : []));
      productSqlite.prepare("UPDATE product_solutions SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(exhausted ? "blocked" : "recovering", solutionId);
    }
    throw error;
  }
}

export function enqueueSourceProcessing(solutionId: string, userId: string) {
  const pending = productSqlite.prepare("SELECT COUNT(*) AS count FROM source_files WHERE solution_id = ? AND user_id = ? AND category = 'content' AND status IN ('waiting_upload', 'failed')").get(solutionId, userId) as { count: number };
  if (pending.count) throw new Error("MATERIAL_UPLOAD_PENDING");
  const existing = productSqlite.prepare("SELECT status, attempt_count AS attemptCount FROM processing_runs WHERE solution_id = ? AND run_type = 'source_ingestion'").get(solutionId) as { status: string; attemptCount: number } | undefined;
  if (existing && ["queued", "running", "succeeded"].includes(existing.status)) return { status: existing.status, attemptCount: existing.attemptCount, enqueued: false };
  productSqlite.prepare(`INSERT INTO processing_runs (id, solution_id, user_id, run_type, status, attempt_count)
    VALUES (?, ?, ?, 'source_ingestion', 'queued', 0)
    ON CONFLICT(solution_id, run_type) DO UPDATE SET status = 'queued', attempt_count = 0, lease_owner = NULL, lease_until = NULL, next_attempt_at = NULL, error_code = NULL, completed_at = NULL, updated_at = CURRENT_TIMESTAMP`).run(randomUUID(), solutionId, userId);
  productSqlite.prepare("UPDATE product_solutions SET status = 'processing', stage = 'quick_understanding', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(solutionId);
  return { status: "queued", attemptCount: existing?.attemptCount || 0, enqueued: true };
}

export async function processSourceBatch(limit = 1) {
  const recovered = recoverStaleSourceProcessing();
  const repaired = repairExhaustedSourceProcessing();
  const workerId = `source-${randomUUID()}`;
  const configured = Math.max(1, Number(process.env.PRODUCT_SOURCE_BATCH_CONCURRENCY || 2));
  const safeLimit = Math.min(8, configured, Math.max(1, Math.floor(limit)));
  const results = await Promise.all(Array.from({ length: safeLimit }, () => processNextSourceTask(workerId)));
  return { workerId, requested: safeLimit, processed: results.filter((item) => item.status === "processed" || item.status === "failed").length, recovered, repaired, results };
}

async function processNextSourceTask(workerId: string) {
  const userConcurrency = Math.max(1, Math.floor(Number(process.env.PRODUCT_SOURCE_USER_CONCURRENCY || 2)));
  const next = productSqlite.prepare(`SELECT r.solution_id AS solutionId, r.user_id AS userId FROM processing_runs r
    JOIN product_solutions s ON s.id = r.solution_id
    WHERE r.run_type = 'source_ingestion' AND r.status IN ('queued','retry_wait') AND (r.next_attempt_at IS NULL OR r.next_attempt_at <= CURRENT_TIMESTAMP) AND s.status NOT IN ('deletion_pending','deleted')
      AND (SELECT COUNT(*) FROM processing_runs active WHERE active.user_id = r.user_id AND active.run_type = 'source_ingestion' AND active.status = 'running' AND active.lease_until > CURRENT_TIMESTAMP) < ?
    ORDER BY r.updated_at, r.solution_id LIMIT 1`).get(userConcurrency) as { solutionId: string; userId: string } | undefined;
  if (!next) return { status: "idle" };
  const leaseSeconds = Math.max(180, Number(process.env.PRODUCT_SOURCE_LEASE_SECONDS || 900));
  const claim = productSqlite.prepare("UPDATE processing_runs SET status = 'running', attempt_count = attempt_count + 1, lease_owner = ?, lease_until = datetime('now', ?), next_attempt_at = NULL, error_code = NULL, started_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE solution_id = ? AND run_type = 'source_ingestion' AND status IN ('queued','retry_wait') AND (next_attempt_at IS NULL OR next_attempt_at <= CURRENT_TIMESTAMP)").run(workerId, `+${leaseSeconds} seconds`, next.solutionId);
  if (!claim.changes) return { status: "contended", solutionId: next.solutionId };
  try {
    const result = await processSolution(next.solutionId, next.userId, { runAlreadyClaimed: true, workerId });
    return { status: "processed", solutionId: next.solutionId, result };
  } catch (error) { const leaseLost = error instanceof Error && error.message === "SOURCE_LEASE_LOST"; return { status: leaseLost ? "lease_lost" : "failed", solutionId: next.solutionId, errorCode: leaseLost ? "SOURCE_LEASE_LOST" : "SOURCE_INGESTION_FAILED" }; }
}

function recoverStaleSourceProcessing() {
  const seconds = Math.max(180, Number(process.env.PRODUCT_SOURCE_STALE_AFTER_SECONDS || 900));
  return productSqlite.prepare("UPDATE processing_runs SET status = 'queued', lease_owner = NULL, lease_until = NULL, error_code = 'STALE_WORK_RECOVERED', updated_at = CURRENT_TIMESTAMP WHERE run_type = 'source_ingestion' AND status = 'running' AND (lease_until < CURRENT_TIMESTAMP OR (lease_until IS NULL AND updated_at < datetime('now', ?)))").run(`-${seconds} seconds`).changes;
}

function repairExhaustedSourceProcessing() {
  const seconds = Math.min(604800, Math.max(3600, Number(process.env.PRODUCT_SOURCE_AUTO_REPAIR_SECONDS || 21600)));
  return productSqlite.transaction(() => {
    const solutions = productSqlite.prepare(`SELECT solution_id AS solutionId FROM processing_runs WHERE run_type = 'source_ingestion' AND status = 'failed' AND completed_at <= datetime('now', ?)`).all(`-${seconds} seconds`) as Array<{ solutionId: string }>;
    if (!solutions.length) return 0;
    const repaired = productSqlite.prepare(`UPDATE processing_runs SET status = 'retry_wait', attempt_count = 0, error_code = 'SOURCE_AUTO_REPAIR', next_attempt_at = CURRENT_TIMESTAMP, completed_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE run_type = 'source_ingestion' AND status = 'failed' AND completed_at <= datetime('now', ?)`).run(`-${seconds} seconds`).changes;
    const restore = productSqlite.prepare("UPDATE product_solutions SET status = 'recovering', stage = 'quick_understanding', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'blocked'");
    for (const solution of solutions) restore.run(solution.solutionId);
    return repaired;
  })();
}

function storageKeyToPath(key: string) {
  const parts = key.split("/");
  if (parts.length !== 4 || parts[0] !== "private" || parts.slice(1).some((part) => !/^[0-9a-f-]{36}$/i.test(part))) throw new Error("INVALID_STORAGE_KEY");
  return path.join(privateStorageRoot(), ...parts.slice(1));
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
