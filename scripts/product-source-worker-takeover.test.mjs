import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const typescript = require("typescript");
const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ningyi-source-takeover-test-"));
process.env.PRODUCT_DB_PATH = path.join(tempDir, "product.db");
process.env.PRODUCT_PRIVATE_STORAGE_PATH = path.join(tempDir, "private");
process.env.OPENAI_API_KEY = "";
require.extensions[".ts"] = (module, filename) => {
  const source = require("node:fs").readFileSync(filename, "utf8");
  module._compile(typescript.transpileModule(source, { compilerOptions: { module: typescript.ModuleKind.CommonJS, target: typescript.ScriptTarget.ES2022, esModuleInterop: true }, fileName: filename }).outputText, filename);
};

const { productSqlite } = require("../lib/product/db.ts");
const { processSourceBatch } = require("../lib/product/process-solution.ts");
const userId = "90000000-0000-4000-8000-000000000021";
const solutionId = "10000000-0000-4000-8000-000000000021";

test.after(async () => {
  productSqlite.close();
  await fs.rm(tempDir, { recursive: true, force: true });
});

test("新解析 Worker 接管过期租约后完成文字需求处理且不调用外部模型", async () => {
  productSqlite.prepare("INSERT INTO product_users (id, username, username_normalized, password_hash) VALUES (?, 'source-takeover', 'source-takeover', 'test')").run(userId);
  productSqlite.prepare("INSERT INTO product_solutions (id, owner_user_id, title, status, stage) VALUES (?, ?, '解析接管方案', 'processing', 'quick_understanding')").run(solutionId, userId);
  productSqlite.prepare(`INSERT INTO intake_drafts
    (id, user_id, solution_id, purpose_primary, need_description, form_data)
    VALUES ('40000000-0000-4000-8000-000000000021', ?, ?, '内部立项', '需要建立一套可追溯的项目方案生成流程。', '{}')`).run(userId, solutionId);
  productSqlite.prepare(`INSERT INTO processing_runs
    (id, solution_id, user_id, run_type, status, attempt_count, lease_owner, lease_until)
    VALUES ('60000000-0000-4000-8000-000000000021', ?, ?, 'source_ingestion', 'running', 1, 'old-source-worker', datetime('now', '-10 seconds'))`).run(solutionId, userId);

  const result = await processSourceBatch(1);
  assert.equal(result.recovered, 1);
  assert.equal(result.processed, 1);
  assert.equal(result.results[0].status, "processed");
  assert.deepEqual(productSqlite.prepare("SELECT status, attempt_count AS attemptCount, lease_owner AS leaseOwner, lease_until AS leaseUntil FROM processing_runs WHERE solution_id = ?").get(solutionId), {
    status: "succeeded", attemptCount: 2, leaseOwner: null, leaseUntil: null,
  });
  assert.equal(productSqlite.prepare("SELECT status FROM solution_understandings WHERE solution_id = ?").get(solutionId).status, "ready");
  const freeAnalysis = productSqlite.prepare("SELECT origin, provider FROM free_analyses WHERE solution_id = ?").get(solutionId);
  assert.equal(freeAnalysis.provider, "deterministic");
  assert.match(freeAnalysis.origin, /deterministic_fallback$/);
  assert.equal(productSqlite.prepare("SELECT status FROM formal_documents WHERE solution_id = ?").get(solutionId).status, "awaiting_configuration");
});
