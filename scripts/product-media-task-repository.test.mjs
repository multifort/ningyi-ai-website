import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const typescript = require("typescript");
const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ningyi-media-repository-"));
process.env.PRODUCT_DB_PATH = path.join(tempDir, "product.db");
require.extensions[".ts"] = (module, filename) => {
  const source = require("node:fs").readFileSync(filename, "utf8");
  module._compile(typescript.transpileModule(source, { compilerOptions: { module: typescript.ModuleKind.CommonJS, target: typescript.ScriptTarget.ES2022, esModuleInterop: true }, fileName: filename }).outputText, filename);
};

const { productSqlite } = require("../lib/product/db.ts");
const { SqliteMediaTaskRepository } = require("../lib/product/sqlite-media-task-repository.ts");
const repository = new SqliteMediaTaskRepository();
const userId = "90000000-0000-4000-8000-000000000051";

test.after(async () => {
  productSqlite.close();
  await fs.rm(tempDir, { recursive: true, force: true });
});

test("媒体仓储以租约围栏提交识别结果并返回剩余任务数", async () => {
  const task = seedMediaTask("1");
  assert.equal((await repository.findNext(2)).id, task.id);
  assert.equal(await repository.claim(task.id, "media-worker", 900), true);
  const remaining = await repository.complete(task, "media-worker", { canonicalText: "识别后的项目事实", contentHash: "hash-after", confidence: 0.98, provider: "test", model: "ocr-test" });
  assert.equal(remaining, 0);
  assert.deepEqual(productSqlite.prepare("SELECT status, lease_owner AS leaseOwner FROM media_analysis_tasks WHERE id = ?").get(task.id), { status: "completed", leaseOwner: null });
  const block = productSqlite.prepare("SELECT canonical_text AS canonicalText, content_hash AS contentHash, metadata_json AS metadataJson FROM source_blocks WHERE id = ?").get(task.sourceBlockId);
  assert.equal(block.canonicalText, "识别后的项目事实");
  assert.equal(block.contentHash, "hash-after");
  assert.equal(JSON.parse(block.metadataJson).mediaAnalysis.provider, "test");
});

test("媒体仓储只允许租约所有者调度回退并在回退耗尽后阻断方案", async () => {
  const task = seedMediaTask("2");
  assert.equal(await repository.claim(task.id, "media-worker", 900), true);
  assert.equal(await repository.scheduleFallback(task.id, "other-worker", "vision_low_cost", "vision_premium", "OCR_FAILED"), false);
  assert.equal(await repository.scheduleFallback(task.id, "media-worker", "vision_low_cost", "vision_premium", "OCR_FAILED"), true);
  const queued = productSqlite.prepare("SELECT status, route, fallback_route AS fallbackRoute FROM media_analysis_tasks WHERE id = ?").get(task.id);
  assert.deepEqual(queued, { status: "queued", route: "vision_low_cost", fallbackRoute: "vision_premium" });
  assert.equal(await repository.claim(task.id, "media-worker-2", 900), true);
  const failed = await repository.recordTerminalFailure({ ...task, route: "vision_low_cost" }, "media-worker-2", "VISION_FAILED");
  assert.deepEqual(failed, { owned: true, terminal: true });
  assert.equal(productSqlite.prepare("SELECT status FROM product_solutions WHERE id = ?").get(task.solutionId).status, "blocked");
});

function seedMediaTask(suffix) {
  const solutionId = `10000000-0000-4000-8000-${suffix.padStart(12, "0")}`;
  const fileId = `70000000-0000-4000-8000-${suffix.padStart(12, "0")}`;
  const blockId = `71000000-0000-4000-8000-${suffix.padStart(12, "0")}`;
  const taskId = `72000000-0000-4000-8000-${suffix.padStart(12, "0")}`;
  productSqlite.prepare("INSERT OR IGNORE INTO product_users (id, username, username_normalized, password_hash) VALUES (?, 'media-owner', 'media-owner', 'test')").run(userId);
  productSqlite.prepare("INSERT INTO product_solutions (id, owner_user_id, title, status, stage) VALUES (?, ?, '媒体仓储测试', 'processing', 'media_analysis')").run(solutionId, userId);
  productSqlite.prepare("INSERT INTO source_files (id, solution_id, user_id, client_key, category, original_name, detected_format, size_bytes, storage_key, status) VALUES (?, ?, ?, ?, 'content', 'scan.png', 'png', 4, ?, 'uploaded')").run(fileId, solutionId, userId, `media-${suffix}`, `private/${userId}/${solutionId}/${fileId}`);
  productSqlite.prepare("INSERT INTO source_blocks (id, solution_id, source_file_id, block_type, canonical_text, locator_json, content_hash, source_format, metadata_json) VALUES (?, ?, ?, 'image', '', '{}', 'hash-before', 'image', '{}')").run(blockId, solutionId, fileId);
  productSqlite.prepare("INSERT INTO media_analysis_tasks (id, solution_id, source_file_id, source_block_id, route, fallback_route, status, requires_model, reason_codes_json, signals_json, input_hash) VALUES (?, ?, ?, ?, 'ocr_standard', 'vision_low_cost', 'queued', 0, '[]', '{}', 'input-hash')").run(taskId, solutionId, fileId, blockId);
  return { id: taskId, solutionId, sourceFileId: fileId, sourceBlockId: blockId, route: "ocr_standard", fallbackRoute: "vision_low_cost", attemptCount: 0, userId, detectedFormat: "png", storageKey: `private/${userId}/${solutionId}/${fileId}`, originalName: "scan.png", metadataJson: "{}" };
}
