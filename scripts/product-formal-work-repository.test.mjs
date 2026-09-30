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

test("正式文档生命周期通过仓储完成初始化、状态读取和过期租约恢复", async () => {
  const solutionId = `10000000-0000-4000-8000-${"3".padStart(12, "0")}`;
  const sectionId = "73000000-0000-4000-8000-000000000063";
  productSqlite.prepare("INSERT OR IGNORE INTO product_users (id, username, username_normalized, password_hash) VALUES (?, 'formal-work-owner', 'formal-work-owner', 'test')").run(userId);
  productSqlite.prepare("INSERT INTO product_solutions (id, owner_user_id, title, status, stage) VALUES (?, ?, '正式文档生命周期测试', 'processing', 'formal_analysis')").run(solutionId, userId);
  await repository.initializeDocument({
    solutionId,
    provider: "openai",
    model: "test-model",
    configured: true,
    outline: [{ id: sectionId, sectionIndex: 0, sectionKey: "project_overview", title: "项目背景与目标" }],
  });
  const initial = await repository.documentState(solutionId);
  assert.equal(initial.status, "pending");
  assert.equal(initial.provider, "openai");
  assert.deepEqual(initial.sections.map(({ sectionIndex, sectionKey, title, status }) => ({ sectionIndex, sectionKey, title, status })), [
    { sectionIndex: 0, sectionKey: "project_overview", title: "项目背景与目标", status: "pending" },
  ]);
  productSqlite.prepare("UPDATE formal_documents SET status = 'generating' WHERE solution_id = ?").run(solutionId);
  productSqlite.prepare("UPDATE formal_sections SET status = 'generating', lease_owner = 'expired-worker', lease_until = datetime('now', '-10 seconds') WHERE id = ?").run(sectionId);
  productSqlite.prepare("INSERT INTO formal_section_attempts (id, solution_id, section_id, attempt_no, status) VALUES ('74000000-0000-4000-8000-000000000063', ?, ?, 1, 'running')").run(solutionId, sectionId);
  assert.equal(await repository.recoverStaleFormal(solutionId, 900), 1);
  assert.deepEqual(productSqlite.prepare("SELECT status, lease_owner AS leaseOwner, lease_until AS leaseUntil FROM formal_sections WHERE id = ?").get(sectionId), { status: "pending", leaseOwner: null, leaseUntil: null });
  assert.deepEqual(productSqlite.prepare("SELECT status, last_error_code AS lastErrorCode FROM formal_documents WHERE solution_id = ?").get(solutionId), { status: "pending", lastErrorCode: "STALE_WORK_RECOVERED" });
  assert.deepEqual(productSqlite.prepare("SELECT status, error_code AS errorCode FROM formal_section_attempts WHERE section_id = ?").get(sectionId), { status: "failed", errorCode: "WORKER_INTERRUPTED" });
});

test("章节上下文快照只返回当前方案的有效材料、前序章节和最近失败反馈", async () => {
  const solutionId = `10000000-0000-4000-8000-${"4".padStart(12, "0")}`;
  const sectionIds = ["73000000-0000-4000-8000-000000000064", "73000000-0000-4000-8000-000000000065"];
  const sourceId = "71000000-0000-4000-8000-000000000064";
  const factId = "72000000-0000-4000-8000-000000000064";
  productSqlite.prepare("INSERT OR IGNORE INTO product_users (id, username, username_normalized, password_hash) VALUES (?, 'formal-work-owner', 'formal-work-owner', 'test')").run(userId);
  productSqlite.prepare("INSERT INTO product_solutions (id, owner_user_id, title, status, stage) VALUES (?, ?, '正式章节上下文测试', 'processing', 'formal_analysis')").run(solutionId, userId);
  await repository.initializeDocument({
    solutionId, provider: "openai", model: "test-model", configured: true,
    outline: [
      { id: sectionIds[0], sectionIndex: 0, sectionKey: "project_overview", title: "项目背景与目标" },
      { id: sectionIds[1], sectionIndex: 1, sectionKey: "scope_users", title: "范围、用户与关键约束" },
    ],
  });
  productSqlite.prepare("UPDATE formal_sections SET status = 'validated', summary = '前序摘要', structured_items_json = ? WHERE id = ?").run('[{"code":"REQ-1","kind":"requirement","title":"审计"}]', sectionIds[0]);
  productSqlite.prepare("INSERT INTO source_blocks (id, solution_id, block_type, canonical_text, locator_json, content_hash) VALUES (?, ?, 'text', '本方案要求完整记录审计过程。', '{}', 'formal-context-source')").run(sourceId, solutionId);
  productSqlite.prepare("INSERT INTO project_user_facts (id, solution_id, user_id, text, status) VALUES (?, ?, ?, '用户确认保留完整审计日志。', 'active')").run(factId, solutionId, userId);
  productSqlite.prepare("INSERT INTO formal_section_attempts (id, solution_id, section_id, attempt_no, status, error_code, quality_json) VALUES ('74000000-0000-4000-8000-000000000064', ?, ?, 1, 'failed', 'UNKNOWN_CITATION', '{}')").run(solutionId, sectionIds[1]);
  const data = await repository.sectionContextData(solutionId, "scope_users");
  assert.deepEqual(data.blocks.map(({ id }) => id), [sourceId, factId]);
  assert.deepEqual(data.prior, [{ title: "项目背景与目标", summary: "前序摘要", structuredItemsJson: '[{"code":"REQ-1","kind":"requirement","title":"审计"}]' }]);
  assert.deepEqual(data.retry, { attemptNo: 1, errorCode: "UNKNOWN_CITATION", qualityJson: "{}" });
});

test("正式章节领取原子记录租约、模型调用与尝试，且阻止重复领取", async () => {
  const solutionId = `10000000-0000-4000-8000-${"5".padStart(12, "0")}`;
  const sectionId = "73000000-0000-4000-8000-000000000066";
  productSqlite.prepare("INSERT OR IGNORE INTO product_users (id, username, username_normalized, password_hash) VALUES (?, 'formal-work-owner', 'formal-work-owner', 'test')").run(userId);
  productSqlite.prepare("INSERT INTO product_solutions (id, owner_user_id, title, status, stage) VALUES (?, ?, '正式章节领取测试', 'processing', 'formal_analysis')").run(solutionId, userId);
  await repository.initializeDocument({ solutionId, provider: "openai", model: "test-model", configured: true, outline: [{ id: sectionId, sectionIndex: 0, sectionKey: "project_overview", title: "项目背景与目标" }] });
  const input = { solutionId, sectionId, workerId: "claim-worker", leaseSeconds: 600, contextHash: "context-hash", contextManifestJson: "{}", callId: "75000000-0000-4000-8000-000000000066", attemptId: "74000000-0000-4000-8000-000000000066", provider: "openai", model: "test-model", modelVersion: "v1", promptVersion: "p1", parserVersion: "s1", configurationHash: "config-hash", maxAttempts: 3 };
  const claim = await repository.claimFormalSection(input);
  assert.equal(claim.status, "claimed");
  if (claim.status !== "claimed") return;
  assert.equal(claim.attemptNo, 1);
  assert.equal(claim.cycleAttemptNo, 1);
  assert.deepEqual(productSqlite.prepare("SELECT status, current_section AS currentSection FROM formal_documents WHERE solution_id = ?").get(solutionId), { status: "generating", currentSection: 0 });
  assert.deepEqual(productSqlite.prepare("SELECT status, lease_owner AS leaseOwner, context_hash AS contextHash FROM formal_sections WHERE id = ?").get(sectionId), { status: "generating", leaseOwner: "claim-worker", contextHash: "context-hash" });
  assert.deepEqual(productSqlite.prepare("SELECT status, purpose, configuration_hash AS configurationHash FROM model_calls WHERE id = ?").get(input.callId), { status: "running", purpose: "formal_section:project_overview", configurationHash: "config-hash" });
  assert.deepEqual(productSqlite.prepare("SELECT status, attempt_no AS attemptNo FROM formal_section_attempts WHERE id = ?").get(input.attemptId), { status: "running", attemptNo: 1 });
  assert.deepEqual(await repository.claimFormalSection({ ...input, callId: "75000000-0000-4000-8000-000000000067", attemptId: "74000000-0000-4000-8000-000000000067" }), { status: "idle" });
});

function seedSolution(suffix, status, stage) {
  const solutionId = `10000000-0000-4000-8000-${suffix.padStart(12, "0")}`;
  productSqlite.prepare("INSERT OR IGNORE INTO product_users (id, username, username_normalized, password_hash) VALUES (?, 'formal-work-owner', 'formal-work-owner', 'test')").run(userId);
  productSqlite.prepare("INSERT INTO product_solutions (id, owner_user_id, title, status, stage) VALUES (?, ?, '正式生成仓储测试', ?, ?)").run(solutionId, userId, status, stage);
  productSqlite.prepare("INSERT INTO formal_documents (solution_id, status, provider, model) VALUES (?, 'completed', 'openai', 'test-model')").run(solutionId);
  return solutionId;
}
