import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const typescript = require("typescript");
const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ningyi-formal-work-repository-"));
process.env.PRODUCT_DB_PATH = path.join(tempDir, "product.db");
require.extensions[".ts"] = (module, filename) => {
  const source = require("node:fs").readFileSync(filename, "utf8");
  module._compile(typescript.transpileModule(source, { compilerOptions: { module: typescript.ModuleKind.CommonJS, target: typescript.ScriptTarget.ES2022, esModuleInterop: true }, fileName: filename }).outputText, filename);
};

const { productSqlite } = require("../lib/product/db.ts");
const { SqliteFormalWorkRepository } = require("../lib/product/sqlite-formal-work-repository.ts");
const repository = new SqliteFormalWorkRepository();
const userId = "90000000-0000-4000-8000-000000000061";

test.after(async () => {
  productSqlite.close();
  await fs.rm(tempDir, { recursive: true, force: true });
});

test("渲染任务原子领取且只有租约所有者能够记录失败退避", async () => {
  const solutionId = seedSolution("1", "processing", "rendering");
  const claim = await repository.claimRendering("render-worker", 1, 900);
  assert.equal(claim.status, "claimed");
  assert.equal(claim.work.solutionId, solutionId);
  assert.equal(await repository.renderAttemptCount(solutionId, "render-worker"), 1);
  assert.equal(await repository.recordRenderFailure({ solutionId, workerId: "other-worker", exhausted: false, retrySeconds: 30, errorCode: "TEST_FAILURE" }), false);
  assert.equal(await repository.recordRenderFailure({ solutionId, workerId: "render-worker", exhausted: false, retrySeconds: 30, errorCode: "TEST_FAILURE" }), true);
  const state = productSqlite.prepare("SELECT status, stage, render_error_code AS errorCode, render_lease_owner AS leaseOwner FROM product_solutions WHERE id = ?").get(solutionId);
  assert.deepEqual(state, { status: "recovering", stage: "rendering", errorCode: "TEST_FAILURE", leaseOwner: null });
});

test("已标记完成但成果不齐的方案会重新进入渲染队列", async () => {
  const solutionId = seedSolution("2", "completed", "completed");
  assert.equal(await repository.requeueIncompleteDeliveries(["formal_solution_docx", "formal_solution_pdf"], 10), 1);
  const state = productSqlite.prepare("SELECT status, stage, render_error_code AS errorCode FROM product_solutions WHERE id = ?").get(solutionId);
  assert.deepEqual(state, { status: "recovering", stage: "rendering", errorCode: "DELIVERABLE_CONTRACT_RECONCILE" });
});

function seedSolution(suffix, status, stage) {
  const solutionId = `10000000-0000-4000-8000-${suffix.padStart(12, "0")}`;
  productSqlite.prepare("INSERT OR IGNORE INTO product_users (id, username, username_normalized, password_hash) VALUES (?, 'formal-work-owner', 'formal-work-owner', 'test')").run(userId);
  productSqlite.prepare("INSERT INTO product_solutions (id, owner_user_id, title, status, stage) VALUES (?, ?, '正式生成仓储测试', ?, ?)").run(solutionId, userId, status, stage);
  productSqlite.prepare("INSERT INTO formal_documents (solution_id, status, provider, model) VALUES (?, 'completed', 'openai', 'test-model')").run(solutionId);
  return solutionId;
}
