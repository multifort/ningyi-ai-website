import { createHash, randomUUID } from "crypto";
import { planChangeImpact } from "./change-impact.mjs";
import { productSqlite } from "./db";
import { projectModelSectionImpacts } from "./project-model-section-map";

type EntityRow = { key: string; kind: string; title: string; locked: boolean; json: string };
type ProjectModel = Record<string, any>;
const stableKeyPattern = /^[A-Z][A-Z0-9_]*-[0-9]{3,}$/;
const persistedEntityKeyPattern = /^(?:[A-Z][A-Z0-9_]*-[0-9]{3,}|TERM-[0-9A-F]{12})$/;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const relationTypes = new Set(["satisfies", "implemented_by", "depends_on", "conflicts_with", "derived_from", "estimated_by", "scheduled_in", "quoted_by", "mentioned_in", "replaces"]);
const confidences = new Set(["user_confirmed", "multi_source", "single_source", "system_proposed", "conflict", "unknown"]);
const visibilities = new Set(["client", "internal", "both"]);
const sourceRoles = new Set(["supports", "contradicts", "context", "example"]);
const semanticPropagationRelations = new Set(["satisfies", "implemented_by", "depends_on", "derived_from"]);

/** Conservative V1 relation policy. Unsupported relation types never propagate. */
export const PROJECT_MODEL_PROPAGATION_POLICY = Object.freeze({
  semantic: ["satisfies", "implemented_by", "depends_on", "derived_from"],
  projectRestructure: "rebuild_project_model_then_review_all_entities",
  conflictsWith: "report_only",
  unsupported: "do_not_propagate",
});

export function createProjectModelCandidate(solutionId: string, userId: string, input: unknown) {
  const model = validateProjectModel(input, solutionId);
  const entities = projectModelEntities(model);
  const hash = createHash("sha256").update(JSON.stringify(model)).digest("hex");
  return productSqlite.transaction(() => {
    assertSolutionOwner(solutionId, userId);
    const existing = productSqlite.prepare("SELECT status FROM project_model_snapshots WHERE id = ? AND solution_id = ?").get(model.snapshotId, solutionId) as { status: string } | undefined;
    if (existing) {
      const existingHash = productSqlite.prepare("SELECT model_hash AS modelHash FROM project_model_snapshots WHERE id = ? AND solution_id = ?").get(model.snapshotId, solutionId) as { modelHash: string };
      if (existingHash.modelHash === hash && existing.status === "candidate") return { snapshotId: model.snapshotId, status: "candidate", idempotent: true };
      throw new Error("PROJECT_MODEL_SNAPSHOT_EXISTS");
    }
    const version = (productSqlite.prepare("SELECT COALESCE(MAX(version), 0) + 1 AS version FROM project_model_snapshots WHERE solution_id = ?").get(solutionId) as { version: number }).version;
    const parent = productSqlite.prepare("SELECT id FROM project_model_snapshots WHERE solution_id = ? AND status = 'active'").get(solutionId) as { id: string } | undefined;
    productSqlite.prepare(`INSERT INTO project_model_snapshots
      (id, solution_id, version, status, parent_snapshot_id, model_json, model_hash)
      VALUES (?, ?, ?, 'candidate', ?, ?, ?)`).run(model.snapshotId, solutionId, version, parent?.id || null, JSON.stringify(model), hash);

    const insertEntity = productSqlite.prepare(`INSERT INTO project_model_entities
      (snapshot_id, entity_key, entity_kind, title, model_locked, entity_json) VALUES (?, ?, ?, ?, ?, ?)`);
    for (const entity of entities) insertEntity.run(model.snapshotId, entity.key, entity.kind, entity.title, entity.locked ? 1 : 0, entity.json);
    const insertRelation = productSqlite.prepare(`INSERT INTO project_model_relations
      (snapshot_id, from_key, to_key, relation_type, strength, rationale) VALUES (?, ?, ?, ?, ?, ?)`);
    for (const relation of model.relations) insertRelation.run(model.snapshotId, relation.from, relation.to, relation.type, relation.strength, relation.rationale || null);
    return { snapshotId: model.snapshotId, version, parentSnapshotId: parent?.id || null, status: "candidate", idempotent: false };
  })();
}

export function createProjectModelEntityRevision(solutionId: string, userId: string, baseSnapshotId: string, entityKey: string, patch: unknown) {
  if (!uuidPattern.test(baseSnapshotId) || !persistedEntityKeyPattern.test(entityKey) || !patch || typeof patch !== "object" || Array.isArray(patch)) {
    throw new Error("INVALID_PROJECT_MODEL_REVISION");
  }
  return productSqlite.transaction(() => {
  assertSolutionOwner(solutionId, userId);
  const active = productSqlite.prepare(`SELECT model_json AS modelJson FROM project_model_snapshots
    WHERE id = ? AND solution_id = ? AND status = 'active'`).get(baseSnapshotId, solutionId) as { modelJson: string } | undefined;
  if (!active) throw new Error("PROJECT_MODEL_BASE_NOT_ACTIVE");
  const lock = productSqlite.prepare(`SELECT e.model_locked AS modelLocked, l.entity_key AS userLocked
    FROM project_model_entities e LEFT JOIN project_model_locks l ON l.solution_id = ? AND l.entity_key = e.entity_key
    WHERE e.snapshot_id = ? AND e.entity_key = ?`).get(solutionId, baseSnapshotId, entityKey) as { modelLocked: number; userLocked: string | null } | undefined;
  if (!lock) throw new Error("PROJECT_MODEL_ENTITY_NOT_FOUND");
  if (lock.modelLocked || lock.userLocked) throw new Error("PROJECT_MODEL_ENTITY_LOCKED");
  const model = structuredClone(JSON.parse(active.modelJson)) as ProjectModel;
  const target = findModelEntity(model, entityKey);
  if (!target) throw new Error("PROJECT_MODEL_ENTITY_NOT_FOUND");
  const change = patch as Record<string, unknown>;
  const writable = writableEntityFields(target.kind);
  if (Object.keys(change).length === 0 || Object.keys(change).some((key) => !writable.has(key))) throw new Error("INVALID_PROJECT_MODEL_REVISION_FIELDS");
  validateEntityPatch(target.kind, change);
  if ("sourceRefs" in change) validateUserDecisionRefs(solutionId, userId, change.sourceRefs as Array<{ kind: string; refId: string; role: string }>);
  Object.assign(target.value, change);
  model.snapshotId = randomUUID();
  return createProjectModelCandidate(solutionId, userId, model);
  })();
}

function findModelEntity(model: ProjectModel, entityKey: string): { kind: string; value: Record<string, any> } | undefined {
  const groups: Array<[string, unknown]> = [
    ["goal", model.goals], ["actor", model.actors], ["scenario", model.scenarios], ["requirement", model.requirements],
    ["feature", model.features], ["constraint", model.constraints], ["integration", model.integrations],
    ["data_entity", model.dataEntities], ["agent_capability", model.agentCapabilities], ["assumption", model.assumptions], ["conflict", model.conflicts],
    ["scope_included", model.scope?.included], ["scope_excluded", model.scope?.excluded], ["scope_future", model.scope?.future || []],
  ];
  for (const [kind, entries] of groups) {
    if (Array.isArray(entries)) {
      const value = entries.find((entry) => entry?.key === entityKey);
      if (value) return { kind, value };
    }
  }
  const term = (model.terms || []).find((item: any) => `TERM-${createHash("sha256").update(item.term.trim().normalize("NFC")).digest("hex").slice(0, 12).toUpperCase()}` === entityKey);
  return term ? { kind: "term", value: term } : undefined;
}

function writableEntityFields(kind: string) {
  if (kind === "term") return new Set(["definition", "aliases", "sourceRefs"]);
  if (kind === "assumption") return new Set(["description", "impact", "status", "validationMethod", "sourceRefs"]);
  if (kind === "conflict") return new Set(["summary", "severity", "status", "resolution", "sourceRefs"]);
  const fields = new Set(["title", "description", "sourceRefs"]);
  if (kind === "requirement") ["priority", "acceptanceCriteria", "requirementType"].forEach((field) => fields.add(field));
  if (kind === "feature") ["complexity", "inputs", "outputs", "rules"].forEach((field) => fields.add(field));
  if (kind === "agent_capability") ["task", "knowledgeSources", "tools", "evaluationCriteria", "fallback"].forEach((field) => fields.add(field));
  return fields;
}

function validateEntityPatch(kind: string, patch: Record<string, unknown>) {
  for (const key of ["title", "description", "summary", "definition", "validationMethod", "task", "fallback", "resolution"]) {
    if (key in patch && typeof patch[key] !== "string") throw new Error("INVALID_PROJECT_MODEL_REVISION_FIELDS");
  }
  for (const key of ["aliases", "acceptanceCriteria", "inputs", "outputs", "rules", "knowledgeSources", "tools", "evaluationCriteria"]) {
    if (key in patch && (!Array.isArray(patch[key]) || (patch[key] as unknown[]).some((value) => typeof value !== "string"))) throw new Error("INVALID_PROJECT_MODEL_REVISION_FIELDS");
  }
  if ("priority" in patch && !["must", "should", "could", "wont", "unknown"].includes(patch.priority as string)) throw new Error("INVALID_PROJECT_MODEL_REVISION_FIELDS");
  if ("requirementType" in patch && !["business", "user", "functional", "non_functional", "constraint"].includes(patch.requirementType as string)) throw new Error("INVALID_PROJECT_MODEL_REVISION_FIELDS");
  if ("complexity" in patch && !["low", "medium", "high", "unknown"].includes(patch.complexity as string)) throw new Error("INVALID_PROJECT_MODEL_REVISION_FIELDS");
  if ("impact" in patch && !["low", "medium", "high"].includes(patch.impact as string)) throw new Error("INVALID_PROJECT_MODEL_REVISION_FIELDS");
  if ("status" in patch && !["active", "confirmed", "rejected", "expired", "open", "resolved", "accepted_as_assumption"].includes(patch.status as string)) throw new Error("INVALID_PROJECT_MODEL_REVISION_FIELDS");
  if ("severity" in patch && !["info", "warning", "direction_blocking", "project_blocking"].includes(patch.severity as string)) throw new Error("INVALID_PROJECT_MODEL_REVISION_FIELDS");
  if ("sourceRefs" in patch && (!Array.isArray(patch.sourceRefs) || patch.sourceRefs.length > 24 || patch.sourceRefs.some((item: any) => !item || typeof item !== "object" || typeof item.kind !== "string" || typeof item.refId !== "string" || typeof item.role !== "string"))) throw new Error("INVALID_PROJECT_MODEL_REVISION_FIELDS");
}

function validateUserDecisionRefs(solutionId: string, userId: string, refs: Array<{ kind: string; refId: string; role: string }>) {
  const seen = new Set<string>();
  for (const ref of refs) {
    const identity = `${ref.kind}:${ref.refId}`;
    if (Object.keys(ref).some((key) => !["kind", "refId", "role"].includes(key)) || !uuidPattern.test(ref.refId)
      || seen.has(identity) || !["supports", "contradicts", "contextualizes"].includes(ref.role)) throw new Error("INVALID_PROJECT_MODEL_REVISION_SOURCE_REFS");
    seen.add(identity);
    if (ref.kind === "source_block") {
      if (!productSqlite.prepare("SELECT 1 FROM source_blocks WHERE id = ? AND solution_id = ?").get(ref.refId, solutionId)) throw new Error("PROJECT_MODEL_SOURCE_NOT_IN_SOLUTION");
    } else if (ref.kind === "user_decision") {
      if (!productSqlite.prepare("SELECT 1 FROM project_user_facts WHERE id = ? AND solution_id = ? AND user_id = ? AND status = 'active'").get(ref.refId, solutionId, userId)) throw new Error("PROJECT_MODEL_USER_FACT_NOT_ACTIVE");
    } else throw new Error("INVALID_PROJECT_MODEL_REVISION_SOURCE_REFS");
  }
}

export function activateProjectModelSnapshot(solutionId: string, userId: string, snapshotId: string) {
  return productSqlite.transaction(() => {
    assertSolutionOwner(solutionId, userId);
    const snapshot = productSqlite.prepare(`SELECT id, version, status FROM project_model_snapshots
      WHERE id = ? AND solution_id = ?`).get(snapshotId, solutionId) as { id: string; version: number; status: string } | undefined;
    if (!snapshot || !["candidate", "superseded"].includes(snapshot.status)) throw new Error("PROJECT_MODEL_SNAPSHOT_NOT_ACTIVATABLE");
    productSqlite.prepare(`UPDATE project_model_snapshots SET status = 'superseded'
      WHERE solution_id = ? AND status = 'active'`).run(solutionId);
    productSqlite.prepare(`UPDATE project_model_snapshots SET status = 'active', activated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND solution_id = ?`).run(snapshotId, solutionId);
    productSqlite.prepare(`DELETE FROM project_model_locks WHERE solution_id = ? AND NOT EXISTS (
      SELECT 1 FROM project_model_entities e JOIN project_model_snapshots s ON s.id = e.snapshot_id
      WHERE s.solution_id = project_model_locks.solution_id AND s.status = 'active' AND e.entity_key = project_model_locks.entity_key
    )`).run(solutionId);
    const hasFormal = Boolean(productSqlite.prepare("SELECT 1 FROM formal_documents WHERE solution_id = ?").get(solutionId));
    if (hasFormal) {
      productSqlite.prepare(`UPDATE formal_section_attempts SET status = 'failed', error_code = 'PROJECT_MODEL_ACTIVATED', completed_at = CURRENT_TIMESTAMP
        WHERE solution_id = ? AND status = 'running'`).run(solutionId);
      productSqlite.prepare(`UPDATE model_calls SET status = 'failed', error_code = 'PROJECT_MODEL_ACTIVATED', completed_at = CURRENT_TIMESTAMP
        WHERE solution_id = ? AND status = 'running' AND purpose LIKE 'formal_section:%'`).run(solutionId);
      productSqlite.prepare(`UPDATE formal_sections SET status = 'pending', content = NULL, summary = NULL, claims_json = NULL,
        structured_items_json = NULL, context_hash = NULL, retry_cycle = retry_cycle + 1, next_attempt_at = NULL,
        failed_at = NULL, lease_owner = NULL, lease_until = NULL, updated_at = CURRENT_TIMESTAMP WHERE solution_id = ?`).run(solutionId);
      productSqlite.prepare(`UPDATE formal_documents SET status = 'pending', current_section = 0, last_error_code = NULL,
        updated_at = CURRENT_TIMESTAMP WHERE solution_id = ?`).run(solutionId);
      productSqlite.prepare(`UPDATE deliverable_artifacts SET status = 'superseded', updated_at = CURRENT_TIMESTAMP
        WHERE solution_id = ? AND user_id = ? AND status = 'available'`).run(solutionId, userId);
      productSqlite.prepare("UPDATE project_consistency_reports SET status = 'stale', updated_at = CURRENT_TIMESTAMP WHERE solution_id = ?").run(solutionId);
      productSqlite.prepare(`UPDATE product_solutions SET status = 'processing', stage = 'formal_analysis', render_lease_owner = NULL,
        render_lease_until = NULL, render_next_attempt_at = NULL, render_error_code = NULL, render_failed_at = NULL,
        updated_at = CURRENT_TIMESTAMP WHERE id = ? AND owner_user_id = ?`).run(solutionId, userId);
    } else {
      productSqlite.prepare("UPDATE product_solutions SET updated_at = CURRENT_TIMESTAMP WHERE id = ? AND owner_user_id = ?").run(solutionId, userId);
    }
    productSqlite.prepare(`UPDATE change_impact_plans SET status = 'failed', updated_at = CURRENT_TIMESTAMP
      WHERE solution_id = ? AND status = 'accepted' AND execution_started_at IS NULL AND base_snapshot_id IS NOT ?`).run(solutionId, snapshotId);
    return { snapshotId, version: snapshot.version, status: "active", queuedFormalRebuild: hasFormal };
  })();
}

export function rejectProjectModelCandidate(solutionId: string, userId: string, snapshotId: string) {
  if (!uuidPattern.test(snapshotId)) throw new Error("INVALID_PROJECT_MODEL_SNAPSHOT");
  return productSqlite.transaction(() => {
    assertSolutionOwner(solutionId, userId);
    const result = productSqlite.prepare("UPDATE project_model_snapshots SET status = 'rejected' WHERE id = ? AND solution_id = ? AND status = 'candidate'").run(snapshotId, solutionId);
    if (!result.changes) throw new Error("PROJECT_MODEL_CANDIDATE_NOT_REJECTABLE");
    return { snapshotId, status: "rejected" };
  })();
}

export function setProjectModelEntityLock(solutionId: string, userId: string, entityKey: string, locked: boolean, reason?: string) {
  if (!persistedEntityKeyPattern.test(entityKey)) throw new Error("INVALID_PROJECT_ENTITY_KEY");
  return productSqlite.transaction(() => {
    assertSolutionOwner(solutionId, userId);
    const entity = productSqlite.prepare(`SELECT e.model_locked AS modelLocked FROM project_model_snapshots s
      JOIN project_model_entities e ON e.snapshot_id = s.id
      WHERE s.solution_id = ? AND s.status = 'active' AND e.entity_key = ?`).get(solutionId, entityKey) as { modelLocked: number } | undefined;
    if (!entity) throw new Error("PROJECT_MODEL_ENTITY_NOT_FOUND");
    if (!locked && entity.modelLocked) throw new Error("MODEL_LOCK_CANNOT_BE_REMOVED");
    if (locked) {
      productSqlite.prepare(`INSERT INTO project_model_locks (solution_id, entity_key, user_id, reason)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(solution_id, entity_key) DO UPDATE SET user_id = excluded.user_id, reason = excluded.reason, updated_at = CURRENT_TIMESTAMP`).run(solutionId, entityKey, userId, reason?.trim().slice(0, 500) || null);
    } else {
      productSqlite.prepare("DELETE FROM project_model_locks WHERE solution_id = ? AND entity_key = ? AND user_id = ?").run(solutionId, entityKey, userId);
    }
    return { entityKey, locked: Boolean(entity.modelLocked || locked), modelLocked: Boolean(entity.modelLocked) };
  })();
}

export function getProjectModelState(solutionId: string, userId: string) {
  assertSolutionOwner(solutionId, userId);
  const active = productSqlite.prepare(`SELECT id AS snapshotId, version, model_json AS modelJson, model_hash AS modelHash, activated_at AS activatedAt
    FROM project_model_snapshots WHERE solution_id = ? AND status = 'active'`).get(solutionId) as { snapshotId: string; version: number; modelJson: string; modelHash: string; activatedAt: string | null } | undefined;
  const versions = productSqlite.prepare(`SELECT id AS snapshotId, version, status, parent_snapshot_id AS parentSnapshotId, created_at AS createdAt, activated_at AS activatedAt
    FROM project_model_snapshots WHERE solution_id = ? ORDER BY version DESC`).all(solutionId);
  const candidates = (productSqlite.prepare(`SELECT id AS snapshotId, version, model_json AS modelJson
    FROM project_model_snapshots WHERE solution_id = ? AND status = 'candidate' ORDER BY version DESC LIMIT 3`).all(solutionId) as Array<{ snapshotId: string; version: number; modelJson: string }>)
    .map(({ snapshotId, version, modelJson }) => ({ snapshotId, version, model: JSON.parse(modelJson) }));
  const locked = productSqlite.prepare(`SELECT e.entity_key AS entityKey, e.title, e.entity_kind AS entityKind,
      e.model_locked AS modelLocked, CASE WHEN l.entity_key IS NULL THEN 0 ELSE 1 END AS userLocked,
      l.reason AS lockReason, l.updated_at AS lockUpdatedAt
    FROM project_model_snapshots s JOIN project_model_entities e ON e.snapshot_id = s.id
    LEFT JOIN project_model_locks l ON l.solution_id = s.solution_id AND l.entity_key = e.entity_key
    WHERE s.solution_id = ? AND s.status = 'active' AND (e.model_locked = 1 OR l.entity_key IS NOT NULL)
    ORDER BY e.entity_key`).all(solutionId);
  const entities = active ? productSqlite.prepare(`SELECT e.entity_key AS entityKey, e.entity_kind AS entityKind, e.title,
      e.model_locked AS modelLocked, CASE WHEN l.entity_key IS NULL THEN 0 ELSE 1 END AS userLocked
    FROM project_model_entities e JOIN project_model_snapshots s ON s.id = e.snapshot_id
    LEFT JOIN project_model_locks l ON l.solution_id = s.solution_id AND l.entity_key = e.entity_key
    WHERE s.id = ? ORDER BY e.entity_kind, e.entity_key`).all(active.snapshotId) : [];
  return {
    active: active ? { ...active, model: JSON.parse(active.modelJson), modelJson: undefined } : null,
    candidates,
    versions,
    entities,
    lockedEntities: locked,
  };
}

export function persistChangeImpactPlan(solutionId: string, userId: string, plan: Record<string, any>) {
  if (!plan || plan.schemaVersion !== "1.0" || !["R", "C", "S", "P"].includes(plan.actionClass)
    || !Array.isArray(plan.directTargets) || !Array.isArray(plan.impactedTargets) || !Array.isArray(plan.conflicts)) {
    throw new Error("INVALID_CHANGE_IMPACT_PLAN");
  }
  return productSqlite.transaction(() => {
    assertSolutionOwner(solutionId, userId);
    const active = productSqlite.prepare("SELECT id FROM project_model_snapshots WHERE solution_id = ? AND status = 'active'").get(solutionId) as { id: string } | undefined;
    const id = randomUUID();
    const status = plan.conflicts.length ? "blocked" : "planned";
    productSqlite.prepare(`INSERT INTO change_impact_plans (id, solution_id, user_id, base_snapshot_id, action_class, status, plan_json)
      VALUES (?, ?, ?, ?, ?, ?, ?)`).run(id, solutionId, userId, active?.id || null, plan.actionClass, status, JSON.stringify(plan));
    return { id, baseSnapshotId: active?.id || null, status };
  })();
}

export function acceptChangeImpactPlan(solutionId: string, userId: string, planId: string) {
  return productSqlite.transaction(() => {
    assertSolutionOwner(solutionId, userId);
    const plan = productSqlite.prepare(`SELECT id, status, base_snapshot_id AS baseSnapshotId, plan_json AS planJson
      FROM change_impact_plans WHERE id = ? AND solution_id = ? AND user_id = ?`).get(planId, solutionId, userId) as
      { id: string; status: string; baseSnapshotId: string | null; planJson: string } | undefined;
    if (!plan) throw new Error("CHANGE_IMPACT_PLAN_NOT_FOUND");
    if (plan.status === "blocked" || (JSON.parse(plan.planJson).conflicts || []).length > 0) throw new Error("CHANGE_IMPACT_PLAN_BLOCKED");
    if (plan.status !== "planned") throw new Error("CHANGE_IMPACT_PLAN_NOT_ACCEPTABLE");
    const active = productSqlite.prepare("SELECT id FROM project_model_snapshots WHERE solution_id = ? AND status = 'active'").get(solutionId) as { id: string } | undefined;
    if ((active?.id || null) !== plan.baseSnapshotId) throw new Error("CHANGE_IMPACT_PLAN_STALE");
    const changed = productSqlite.prepare(`UPDATE change_impact_plans SET status = 'accepted', updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND solution_id = ? AND user_id = ? AND status = 'planned' AND base_snapshot_id IS ?`).run(planId, solutionId, userId, plan.baseSnapshotId).changes;
    if (changed !== 1) throw new Error("CHANGE_IMPACT_PLAN_NOT_ACCEPTABLE");
    return { planId, status: "accepted", baseSnapshotId: plan.baseSnapshotId };
  })();
}

export function executeChangeImpactPlan(solutionId: string, userId: string, planId: string, candidateSnapshotId: string) {
  return productSqlite.transaction(() => {
    assertSolutionOwner(solutionId, userId);
    const plan = productSqlite.prepare(`SELECT id, status, execution_started_at AS executionStartedAt, base_snapshot_id AS baseSnapshotId, plan_json AS planJson
      FROM change_impact_plans WHERE id = ? AND solution_id = ? AND user_id = ?`).get(planId, solutionId, userId) as
      { id: string; status: string; executionStartedAt: string | null; baseSnapshotId: string | null; planJson: string } | undefined;
    if (!plan) throw new Error("CHANGE_IMPACT_PLAN_NOT_FOUND");
    if (plan.status !== "accepted" || plan.executionStartedAt) throw new Error("CHANGE_IMPACT_PLAN_NOT_EXECUTABLE");
    const current = productSqlite.prepare("SELECT id FROM project_model_snapshots WHERE solution_id = ? AND status = 'active'").get(solutionId) as { id: string } | undefined;
    if ((current?.id || null) !== plan.baseSnapshotId) throw new Error("CHANGE_IMPACT_PLAN_STALE");
    const candidate = productSqlite.prepare(`SELECT id, version, parent_snapshot_id AS parentSnapshotId, model_json AS modelJson
      FROM project_model_snapshots WHERE id = ? AND solution_id = ? AND status = 'candidate'`).get(candidateSnapshotId, solutionId) as
      { id: string; version: number; parentSnapshotId: string | null; modelJson: string } | undefined;
    if (!candidate || candidate.parentSnapshotId !== plan.baseSnapshotId) throw new Error("CHANGE_IMPACT_CANDIDATE_NOT_BASED_ON_PLAN");
    const doc = productSqlite.prepare("SELECT 1 FROM formal_documents WHERE solution_id = ?").get(solutionId);
    if (!doc) throw new Error("FORMAL_DOCUMENT_NOT_FOUND");
    const savedPlan = JSON.parse(plan.planJson) as Record<string, any>;
    if (savedPlan.actionClass === "S") validateSemanticCandidate(solutionId, plan.baseSnapshotId!, candidate.id, savedPlan);
    const baseEntities = productSqlite.prepare("SELECT entity_key AS entityKey, entity_kind AS entityKind FROM project_model_entities WHERE snapshot_id = ?").all(plan.baseSnapshotId) as Array<{ entityKey: string; entityKind: string }>;
    const changedEntities = savedPlan.impactedTargets.flatMap((target: { id: string }) => {
      const entity = baseEntities.find(({ entityKey }) => entityKey === target.id);
      return entity ? [{ key: entity.entityKey, kind: entity.entityKind }] : [];
    });
    const sectionTargets = projectModelSectionImpacts(changedEntities, savedPlan.actionClass === "P");
    if (!sectionTargets.length) throw new Error("CHANGE_IMPACT_HAS_NO_FORMAL_SECTIONS");

    productSqlite.prepare("UPDATE project_model_snapshots SET status = 'superseded' WHERE solution_id = ? AND status = 'active'").run(solutionId);
    productSqlite.prepare(`UPDATE project_model_snapshots SET status = 'active', activated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND solution_id = ? AND status = 'candidate'`).run(candidate.id, solutionId);
    productSqlite.prepare(`DELETE FROM project_model_locks WHERE solution_id = ? AND NOT EXISTS (
      SELECT 1 FROM project_model_entities e JOIN project_model_snapshots s ON s.id = e.snapshot_id
      WHERE s.solution_id = project_model_locks.solution_id AND s.status = 'active' AND e.entity_key = project_model_locks.entity_key
    )`).run(solutionId);
    const sectionKeys = sectionTargets.map(({ sectionKey }) => sectionKey);
    const placeholders = sectionKeys.map(() => "?").join(",");
    productSqlite.prepare(`UPDATE formal_section_attempts SET status = 'failed', error_code = 'CHANGE_IMPACT_REBUILD', completed_at = CURRENT_TIMESTAMP
      WHERE solution_id = ? AND section_id IN (SELECT id FROM formal_sections WHERE solution_id = ? AND section_key IN (${placeholders})) AND status = 'running'`).run(solutionId, solutionId, ...sectionKeys);
    productSqlite.prepare(`UPDATE model_calls SET status = 'failed', error_code = 'CHANGE_IMPACT_REBUILD', completed_at = CURRENT_TIMESTAMP
      WHERE solution_id = ? AND status = 'running' AND purpose LIKE 'formal_section:%'`).run(solutionId);
    productSqlite.prepare(`UPDATE formal_sections SET status = 'pending', content = NULL, summary = NULL, claims_json = NULL,
      structured_items_json = NULL, context_hash = NULL, retry_cycle = retry_cycle + 1, next_attempt_at = NULL,
      failed_at = NULL, lease_owner = NULL, lease_until = NULL, updated_at = CURRENT_TIMESTAMP
      WHERE solution_id = ? AND section_key IN (${placeholders})`).run(solutionId, ...sectionKeys);
    productSqlite.prepare(`UPDATE deliverable_artifacts SET status = 'superseded', updated_at = CURRENT_TIMESTAMP
      WHERE solution_id = ? AND user_id = ? AND status = 'available'`).run(solutionId, userId);
    productSqlite.prepare("UPDATE project_consistency_reports SET status = 'stale', updated_at = CURRENT_TIMESTAMP WHERE solution_id = ?").run(solutionId);
    const first = productSqlite.prepare(`SELECT MIN(section_index) AS sectionIndex FROM formal_sections WHERE solution_id = ? AND section_key IN (${placeholders})`).get(solutionId, ...sectionKeys) as { sectionIndex: number | null };
    productSqlite.prepare(`UPDATE formal_documents SET status = 'pending', current_section = ?, last_error_code = NULL, updated_at = CURRENT_TIMESTAMP WHERE solution_id = ?`).run(first.sectionIndex ?? 0, solutionId);
    productSqlite.prepare(`UPDATE product_solutions SET status = 'processing', stage = 'formal_analysis', render_lease_owner = NULL,
      render_lease_until = NULL, render_next_attempt_at = NULL, render_error_code = NULL, render_failed_at = NULL,
      updated_at = CURRENT_TIMESTAMP WHERE id = ? AND owner_user_id = ?`).run(solutionId, userId);
    const started = productSqlite.prepare(`UPDATE change_impact_plans SET execution_started_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND status = 'accepted' AND execution_started_at IS NULL`).run(planId).changes;
    if (started !== 1) throw new Error("CHANGE_IMPACT_PLAN_NOT_EXECUTABLE");
    return { planId, status: "running", activeSnapshotId: candidate.id, activeVersion: candidate.version, sectionTargets };
  })();
}

function validateSemanticCandidate(solutionId: string, baseSnapshotId: string, candidateSnapshotId: string, plan: Record<string, any>) {
  const base = productSqlite.prepare("SELECT model_json AS modelJson FROM project_model_snapshots WHERE id = ?").get(baseSnapshotId) as { modelJson: string };
  const candidate = productSqlite.prepare("SELECT model_json AS modelJson FROM project_model_snapshots WHERE id = ?").get(candidateSnapshotId) as { modelJson: string };
  const before = JSON.parse(base.modelJson) as ProjectModel;
  const after = JSON.parse(candidate.modelJson) as ProjectModel;
  const identity = (model: ProjectModel) => JSON.stringify({ projectType: model.projectType, identity: model.identity, metrics: model.metrics || {} });
  if (identity(before) !== identity(after)) throw new Error("CHANGE_IMPACT_CANDIDATE_OUTSIDE_PLAN");
  const entityRows = (snapshotId: string) => productSqlite.prepare("SELECT entity_key AS entityKey, entity_json AS entityJson FROM project_model_entities WHERE snapshot_id = ?").all(snapshotId) as Array<{ entityKey: string; entityJson: string }>;
  const oldRows = entityRows(baseSnapshotId), newRows = entityRows(candidateSnapshotId);
  const oldMap = new Map(oldRows.map((row) => [row.entityKey, row.entityJson]));
  const newMap = new Map(newRows.map((row) => [row.entityKey, row.entityJson]));
  const changed = new Set([...oldMap.keys(), ...newMap.keys()].filter((key) => oldMap.get(key) !== newMap.get(key)));
  const allowed = new Set([...plan.directTargets, ...plan.impactedTargets.map((target: { id: string }) => target.id)]);
  const lockRows = productSqlite.prepare(`SELECT e.entity_key AS entityKey FROM project_model_entities e
    LEFT JOIN project_model_locks l ON l.solution_id = ? AND l.entity_key = e.entity_key
    WHERE e.snapshot_id = ? AND (e.model_locked = 1 OR l.entity_key IS NOT NULL)`).all(solutionId, baseSnapshotId) as Array<{ entityKey: string }>;
  if ([...changed].some((key) => !allowed.has(key) || lockRows.some((row) => row.entityKey === key))) throw new Error("CHANGE_IMPACT_CANDIDATE_OUTSIDE_PLAN");
  const relationKey = (model: ProjectModel) => JSON.stringify([...(model.relations || [])].sort((a: any, b: any) => `${a.from}:${a.type}:${a.to}`.localeCompare(`${b.from}:${b.type}:${b.to}`)));
  if (relationKey(before) !== relationKey(after)) {
    const oldRelations = new Set<string>((before.relations || []).map((relation: any) => JSON.stringify(relation)));
    const newRelations = new Set<string>((after.relations || []).map((relation: any) => JSON.stringify(relation)));
    for (const relationText of [...oldRelations, ...newRelations]) {
      if (oldRelations.has(relationText) === newRelations.has(relationText)) continue;
      const relation = JSON.parse(relationText);
      if (![relation.from, relation.to].every((key: string) => allowed.has(key))) throw new Error("CHANGE_IMPACT_CANDIDATE_OUTSIDE_PLAN");
    }
  }
}

export function previewProjectModelImpact(solutionId: string, userId: string, input: { triggerType: string; directTargets: string[] }) {
  if (!input || !["requirement_change", "project_restructure"].includes(input.triggerType)
    || !Array.isArray(input.directTargets) || input.directTargets.length === 0
    || input.directTargets.some((key) => typeof key !== "string"
      || (key !== "PROJECT_MODEL" && !persistedEntityKeyPattern.test(key)))) {
    throw new Error("INVALID_CHANGE_PREVIEW_REQUEST");
  }
  assertSolutionOwner(solutionId, userId);
  const active = productSqlite.prepare("SELECT id FROM project_model_snapshots WHERE solution_id = ? AND status = 'active'").get(solutionId) as { id: string } | undefined;
  if (!active) throw new Error("ACTIVE_PROJECT_MODEL_REQUIRED");
  const entities = productSqlite.prepare(`SELECT entity_key AS entityKey, entity_kind AS entityKind FROM project_model_entities
    WHERE snapshot_id = ? ORDER BY entity_key`).all(active.id) as Array<{ entityKey: string; entityKind: string }>;
  const entityKeys = new Set(entities.map((entity) => entity.entityKey));
  if (input.triggerType === "project_restructure" && (input.directTargets.length !== 1 || input.directTargets[0] !== "PROJECT_MODEL")) {
    throw new Error("PROJECT_RESTRUCTURE_TARGET_MUST_BE_PROJECT_MODEL");
  }
  if (input.triggerType === "requirement_change" && input.directTargets.some((key) => !entityKeys.has(key))) {
    throw new Error("UNKNOWN_CHANGE_TARGET");
  }
  const nodes: Array<{ id: string; kind: string }> = [
    { id: "PROJECT_MODEL", kind: "project_model" },
    ...entities.map(({ entityKey }) => ({ id: entityKey, kind: "semantic" })),
  ];
  const relations = productSqlite.prepare(`SELECT from_key AS fromKey, to_key AS toKey, relation_type AS relationType
    FROM project_model_relations WHERE snapshot_id = ? ORDER BY from_key, to_key, relation_type`).all(active.id) as Array<{ fromKey: string; toKey: string; relationType: string }>;
  const edges = relations.flatMap((relation) => semanticPropagationRelations.has(relation.relationType)
    ? [{ from: relation.fromKey, to: relation.toKey, actions: ["S"] }]
    : relation.relationType === "conflicts_with" ? [] : []);
  edges.push({ from: "PROJECT_MODEL", to: "PROJECT_MODEL", actions: ["P"] });
  for (const { entityKey } of entities) edges.push({ from: "PROJECT_MODEL", to: entityKey, actions: ["P"] });
  const locks = productSqlite.prepare(`SELECT e.entity_key AS entityKey FROM project_model_entities e
    LEFT JOIN project_model_locks l ON l.solution_id = ? AND l.entity_key = e.entity_key
    WHERE e.snapshot_id = ? AND (e.model_locked = 1 OR l.entity_key IS NOT NULL)`).all(solutionId, active.id) as Array<{ entityKey: string }>;
  const directTargets = input.triggerType === "project_restructure" ? ["PROJECT_MODEL"] : input.directTargets;
  const plan = planChangeImpact({ nodes, edges }, input.triggerType, directTargets, locks.map(({ entityKey }) => entityKey));
  const conflictsWith = relations.filter((relation) => relation.relationType === "conflicts_with"
    && (directTargets.includes(relation.fromKey) || directTargets.includes(relation.toKey)));
  const saved = persistChangeImpactPlan(solutionId, userId, plan);
  const entityKinds = new Map(entities.map(({ entityKey, entityKind }) => [entityKey, entityKind]));
  const sectionTargets = projectModelSectionImpacts(
    plan.impactedTargets.flatMap(({ id }) => entityKinds.has(id) ? [{ key: id, kind: entityKinds.get(id)! }] : []),
    plan.actionClass === "P",
  );
  return { ...saved, plan, sectionTargets, policy: PROJECT_MODEL_PROPAGATION_POLICY, relatedConflicts: conflictsWith };
}

function validateProjectModel(value: unknown, solutionId: string): ProjectModel {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("INVALID_PROJECT_MODEL");
  const model = value as ProjectModel;
  const requiredArrays = ["goals", "actors", "scenarios", "requirements", "features", "constraints", "integrations", "dataEntities", "agentCapabilities", "terms", "assumptions", "conflicts", "relations"];
  if (model.schemaVersion !== "1.0" || model.projectId !== solutionId || !uuidPattern.test(model.snapshotId || "")
    || !["software", "integration", "upgrade", "deployment", "ai_agent", "hybrid"].includes(model.projectType)
    || !model.identity || typeof model.identity.displayName !== "string" || typeof model.identity.primaryPurpose !== "string"
    || !model.scope || !Array.isArray(model.scope.included) || !Array.isArray(model.scope.excluded)
    || requiredArrays.some((key) => !Array.isArray(model[key]))) throw new Error("INVALID_PROJECT_MODEL");
  if (Object.keys(model).some((key) => !["schemaVersion", "projectId", "snapshotId", "projectType", "identity", "goals", "scope", "actors", "scenarios", "requirements", "features", "constraints", "integrations", "dataEntities", "agentCapabilities", "terms", "assumptions", "conflicts", "relations", "metrics"].includes(key))
    || !model.identity.displayName.trim() || !model.identity.primaryPurpose.trim()
    || ["secondaryPurposes", "productShapes"].some((key) => model.identity[key] != null && (!Array.isArray(model.identity[key]) || model.identity[key].some((value: unknown) => typeof value !== "string")))
    || ["included", "excluded", "future"].some((key) => model.scope[key] != null && !Array.isArray(model.scope[key]))) throw new Error("INVALID_PROJECT_MODEL");
  if (model.metrics != null && (typeof model.metrics !== "object" || Array.isArray(model.metrics)
    || Object.values(model.metrics).some((value: unknown) => value != null && !["string", "number"].includes(typeof value)))) throw new Error("INVALID_PROJECT_MODEL_METRICS");

  const entities = projectModelEntities(model);
  const byKey = new Map<string, EntityRow>();
  for (const entity of entities) {
    if (!persistedEntityKeyPattern.test(entity.key) || byKey.has(entity.key) || !entity.title.trim()) throw new Error("INVALID_PROJECT_MODEL_ENTITY");
    const parsed = JSON.parse(entity.json) as Record<string, unknown>;
    if ("id" in parsed && (typeof parsed.id !== "string" || !uuidPattern.test(parsed.id))) throw new Error("INVALID_PROJECT_MODEL_ENTITY");
    byKey.set(entity.key, entity);
  }
  for (const relation of model.relations) {
    if (!relation || !byKey.has(relation.from) || !byKey.has(relation.to) || !relationTypes.has(relation.type)
      || !["required", "recommended", "informational"].includes(relation.strength)) throw new Error("INVALID_PROJECT_MODEL_RELATION");
  }
  return model;
}

function projectModelEntities(model: ProjectModel): EntityRow[] {
  const groups: Array<[string, unknown]> = [
    ["goal", model.goals], ["scope_included", model.scope?.included], ["scope_excluded", model.scope?.excluded],
    ["scope_future", model.scope?.future || []], ["actor", model.actors], ["scenario", model.scenarios],
    ["requirement", model.requirements], ["feature", model.features], ["constraint", model.constraints],
    ["integration", model.integrations], ["data_entity", model.dataEntities], ["agent_capability", model.agentCapabilities],
    ["assumption", model.assumptions], ["conflict", model.conflicts],
  ];
  const result: EntityRow[] = [];
  for (const [kind, value] of groups) {
    if (!Array.isArray(value)) throw new Error("INVALID_PROJECT_MODEL_COLLECTION");
    for (const item of value) {
      if (!item || typeof item !== "object" || typeof item.key !== "string") throw new Error("INVALID_PROJECT_MODEL_ENTITY");
      const title = typeof item.title === "string" ? item.title : typeof item.summary === "string" ? item.summary : item.key;
      if (kind === "assumption") {
        if (typeof item.id !== "string" || !uuidPattern.test(item.id) || typeof item.description !== "string" || !item.description.trim()
          || !["low", "medium", "high"].includes(item.impact) || !["active", "confirmed", "rejected", "expired"].includes(item.status)
          || (item.sourceRefs != null && !Array.isArray(item.sourceRefs))) throw new Error("INVALID_PROJECT_MODEL_ASSUMPTION");
        for (const source of item.sourceRefs || []) {
          if (!source || !["source_block", "user_decision", "assumption"].includes(source.kind)
            || typeof source.refId !== "string" || !uuidPattern.test(source.refId) || !sourceRoles.has(source.role)) throw new Error("INVALID_PROJECT_MODEL_SOURCE_REF");
        }
      } else if (kind === "conflict") {
        if (typeof item.id !== "string" || !uuidPattern.test(item.id) || typeof item.summary !== "string" || !item.summary.trim()
          || !["info", "warning", "direction_blocking", "project_blocking"].includes(item.severity)
          || !["open", "resolved", "accepted_as_assumption"].includes(item.status) || !Array.isArray(item.evidenceRefs) || item.evidenceRefs.length < 2) throw new Error("INVALID_PROJECT_MODEL_CONFLICT");
      } else {
        if (typeof item.id !== "string" || !uuidPattern.test(item.id) || typeof item.title !== "string" || !item.title.trim()
          || typeof item.description !== "string" || typeof item.confidence !== "string" || !confidences.has(item.confidence)
          || typeof item.visibility !== "string" || !visibilities.has(item.visibility) || !Array.isArray(item.sourceRefs)
          || (item.locked != null && typeof item.locked !== "boolean")) throw new Error("INVALID_PROJECT_MODEL_ENTITY");
        for (const source of item.sourceRefs) {
          if (!source || !["source_block", "user_decision", "assumption"].includes(source.kind)
            || typeof source.refId !== "string" || !uuidPattern.test(source.refId) || !sourceRoles.has(source.role)) throw new Error("INVALID_PROJECT_MODEL_SOURCE_REF");
        }
        if (kind === "requirement" && (!Array.isArray(item.acceptanceCriteria) || !["must", "should", "could", "wont", "unknown"].includes(item.priority)
          || !["business", "user", "functional", "non_functional", "constraint"].includes(item.requirementType))) throw new Error("INVALID_PROJECT_MODEL_REQUIREMENT");
        if (kind === "feature" && (typeof item.systemKey !== "string" || typeof item.moduleKey !== "string"
          || !["low", "medium", "high", "unknown"].includes(item.complexity))) throw new Error("INVALID_PROJECT_MODEL_FEATURE");
      }
      result.push({ key: item.key, kind, title, locked: item.locked === true, json: JSON.stringify(item) });
    }
  }
  for (const term of model.terms || []) {
    if (!term || typeof term.term !== "string" || !term.term.trim() || typeof term.definition !== "string" || !term.definition.trim()
      || (term.locked != null && typeof term.locked !== "boolean")
      || (term.sourceRefs != null && !Array.isArray(term.sourceRefs))
      || (term.aliases != null && (!Array.isArray(term.aliases) || term.aliases.some((alias: unknown) => typeof alias !== "string")))) throw new Error("INVALID_PROJECT_MODEL_TERM");
    for (const source of term.sourceRefs || []) {
      if (!source || !["source_block", "user_decision", "assumption"].includes(source.kind)
        || typeof source.refId !== "string" || !uuidPattern.test(source.refId) || !sourceRoles.has(source.role)) throw new Error("INVALID_PROJECT_MODEL_SOURCE_REF");
    }
    const key = `TERM-${createHash("sha256").update(term.term.trim().normalize("NFC")).digest("hex").slice(0, 12).toUpperCase()}`;
    result.push({ key, kind: "term", title: term.term, locked: term.locked === true, json: JSON.stringify(term) });
  }
  return result;
}

function assertSolutionOwner(solutionId: string, userId: string) {
  const solution = productSqlite.prepare(`SELECT 1 FROM product_solutions WHERE id = ? AND owner_user_id = ?
    AND status NOT IN ('deletion_pending', 'deleted')`).get(solutionId, userId);
  if (!solution) throw new Error("SOLUTION_NOT_FOUND");
}
