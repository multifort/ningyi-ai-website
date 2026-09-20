import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const typescript = require("typescript");
const fsSync = require("node:fs");
const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ningyi-project-model-draft-test-"));
process.env.PRODUCT_DB_PATH = path.join(tempDir, "isolated-product.db");
process.env.PRODUCT_MODEL_EXECUTION_WINDOW_ENABLED = "false";
process.env.OPENAI_API_KEY = "test-key-not-used";
require.extensions[".ts"] = (module, filename) => {
  const source = fsSync.readFileSync(filename, "utf8");
  module._compile(typescript.transpileModule(source, { compilerOptions: { module: typescript.ModuleKind.CommonJS, target: typescript.ScriptTarget.ES2022, esModuleInterop: true }, fileName: filename }).outputText, filename);
};

const { productSqlite } = require("../lib/product/db.ts");
const { generateInitialProjectModelDraft, generateProjectModelRevisionDraft } = require("../lib/product/project-model-draft.ts");
const { activateProjectModelSnapshot } = require("../lib/product/project-model-state.ts");
const userId = "90000000-0000-4000-8000-000000000001";
const solutionId = "10000000-0000-4000-8000-000000000001";
const sourceBlockId = "30000000-0000-4000-8000-000000000001";
const facts = [{ id: "FACT-001", topic: "目标", text: "統一銷售商機管理", sourceBlockIds: [sourceBlockId] }];
const validOutput = {
  projectType: "software",
  goals: [{ key: "GOAL-001", title: "统一销售商机管理", description: "将客户与商机信息集中管理。", sourceFactIds: ["FACT-001"] }],
  scopeIncluded: [], scopeExcluded: [], actors: [], scenarios: [],
  requirements: [{ key: "REQ-001", title: "维护商机", description: "销售人员可维护商机信息。", sourceFactIds: ["FACT-001"], priority: "must", acceptanceCriteria: ["可以保存商机信息"], requirementType: "functional" }],
  features: [], constraints: [], integrations: [], dataEntities: [], agentCapabilities: [], terms: [], assumptions: [], relations: [],
};

test("initial model draft uses Responses structured output, persists a traced candidate, and never activates it", async () => {
  const originalFetch = globalThis.fetch;
  try {
    productSqlite.prepare("INSERT INTO product_users (id, username, username_normalized, password_hash) VALUES (?, 'draft-owner', 'draft-owner', 'test')").run(userId);
    productSqlite.prepare("INSERT INTO product_solutions (id, owner_user_id, title) VALUES (?, ?, '销售管理项目')").run(solutionId, userId);
    productSqlite.prepare("INSERT INTO intake_drafts (id, user_id, solution_id, purpose_primary, need_description, form_data) VALUES (?, ?, ?, ?, ?, '{}')").run("20000000-0000-4000-8000-000000000001", userId, solutionId, "统一销售商机管理", "集中维护客户和商机");
    productSqlite.prepare("INSERT INTO solution_understandings (solution_id, summary, facts_json, knowledge_json, status) VALUES (?, '已整理', '[]', ?, 'ready')").run(solutionId, JSON.stringify({ facts, conflicts: [] }));
    globalThis.fetch = async (url, init) => {
      assert.match(String(url), /\/responses$/);
      const body = JSON.parse(init.body);
      assert.equal(body.store, false);
      assert.equal(body.text.format.type, "json_schema");
      assert.equal(body.text.format.strict, true);
      return Response.json({ output_text: JSON.stringify(validOutput), usage: { input_tokens: 120, output_tokens: 90 } });
    };
    const result = await generateInitialProjectModelDraft(solutionId, userId);
    assert.equal(result.status, "candidate");
    assert.equal(result.model.requirements[0].sourceRefs[0].refId, sourceBlockId);
    assert.equal(productSqlite.prepare("SELECT status FROM project_model_snapshots WHERE id = ?").get(result.snapshotId).status, "candidate");
    assert.equal(productSqlite.prepare("SELECT status FROM model_calls WHERE purpose = 'project_model_draft'").get().status, "succeeded");
    const state = require("../lib/product/project-model-state.ts").getProjectModelState(solutionId, userId);
    assert.equal(state.active, null);
    assert.equal(state.candidates[0].snapshotId, result.snapshotId);
    assert.equal(state.candidates[0].model.goals[0].sourceRefs[0].refId, sourceBlockId);
    activateProjectModelSnapshot(solutionId, userId, result.snapshotId);
    const revision = await generateProjectModelRevisionDraft(solutionId, userId);
    assert.equal(revision.status, "candidate");
    assert.equal(productSqlite.prepare("SELECT COUNT(*) AS count FROM model_calls WHERE purpose = 'project_model_revision_draft' AND status = 'succeeded'").get().count, 1);
    assert.equal(productSqlite.prepare("SELECT status FROM project_model_snapshots WHERE id = ?").get(revision.snapshotId).status, "candidate");
    assert.equal(productSqlite.prepare("SELECT status FROM project_model_snapshots WHERE id = ?").get(result.snapshotId).status, "active");
  } finally {
    globalThis.fetch = originalFetch;
    productSqlite.close();
  }
});

test.after(async () => fs.rm(tempDir, { recursive: true, force: true }));
