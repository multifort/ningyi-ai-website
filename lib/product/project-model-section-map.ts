import { productSqlite } from "./db";

export const FORMAL_SECTION_KEYS = [
  "project_overview", "scope_users", "requirements", "solution", "workload", "implementation", "risks",
] as const;

const sectionKinds: Record<(typeof FORMAL_SECTION_KEYS)[number], string[]> = {
  project_overview: ["goal"],
  scope_users: ["scope_included", "scope_excluded", "scope_future", "actor", "constraint"],
  requirements: ["scenario", "requirement", "feature", "agent_capability"],
  solution: ["feature", "integration", "data_entity", "constraint", "agent_capability"],
  workload: ["requirement", "feature", "integration", "data_entity"],
  implementation: ["scenario", "feature", "integration", "constraint"],
  risks: ["scope_excluded", "constraint", "assumption", "conflict", "integration"],
};

export function sectionsForProjectModelEntityKind(kind: string): string[] {
  if (kind === "term") return [...FORMAL_SECTION_KEYS];
  return FORMAL_SECTION_KEYS.filter((sectionKey) => sectionKinds[sectionKey].includes(kind));
}

export function projectModelSectionImpacts(impactedEntities: Array<{ key: string; kind: string }>, rebuildProjectModel = false) {
  const impacted = new Map<string, Set<string>>();
  for (const entity of impactedEntities) {
    for (const sectionKey of sectionsForProjectModelEntityKind(entity.kind)) {
      const keys = impacted.get(sectionKey) || new Set<string>();
      keys.add(entity.key);
      impacted.set(sectionKey, keys);
    }
  }
  if (rebuildProjectModel) for (const sectionKey of FORMAL_SECTION_KEYS) impacted.set(sectionKey, new Set(["PROJECT_MODEL"]));
  return FORMAL_SECTION_KEYS.filter((sectionKey) => impacted.has(sectionKey)).map((sectionKey) => ({
    sectionKey,
    entityKeys: [...(impacted.get(sectionKey) || [])].sort(),
  }));
}

/** Produces compact, section-relevant model context; raw UUIDs/source refs are intentionally omitted. */
export function projectModelSectionContext(solutionId: string, sectionKey: string): string {
  if (!FORMAL_SECTION_KEYS.includes(sectionKey as (typeof FORMAL_SECTION_KEYS)[number])) return "";
  const active = productSqlite.prepare(`SELECT id, model_json AS modelJson FROM project_model_snapshots
    WHERE solution_id = ? AND status = 'active'`).get(solutionId) as { id: string; modelJson: string } | undefined;
  if (!active) return "";
  const kinds = sectionKinds[sectionKey as (typeof FORMAL_SECTION_KEYS)[number]];
  const entities = productSqlite.prepare(`SELECT entity_key AS entityKey, entity_kind AS entityKind, entity_json AS entityJson
    FROM project_model_entities WHERE snapshot_id = ? AND entity_kind IN (${kinds.map(() => "?").join(",")}) ORDER BY entity_key`).all(active.id, ...kinds) as Array<{ entityKey: string; entityKind: string; entityJson: string }>;
  const termRows = productSqlite.prepare(`SELECT entity_key AS entityKey, entity_json AS entityJson FROM project_model_entities
    WHERE snapshot_id = ? AND entity_kind = 'term' ORDER BY entity_key`).all(active.id) as Array<{ entityKey: string; entityJson: string }>;
  const model = JSON.parse(active.modelJson) as Record<string, any>;
  const selectedKeys = new Set(entities.map(({ entityKey }) => entityKey));
  const terms = termRows.map(({ entityJson }) => JSON.parse(entityJson) as { term: string; definition: string; aliases?: string[]; locked?: boolean });
  const relations = (model.relations || []).filter((relation: any) => selectedKeys.has(relation.from) || selectedKeys.has(relation.to))
    .map((relation: any) => ({ from: relation.from, to: relation.to, type: relation.type, strength: relation.strength }));
  const records = entities.map(({ entityKey, entityKind, entityJson }) => {
    const entity = JSON.parse(entityJson) as Record<string, any>;
    return {
      key: entityKey,
      kind: entityKind,
      title: entity.title || entity.summary || entityKey,
      description: entity.description || entity.summary || undefined,
      confidence: entity.confidence || undefined,
      locked: entity.locked === true,
      ...(entity.priority ? { priority: entity.priority } : {}),
      ...(entity.requirementType ? { requirementType: entity.requirementType } : {}),
      ...(entity.acceptanceCriteria?.length ? { acceptanceCriteria: entity.acceptanceCriteria } : {}),
      ...(entity.complexity ? { complexity: entity.complexity } : {}),
      ...(entity.moduleKey ? { module: entity.moduleKey } : {}),
    };
  });
  const identity = sectionKey === "project_overview" ? {
    projectType: model.projectType,
    displayName: model.identity?.displayName,
    primaryPurpose: model.identity?.primaryPurpose,
    secondaryPurposes: model.identity?.secondaryPurposes || [],
  } : undefined;
  const payload = { identity, entities: records, terms, relations };
  if (!records.length && !terms.length && !identity) return "";
  return `正式项目模型（活动版本 ${active.id.slice(0, 8)}；本章相关内容）:\n${JSON.stringify(payload)}`;
}
