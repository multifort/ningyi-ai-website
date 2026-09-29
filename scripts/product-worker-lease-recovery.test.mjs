import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const typescript = require("typescript");
const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ningyi-worker-lease-test-"));
process.env.PRODUCT_DB_PATH = path.join(tempDir, "product.db");
process.env.PRODUCT_PRIVATE_STORAGE_PATH = path.join(tempDir, "private");
require.extensions[".ts"] = (module, filename) => {
  const source = require("node:fs").readFileSync(filename, "utf8");
  module._compile(typescript.transpileModule(source, { compilerOptions: { module: typescript.ModuleKind.CommonJS, target: typescript.ScriptTarget.ES2022, esModuleInterop: true }, fileName: filename }).outputText, filename);
};

const { productSqlite } = require("../lib/product/db.ts");
const { recoverStaleSourceProcessing } = require("../lib/product/process-solution.ts");
const { recoverStaleMediaTasks } = require("../lib/product/media-analysis.ts");
const { recoverStaleFormalWork } = require("../lib/product/formal-analysis.ts");
const { recoverStaleRendering } = require("../lib/product/formal-worker.ts");

const userId = "90000000-0000-4000-8000-000000000011";
const solutionId = "10000000-0000-4000-8000-000000000011";
const sourceFileId = "70000000-0000-4000-8000-000000000011";
const sourceBlockId = "71000000-0000-4000-8000-000000000011";
const mediaTaskId = "72000000-0000-4000-8000-000000000011";
const sectionId = "73000000-0000-4000-8000-000000000011";

test.after(async () => {
  productSqlite.close();
  await fs.rm(tempDir, { recursive: true, force: true });
});

test("解析、媒体、正式章节和渲染的过期租约都恢复为可接管状态", async () => {
  productSqlite.prepare("INSERT INTO product_users (id, username, username_normalized, password_hash) VALUES (?, 'lease-recovery', 'lease-recovery', 'test')").run(userId);
  productSqlite.prepare(`INSERT INTO product_solutions
    (id, owner_user_id, title, status, stage, render_lease_owner, render_lease_until)
    VALUES (?, ?, '租约恢复方案', 'rendering', 'rendering', 'old-render-worker', datetime('now', '-10 seconds'))`).run(solutionId, userId);
  productSqlite.prepare(`INSERT INTO processing_runs
    (id, solution_id, user_id, run_type, status, attempt_count, lease_owner, lease_until)
    VALUES ('60000000-0000-4000-8000-000000000011', ?, ?, 'source_ingestion', 'running', 1, 'old-source-worker', datetime('now', '-10 seconds'))`).run(solutionId, userId);
  productSqlite.prepare(`INSERT INTO source_files
    (id, solution_id, user_id, client_key, category, original_name, size_bytes, storage_key, status)
    VALUES (?, ?, ?, 'lease-file', 'content', 'source.txt', 1, ?, 'uploaded')`).run(sourceFileId, solutionId, userId, `private/${userId}/${solutionId}/${sourceFileId}`);
  productSqlite.prepare(`INSERT INTO source_blocks
    (id, solution_id, source_file_id, block_type, canonical_text, locator_json, content_hash)
    VALUES (?, ?, ?, 'text', '测试内容', '{}', 'hash')`).run(sourceBlockId, solutionId, sourceFileId);
  productSqlite.prepare(`INSERT INTO media_analysis_tasks
    (id, solution_id, source_file_id, source_block_id, route, fallback_route, status, reason_codes_json, signals_json, input_hash, lease_owner, lease_until)
    VALUES (?, ?, ?, ?, 'ocr_standard', 'vision_low_cost', 'processing', '[]', '{}', 'hash', 'old-media-worker', datetime('now', '-10 seconds'))`).run(mediaTaskId, solutionId, sourceFileId, sourceBlockId);
  productSqlite.prepare("INSERT INTO formal_documents (solution_id, status, provider, model) VALUES (?, 'generating', 'openai', 'test-model')").run(solutionId);
  productSqlite.prepare(`INSERT INTO formal_sections
    (id, solution_id, section_index, section_key, title, status, lease_owner, lease_until)
    VALUES (?, ?, 0, 'overview', '项目概述', 'generating', 'old-formal-worker', datetime('now', '-10 seconds'))`).run(sectionId, solutionId);
  productSqlite.prepare(`INSERT INTO formal_section_attempts
    (id, solution_id, section_id, attempt_no, status)
    VALUES ('74000000-0000-4000-8000-000000000011', ?, ?, 1, 'running')`).run(solutionId, sectionId);

  assert.equal(await recoverStaleSourceProcessing(), 1);
  assert.equal(await recoverStaleMediaTasks(), 1);
  assert.equal(recoverStaleFormalWork(solutionId), 1);
  assert.equal(recoverStaleRendering(), 1);

  assert.deepEqual(productSqlite.prepare("SELECT status, lease_owner AS leaseOwner, lease_until AS leaseUntil, error_code AS errorCode FROM processing_runs WHERE solution_id = ?").get(solutionId), {
    status: "queued", leaseOwner: null, leaseUntil: null, errorCode: "STALE_WORK_RECOVERED",
  });
  assert.deepEqual(productSqlite.prepare("SELECT status, lease_owner AS leaseOwner, lease_until AS leaseUntil, error_code AS errorCode FROM media_analysis_tasks WHERE id = ?").get(mediaTaskId), {
    status: "queued", leaseOwner: null, leaseUntil: null, errorCode: "STALE_WORK_RECOVERED",
  });
  assert.deepEqual(productSqlite.prepare("SELECT status, lease_owner AS leaseOwner, lease_until AS leaseUntil FROM formal_sections WHERE id = ?").get(sectionId), {
    status: "pending", leaseOwner: null, leaseUntil: null,
  });
  assert.deepEqual(productSqlite.prepare("SELECT status, last_error_code AS lastErrorCode FROM formal_documents WHERE solution_id = ?").get(solutionId), {
    status: "pending", lastErrorCode: "STALE_WORK_RECOVERED",
  });
  assert.deepEqual(productSqlite.prepare("SELECT status, error_code AS errorCode FROM formal_section_attempts WHERE section_id = ?").get(sectionId), {
    status: "failed", errorCode: "WORKER_INTERRUPTED",
  });
  assert.deepEqual(productSqlite.prepare("SELECT status, render_lease_owner AS leaseOwner, render_lease_until AS leaseUntil, render_error_code AS errorCode FROM product_solutions WHERE id = ?").get(solutionId), {
    status: "recovering", leaseOwner: null, leaseUntil: null, errorCode: "STALE_RENDER_RECOVERED",
  });
});
