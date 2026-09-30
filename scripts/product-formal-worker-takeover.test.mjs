import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const typescript = require("typescript");
const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ningyi-formal-takeover-test-"));
process.env.PRODUCT_DB_PATH = path.join(tempDir, "product.db");
process.env.PRODUCT_PRIVATE_STORAGE_PATH = path.join(tempDir, "private");
process.env.PRODUCT_MODEL_EXECUTION_WINDOW_ENABLED = "false";
process.env.PRODUCT_FORMAL_MODEL_PROVIDER = "openai";
process.env.PRODUCT_FORMAL_MODEL = "test-model";
process.env.OPENAI_API_KEY = "test-key-not-used";
require.extensions[".ts"] = (module, filename) => {
  const source = require("node:fs").readFileSync(filename, "utf8");
  module._compile(typescript.transpileModule(source, { compilerOptions: { module: typescript.ModuleKind.CommonJS, target: typescript.ScriptTarget.ES2022, esModuleInterop: true }, fileName: filename }).outputText, filename);
};

const { productSqlite } = require("../lib/product/db.ts");
const { rebuildUnifiedKnowledge } = require("../lib/product/unified-knowledge.ts");
const { continueFormalDocument, initializeFormalDocument } = require("../lib/product/formal-analysis.ts");
const userId = "90000000-0000-4000-8000-000000000031";
const solutionId = "10000000-0000-4000-8000-000000000031";
const sourceBlockId = "71000000-0000-4000-8000-000000000031";

test.after(async () => {
  productSqlite.close();
  await fs.rm(tempDir, { recursive: true, force: true });
});

test("旧正式生成 Worker 的晚到模型结果不能覆盖新租约所有者", async () => {
  const originalFetch = globalThis.fetch;
  try {
    productSqlite.prepare("INSERT INTO product_users (id, username, username_normalized, password_hash) VALUES (?, 'formal-takeover', 'formal-takeover', 'test')").run(userId);
    productSqlite.prepare("INSERT INTO product_solutions (id, owner_user_id, title, status, stage) VALUES (?, ?, '正式生成接管方案', 'processing', 'formal_analysis')").run(solutionId, userId);
    productSqlite.prepare(`INSERT INTO source_blocks
      (id, solution_id, block_type, canonical_text, locator_json, content_hash, source_format)
      VALUES (?, ?, 'intake_description', '建设可追溯的项目方案生成流程，所有正式结论必须引用原始需求材料，并支持 Worker 故障后的安全接管。', '{}', 'formal-takeover-hash', 'text')`).run(sourceBlockId, solutionId);
    rebuildUnifiedKnowledge(solutionId);
    await initializeFormalDocument(solutionId);

    const generated = {
      content: "项目目标是建立一套稳定、可追溯的方案生成流程。系统以用户提交的需求材料作为唯一事实依据，对材料内容进行结构化归并，并在正式方案中保留来源引用。方案生成过程采用带租约的后台任务，每个章节在提交前都要确认当前 Worker 仍然持有有效租约，避免故障恢复期间出现重复提交。系统需要记录模型调用、章节尝试和质量检查结果，使运维人员能够区分正常失败、租约丢失与材料变化。对于已被新 Worker 接管的章节，旧 Worker 即使收到晚到的模型响应，也只能结束自己的调用记录，不能写入章节正文、摘要或结构化条目。该约束保证恢复过程不会用过期结果覆盖新一轮生成，同时为后续审计提供明确证据。项目实施还应保持生成状态、任务状态与最终交付状态一致，确保用户看到的内容来自最后一个合法持有租约的执行者。".repeat(2),
      summary: "本章明确项目采用可追溯材料、章节租约和提交前所有权校验，确保 Worker 接管后旧模型响应不会覆盖新执行结果。",
      claims: [{ text: "正式方案结论必须引用原始需求材料并支持安全接管。", sourceBlockIds: [sourceBlockId] }],
      items: [],
    };
    globalThis.fetch = async (url, init) => {
      assert.match(String(url), /\/responses$/);
      assert.equal(JSON.parse(init.body).text.format.type, "json_schema");
      const claimed = productSqlite.prepare("SELECT id, lease_owner AS leaseOwner FROM formal_sections WHERE solution_id = ? AND status = 'generating'").get(solutionId);
      assert.equal(claimed.leaseOwner, "formal-worker-old");
      productSqlite.prepare("UPDATE formal_sections SET lease_owner = 'formal-worker-new', lease_until = datetime('now', '+10 minutes') WHERE id = ?").run(claimed.id);
      return Response.json({ output_text: JSON.stringify(generated), usage: { input_tokens: 240, output_tokens: 320 } });
    };

    const state = await continueFormalDocument(solutionId, userId, { workerId: "formal-worker-old" });
    assert.equal(state.status, "generating");
    const section = productSqlite.prepare("SELECT status, lease_owner AS leaseOwner, content, summary, claims_json AS claimsJson FROM formal_sections WHERE solution_id = ? AND section_index = 0").get(solutionId);
    assert.deepEqual(section, { status: "generating", leaseOwner: "formal-worker-new", content: null, summary: null, claimsJson: null });
    assert.deepEqual(productSqlite.prepare("SELECT status, error_code AS errorCode FROM model_calls WHERE solution_id = ? AND purpose = 'formal_section:project_overview'").get(solutionId), {
      status: "failed", errorCode: "FORMAL_LEASE_LOST",
    });
    assert.deepEqual(productSqlite.prepare("SELECT status, error_code AS errorCode FROM formal_section_attempts WHERE solution_id = ?").get(solutionId), {
      status: "failed", errorCode: "FORMAL_LEASE_LOST",
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});
