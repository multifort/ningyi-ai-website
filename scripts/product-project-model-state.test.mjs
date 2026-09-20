import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const typescript = require("typescript");
const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ningyi-project-model-state-test-"));
process.env.PRODUCT_DB_PATH = path.join(tempDir, "isolated-product.db");
require.extensions[".ts"] = (module, filename) => {
  const source = fsSync.readFileSync(filename, "utf8");
  const compiled = typescript.transpileModule(source, {
    compilerOptions: { module: typescript.ModuleKind.CommonJS, target: typescript.ScriptTarget.ES2022, esModuleInterop: true },
    fileName: filename,
  }).outputText;
  module._compile(compiled, filename);
};
const fsSync = require("node:fs");
const { productSqlite } = require("../lib/product/db.ts");
const state = require("../lib/product/project-model-state.ts");
const sectionMap = require("../lib/product/project-model-section-map.ts");
const fixture = JSON.parse(await fs.readFile(new URL("../docs/product/v1-design/contracts/examples/minimal-project-model.json", import.meta.url), "utf8"));
const userId = "90000000-0000-4000-8000-000000000001";
const otherUserId = "90000000-0000-4000-8000-000000000002";
const solutionId = fixture.projectId;

test("project model candidates, relations, locks, activation, rollback and plan history are persisted atomically", () => {
  try {
    productSqlite.prepare("INSERT INTO product_users (id, username, username_normalized, password_hash) VALUES (?, ?, ?, ?)").run(userId, "owner", "owner", "test-hash");
    productSqlite.prepare("INSERT INTO product_users (id, username, username_normalized, password_hash) VALUES (?, ?, ?, ?)").run(otherUserId, "other", "other", "test-hash");
    productSqlite.prepare("INSERT INTO product_solutions (id, owner_user_id, title) VALUES (?, ?, ?)").run(solutionId, userId, "state test");

    const candidateOne = structuredClone(fixture);
    const first = state.createProjectModelCandidate(solutionId, userId, candidateOne);
    assert.equal(first.status, "candidate");
    assert.equal(first.version, 1);
    assert.equal(state.createProjectModelCandidate(solutionId, userId, candidateOne).idempotent, true);
    assert.equal(productSqlite.prepare("SELECT COUNT(*) AS count FROM project_model_relations WHERE snapshot_id = ?").get(candidateOne.snapshotId).count, 1);
    assert.equal(state.getProjectModelState(solutionId, userId).active, null);
    assert.throws(() => state.setProjectModelEntityLock(solutionId, userId, "SCOPE-001", true), /PROJECT_MODEL_ENTITY_NOT_FOUND/);

    state.activateProjectModelSnapshot(solutionId, userId, candidateOne.snapshotId);
    state.setProjectModelEntityLock(solutionId, userId, "SCOPE-001", true, "已由业务方确认");
    assert.throws(() => state.setProjectModelEntityLock(solutionId, userId, "GOAL-001", false), /MODEL_LOCK_CANNOT_BE_REMOVED/);
    assert.throws(() => state.getProjectModelState(solutionId, otherUserId), /SOLUTION_NOT_FOUND/);
    const activeOne = state.getProjectModelState(solutionId, userId);
    assert.equal(activeOne.active.model.snapshotId, candidateOne.snapshotId);
    assert.deepEqual(activeOne.lockedEntities.map((item) => item.entityKey), ["GOAL-001", "SCOPE-001", "TERM-790569F7A425"]);

    const semanticPreview = state.previewProjectModelImpact(solutionId, userId, { triggerType: "requirement_change", directTargets: ["REQ-001"] });
    assert.equal(semanticPreview.plan.actionClass, "S");
    assert.deepEqual(semanticPreview.plan.impactedTargets.map(({ id, action }) => [id, action]), [["REQ-001", "generate"], ["FUN-001", "generate"]]);
    assert.deepEqual(semanticPreview.sectionTargets, [
      { sectionKey: "requirements", entityKeys: ["FUN-001", "REQ-001"] },
      { sectionKey: "solution", entityKeys: ["FUN-001"] },
      { sectionKey: "workload", entityKeys: ["FUN-001", "REQ-001"] },
      { sectionKey: "implementation", entityKeys: ["FUN-001"] },
    ]);
    const restructurePreview = state.previewProjectModelImpact(solutionId, userId, { triggerType: "project_restructure", directTargets: ["PROJECT_MODEL"] });
    assert.equal(restructurePreview.plan.actionClass, "P");
    assert.equal(restructurePreview.status, "blocked");
    assert.equal(restructurePreview.plan.impactedTargets[0].action, "rebuild_project_model");
    assert.ok(restructurePreview.plan.conflicts.some(({ lockedTarget }) => lockedTarget === "GOAL-001"));
    assert.equal(restructurePreview.sectionTargets.length, sectionMap.FORMAL_SECTION_KEYS.length);
    assert.throws(() => state.acceptChangeImpactPlan(solutionId, userId, restructurePreview.id), /CHANGE_IMPACT_PLAN_BLOCKED/);
    const requirementContext = sectionMap.projectModelSectionContext(solutionId, "requirements");
    assert.match(requirementContext, /REQ-001/);
    assert.doesNotMatch(requirementContext, /GOAL-001/);
    assert.match(requirementContext, /商机/);
    assert.throws(() => state.previewProjectModelImpact(solutionId, userId, { triggerType: "project_restructure", directTargets: ["REQ-001"] }), /PROJECT_RESTRUCTURE_TARGET_MUST_BE_PROJECT_MODEL/);

    const candidateTwo = structuredClone(fixture);
    candidateTwo.snapshotId = "10000000-0000-4000-8000-000000000099";
    const second = state.createProjectModelCandidate(solutionId, userId, candidateTwo);
    assert.equal(second.version, 2);
    assert.equal(second.parentSnapshotId, candidateOne.snapshotId);
    state.activateProjectModelSnapshot(solutionId, userId, candidateTwo.snapshotId);
    assert.equal(state.getProjectModelState(solutionId, userId).active.version, 2);
    state.activateProjectModelSnapshot(solutionId, userId, candidateOne.snapshotId);
    assert.equal(state.getProjectModelState(solutionId, userId).active.version, 1);

    const savedPlan = state.persistChangeImpactPlan(solutionId, userId, {
      schemaVersion: "1.0", actionClass: "S", directTargets: ["REQ-001"], impactedTargets: [],
      conflicts: [{ lockedTarget: "SCOPE-001", blockedPath: ["REQ-001", "SCOPE-001"], code: "LOCKED_TARGET_CONFLICT" }],
      unaffectedTargets: [], modelTaskCount: 0,
    });
    assert.equal(savedPlan.status, "blocked");
    assert.equal(savedPlan.baseSnapshotId, candidateOne.snapshotId);
    assert.equal(productSqlite.prepare("SELECT status FROM change_impact_plans WHERE id = ?").get(savedPlan.id).status, "blocked");
    assert.throws(() => state.acceptChangeImpactPlan(solutionId, userId, savedPlan.id), /CHANGE_IMPACT_PLAN_BLOCKED/);
    const readyPlan = state.previewProjectModelImpact(solutionId, userId, { triggerType: "requirement_change", directTargets: ["CONSTRAINT-001"] });
    assert.equal(readyPlan.status, "planned");
    assert.equal(state.acceptChangeImpactPlan(solutionId, userId, readyPlan.id).status, "accepted");
    assert.throws(() => state.acceptChangeImpactPlan(solutionId, userId, readyPlan.id), /CHANGE_IMPACT_PLAN_NOT_ACCEPTABLE/);
    const stalePlan = state.previewProjectModelImpact(solutionId, userId, { triggerType: "requirement_change", directTargets: ["CONSTRAINT-001"] });
    state.activateProjectModelSnapshot(solutionId, userId, candidateTwo.snapshotId);
    assert.throws(() => state.acceptChangeImpactPlan(solutionId, userId, readyPlan.id), /CHANGE_IMPACT_PLAN_NOT_ACCEPTABLE/);
    assert.throws(() => state.acceptChangeImpactPlan(solutionId, userId, stalePlan.id), /CHANGE_IMPACT_PLAN_STALE/);
    state.activateProjectModelSnapshot(solutionId, userId, candidateOne.snapshotId);
    productSqlite.prepare("INSERT INTO formal_documents (solution_id, provider, model, total_sections) VALUES (?, 'test', 'offline-fixture', 7)").run(solutionId);
    const sectionInsert = productSqlite.prepare("INSERT INTO formal_sections (id, solution_id, section_index, section_key, title, status, content, summary) VALUES (?, ?, ?, ?, ?, 'validated', 'existing content', 'existing summary')");
    sectionMap.FORMAL_SECTION_KEYS.forEach((key, index) => sectionInsert.run(`80000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`, solutionId, index, key, key));
    const candidateThree = structuredClone(fixture);
    candidateThree.snapshotId = "10000000-0000-4000-8000-000000000098";
    candidateThree.constraints[0].description = "沿用企业单点登录并记录授权审计。";
    state.createProjectModelCandidate(solutionId, userId, candidateThree);
    const executionPlan = state.previewProjectModelImpact(solutionId, userId, { triggerType: "requirement_change", directTargets: ["CONSTRAINT-001"] });
    state.acceptChangeImpactPlan(solutionId, userId, executionPlan.id);
    const execution = state.executeChangeImpactPlan(solutionId, userId, executionPlan.id, candidateThree.snapshotId);
    assert.equal(execution.status, "running");
    assert.equal(state.getProjectModelState(solutionId, userId).active.snapshotId, candidateThree.snapshotId);
    assert.deepEqual(productSqlite.prepare("SELECT section_key AS sectionKey FROM formal_sections WHERE solution_id = ? AND status = 'pending' ORDER BY section_index").all(solutionId).map(({ sectionKey }) => sectionKey), ["scope_users", "solution", "implementation", "risks"]);
    assert.deepEqual(productSqlite.prepare("SELECT section_key AS sectionKey, status, content FROM formal_sections WHERE solution_id = ? AND section_key IN ('project_overview', 'requirements', 'workload') ORDER BY section_index").all(solutionId), [
      { sectionKey: "project_overview", status: "validated", content: "existing content" },
      { sectionKey: "requirements", status: "validated", content: "existing content" },
      { sectionKey: "workload", status: "validated", content: "existing content" },
    ]);
    const confirmedFactId = "60000000-0000-4000-8000-000000000001";
    productSqlite.prepare("INSERT INTO project_user_facts (id, solution_id, user_id, text) VALUES (?, ?, ?, ?)").run(confirmedFactId, solutionId, userId, "客户确认商机信息需要记录负责人和预计金额。");
    const factLinkedCandidate = state.createProjectModelEntityRevision(solutionId, userId, candidateThree.snapshotId, "REQ-001", {
      sourceRefs: [{ kind: "user_decision", refId: confirmedFactId, role: "supports" }],
    });
    const linkedModel = JSON.parse(productSqlite.prepare("SELECT model_json AS modelJson FROM project_model_snapshots WHERE id = ?").get(factLinkedCandidate.snapshotId).modelJson);
    assert.ok(linkedModel.requirements[0].sourceRefs.some(({ kind, refId }) => kind === "user_decision" && refId === confirmedFactId));
    assert.throws(() => state.createProjectModelEntityRevision(solutionId, userId, candidateThree.snapshotId, "REQ-001", {
      sourceRefs: [{ kind: "user_decision", refId: "60000000-0000-4000-8000-000000000099", role: "supports" }],
    }), /PROJECT_MODEL_USER_FACT_NOT_ACTIVE/);
    const foreignFactId = "60000000-0000-4000-8000-000000000002";
    productSqlite.prepare("INSERT INTO project_user_facts (id, solution_id, user_id, text) VALUES (?, ?, ?, ?)").run(foreignFactId, solutionId, otherUserId, "其他用户的确认事实。");
    assert.throws(() => state.createProjectModelEntityRevision(solutionId, userId, candidateThree.snapshotId, "REQ-001", {
      sourceRefs: [{ kind: "user_decision", refId: foreignFactId, role: "supports" }],
    }), /PROJECT_MODEL_USER_FACT_NOT_ACTIVE/);
    assert.throws(() => state.createProjectModelEntityRevision(solutionId, userId, candidateThree.snapshotId, "REQ-001", {
      sourceRefs: [{ kind: "source_block", refId: "not-a-uuid", role: "supports" }],
    }), /INVALID_PROJECT_MODEL_REVISION_SOURCE_REFS/);
    assert.equal(productSqlite.prepare("SELECT status, execution_started_at AS executionStartedAt FROM change_impact_plans WHERE id = ?").get(executionPlan.id).status, "accepted");
    assert.ok(productSqlite.prepare("SELECT execution_started_at AS executionStartedAt FROM change_impact_plans WHERE id = ?").get(executionPlan.id).executionStartedAt);
    assert.throws(() => state.executeChangeImpactPlan(solutionId, userId, executionPlan.id, candidateThree.snapshotId), /CHANGE_IMPACT_PLAN_NOT_EXECUTABLE/);
    const outsideCandidate = structuredClone(candidateThree);
    outsideCandidate.snapshotId = "10000000-0000-4000-8000-000000000097";
    outsideCandidate.identity.primaryPurpose = "未纳入计划的整体方向变更";
    state.createProjectModelCandidate(solutionId, userId, outsideCandidate);
    const outsidePlan = state.previewProjectModelImpact(solutionId, userId, { triggerType: "requirement_change", directTargets: ["CONSTRAINT-001"] });
    state.acceptChangeImpactPlan(solutionId, userId, outsidePlan.id);
    const sectionStateBeforeRejectedExecution = productSqlite.prepare("SELECT section_key AS sectionKey, status, content FROM formal_sections WHERE solution_id = ? ORDER BY section_index").all(solutionId);
    const documentStateBeforeRejectedExecution = productSqlite.prepare("SELECT status, current_section AS currentSection FROM formal_documents WHERE solution_id = ?").get(solutionId);
    assert.throws(() => state.executeChangeImpactPlan(solutionId, userId, outsidePlan.id, outsideCandidate.snapshotId), /CHANGE_IMPACT_CANDIDATE_OUTSIDE_PLAN/);
    assert.equal(state.getProjectModelState(solutionId, userId).active.snapshotId, candidateThree.snapshotId);
    assert.equal(productSqlite.prepare("SELECT execution_started_at AS executionStartedAt FROM change_impact_plans WHERE id = ?").get(outsidePlan.id).executionStartedAt, null);
    assert.equal(productSqlite.prepare("SELECT status FROM change_impact_plans WHERE id = ?").get(outsidePlan.id).status, "accepted");
    assert.deepEqual(productSqlite.prepare("SELECT section_key AS sectionKey, status, content FROM formal_sections WHERE solution_id = ? ORDER BY section_index").all(solutionId), sectionStateBeforeRejectedExecution);
    assert.deepEqual(productSqlite.prepare("SELECT status, current_section AS currentSection FROM formal_documents WHERE solution_id = ?").get(solutionId), documentStateBeforeRejectedExecution);
    const relationCandidate = structuredClone(candidateThree);
    relationCandidate.snapshotId = "10000000-0000-4000-8000-000000000093";
    relationCandidate.relations.push({ from: "CONSTRAINT-001", to: "GOAL-001", type: "depends_on", strength: "recommended", rationale: "越界关系候选" });
    state.createProjectModelCandidate(solutionId, userId, relationCandidate);
    const relationPlan = state.previewProjectModelImpact(solutionId, userId, { triggerType: "requirement_change", directTargets: ["CONSTRAINT-001"] });
    state.acceptChangeImpactPlan(solutionId, userId, relationPlan.id);
    assert.throws(() => state.executeChangeImpactPlan(solutionId, userId, relationPlan.id, relationCandidate.snapshotId), /CHANGE_IMPACT_CANDIDATE_OUTSIDE_PLAN/);
    assert.equal(state.getProjectModelState(solutionId, userId).active.snapshotId, candidateThree.snapshotId);
    assert.equal(productSqlite.prepare("SELECT execution_started_at AS executionStartedAt FROM change_impact_plans WHERE id = ?").get(relationPlan.id).executionStartedAt, null);
    const editedCandidate = state.createProjectModelEntityRevision(solutionId, userId, candidateThree.snapshotId, "REQ-001", { title: "商机信息维护", description: "允许销售代表维护商机信息。" });
    assert.equal(editedCandidate.parentSnapshotId, candidateThree.snapshotId);
    const editedModel = JSON.parse(productSqlite.prepare("SELECT model_json AS modelJson FROM project_model_snapshots WHERE id = ?").get(editedCandidate.snapshotId).modelJson);
    assert.equal(editedModel.requirements[0].title, "商机信息维护");
    assert.throws(() => state.createProjectModelEntityRevision(solutionId, userId, candidateThree.snapshotId, "GOAL-001", { title: "绕过业务锁" }), /PROJECT_MODEL_ENTITY_LOCKED/);
    assert.throws(() => state.createProjectModelCandidate(solutionId, userId, { ...candidateTwo, snapshotId: "bad-id" }), /INVALID_PROJECT_MODEL/);
    assert.throws(() => state.setProjectModelEntityLock(solutionId, otherUserId, "SCOPE-001", true), /SOLUTION_NOT_FOUND/);
    const rejected = state.rejectProjectModelCandidate(solutionId, userId, editedCandidate.snapshotId);
    assert.equal(rejected.status, "rejected");
    assert.equal(productSqlite.prepare("SELECT status FROM project_model_snapshots WHERE id = ?").get(editedCandidate.snapshotId).status, "rejected");
    assert.throws(() => state.rejectProjectModelCandidate(solutionId, userId, editedCandidate.snapshotId), /PROJECT_MODEL_CANDIDATE_NOT_REJECTABLE/);

    const rollback = state.activateProjectModelSnapshot(solutionId, userId, candidateTwo.snapshotId);
    assert.equal(rollback.status, "active");
    assert.equal(rollback.queuedFormalRebuild, true);
    assert.equal(state.getProjectModelState(solutionId, userId).active.snapshotId, candidateTwo.snapshotId);
    assert.equal(productSqlite.prepare("SELECT COUNT(*) AS count FROM formal_sections WHERE solution_id = ? AND status = 'pending'").get(solutionId).count, sectionMap.FORMAL_SECTION_KEYS.length);

    productSqlite.prepare("DELETE FROM change_impact_plans WHERE solution_id = ?").run(solutionId);
    productSqlite.prepare("DELETE FROM project_model_locks WHERE solution_id = ?").run(solutionId);
    productSqlite.prepare("DELETE FROM project_model_snapshots WHERE solution_id = ?").run(solutionId);
    assert.equal(productSqlite.prepare("SELECT COUNT(*) AS count FROM project_model_entities").get().count, 0);
    assert.equal(productSqlite.prepare("SELECT COUNT(*) AS count FROM project_model_relations").get().count, 0);

    const restructureSolutionId = "10000000-0000-4000-8000-000000000002";
    productSqlite.prepare("INSERT INTO product_solutions (id, owner_user_id, title) VALUES (?, ?, '方向重构测试')").run(restructureSolutionId, userId);
    const unlockedModel = structuredClone(fixture);
    unlockedModel.projectId = restructureSolutionId;
    unlockedModel.snapshotId = "10000000-0000-4000-8000-000000000095";
    const clearLocks = (value) => {
      if (Array.isArray(value)) value.forEach(clearLocks);
      else if (value && typeof value === "object") { if ("locked" in value) value.locked = false; Object.values(value).forEach(clearLocks); }
    };
    clearLocks(unlockedModel);
    state.createProjectModelCandidate(restructureSolutionId, userId, unlockedModel);
    state.activateProjectModelSnapshot(restructureSolutionId, userId, unlockedModel.snapshotId);
    productSqlite.prepare("INSERT INTO formal_documents (solution_id, provider, model, total_sections) VALUES (?, 'test', 'offline-fixture', 7)").run(restructureSolutionId);
    sectionMap.FORMAL_SECTION_KEYS.forEach((key, index) => sectionInsert.run(`81000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`, restructureSolutionId, index, key, key));
    const projectDirectionCandidate = structuredClone(unlockedModel);
    projectDirectionCandidate.snapshotId = "10000000-0000-4000-8000-000000000094";
    projectDirectionCandidate.identity.primaryPurpose = "统一客户全生命周期经营管理";
    state.createProjectModelCandidate(restructureSolutionId, userId, projectDirectionCandidate);
    const projectDirectionPlan = state.previewProjectModelImpact(restructureSolutionId, userId, { triggerType: "project_restructure", directTargets: ["PROJECT_MODEL"] });
    assert.equal(projectDirectionPlan.plan.actionClass, "P");
    assert.equal(projectDirectionPlan.status, "planned");
    state.acceptChangeImpactPlan(restructureSolutionId, userId, projectDirectionPlan.id);
    const projectDirectionExecution = state.executeChangeImpactPlan(restructureSolutionId, userId, projectDirectionPlan.id, projectDirectionCandidate.snapshotId);
    assert.equal(projectDirectionExecution.status, "running");
    assert.equal(projectDirectionExecution.sectionTargets.length, sectionMap.FORMAL_SECTION_KEYS.length);
    assert.deepEqual(productSqlite.prepare("SELECT section_key AS sectionKey FROM formal_sections WHERE solution_id = ? AND status = 'pending' ORDER BY section_index").all(restructureSolutionId).map(({ sectionKey }) => sectionKey), [...sectionMap.FORMAL_SECTION_KEYS]);
    assert.equal(productSqlite.prepare("SELECT COUNT(*) AS count FROM formal_sections WHERE solution_id = ? AND status = 'pending' AND content IS NULL").get(restructureSolutionId).count, sectionMap.FORMAL_SECTION_KEYS.length);
    assert.equal(state.getProjectModelState(restructureSolutionId, userId).active.snapshotId, projectDirectionCandidate.snapshotId);
  } finally {
    productSqlite.close();
  }
});

test.after(async () => fs.rm(tempDir, { recursive: true, force: true }));
