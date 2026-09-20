import { productSqlite } from "./db";

type StructuredItem = {
  kind: string;
  code: string;
  title: string;
  sourceBlockIds: string[];
  attributes: Array<{ key: string; value: string }>;
};

type ConsistencyIssue = { code: string; severity: "error" | "warning"; message: string; itemCodes: string[] };

const relationKeys: Record<string, string[]> = {
  requirement: ["feature_codes"],
  feature: ["requirement_codes"],
  estimation_item: ["feature_codes"],
  phase: ["estimation_codes", "feature_codes"],
  milestone: ["phase_codes"],
  risk: ["requirement_codes", "feature_codes", "phase_codes"],
  quote_assumption: ["estimation_codes"],
};

export function evaluateProjectConsistency(solutionId: string, persist = true) {
  const sections = productSqlite.prepare("SELECT structured_items_json AS structuredItemsJson FROM formal_sections WHERE solution_id = ? AND status = 'validated'").all(solutionId) as Array<{ structuredItemsJson: string | null }>;
  const sourceIds = new Set((productSqlite.prepare(`SELECT id FROM source_blocks WHERE solution_id = ?
    UNION ALL SELECT id FROM project_user_facts WHERE solution_id = ? AND status = 'active'`).all(solutionId, solutionId) as Array<{ id: string }>).map((item) => item.id));
  const items = sections.flatMap((section) => parseItems(section.structuredItemsJson));
  const codes = new Map<string, StructuredItem[]>();
  items.forEach((item) => codes.set(item.code, [...(codes.get(item.code) || []), item]));
  const issues: ConsistencyIssue[] = [];

  for (const [code, matches] of codes) {
    if (matches.length > 1) issues.push({ code: "DUPLICATE_ITEM_CODE", severity: "error", message: `结构化编号 ${code} 在多个成果对象中重复。`, itemCodes: [code] });
  }
  for (const item of items) {
    const unknownSources = item.sourceBlockIds.filter((id) => !sourceIds.has(id));
    if (unknownSources.length) issues.push({ code: "UNKNOWN_SOURCE_REFERENCE", severity: "error", message: `${item.code} 引用了不属于当前项目的来源块。`, itemCodes: [item.code] });
    for (const key of relationKeys[item.kind] || []) {
      const targets = attributeCodes(item, key);
      const unknown = targets.filter((code) => !codes.has(code));
      if (unknown.length) issues.push({ code: "UNKNOWN_RELATION_REFERENCE", severity: "error", message: `${item.code} 的 ${key} 包含不存在的编号：${unknown.join("、")}。`, itemCodes: [item.code, ...unknown] });
    }
  }

  const requirements = items.filter((item) => item.kind === "requirement");
  const features = items.filter((item) => item.kind === "feature");
  const estimates = items.filter((item) => item.kind === "estimation_item");
  const phases = items.filter((item) => item.kind === "phase");
  const coveredRequirements = new Set(features.flatMap((item) => attributeCodes(item, "requirement_codes")));
  const estimatedFeatures = new Set(estimates.flatMap((item) => attributeCodes(item, "feature_codes")));
  const plannedEstimates = new Set(phases.flatMap((item) => attributeCodes(item, "estimation_codes")));
  addCoverageWarning(issues, "REQUIREMENT_FEATURE_COVERAGE", requirements, coveredRequirements, "需求尚未关联功能");
  addCoverageWarning(issues, "FEATURE_ESTIMATION_COVERAGE", features, estimatedFeatures, "功能尚未关联估算项");
  addCoverageWarning(issues, "ESTIMATION_PLAN_COVERAGE", estimates, plannedEstimates, "估算项尚未关联实施阶段");

  const metrics = {
    totalItems: items.length,
    requirementCount: requirements.length,
    featureCount: features.length,
    estimationItemCount: estimates.length,
    phaseCount: phases.length,
    requirementFeatureCoverage: coverage(requirements, coveredRequirements),
    featureEstimationCoverage: coverage(features, estimatedFeatures),
    estimationPlanCoverage: coverage(estimates, plannedEstimates),
  };
  const report = { status: issues.some((issue) => issue.severity === "error") ? "fail" : "pass", metrics, issues };
  if (persist) productSqlite.prepare(`INSERT INTO project_consistency_reports (solution_id, status, report_json)
    VALUES (?, ?, ?) ON CONFLICT(solution_id) DO UPDATE SET status = excluded.status, report_json = excluded.report_json, updated_at = CURRENT_TIMESTAMP`).run(solutionId, report.status, JSON.stringify(report));
  return report;
}

/** Remove only dangling structured relation codes before delivery. Source claims
 * and prose remain untouched; existing valid links and objects are preserved. */
export function repairDanglingProjectRelations(solutionId: string) {
  const rows = productSqlite.prepare("SELECT id, structured_items_json AS structuredItemsJson FROM formal_sections WHERE solution_id = ? AND status = 'validated'").all(solutionId) as Array<{ id: string; structuredItemsJson: string | null }>;
  const items = rows.flatMap((row) => parseItems(row.structuredItemsJson));
  const existingCodes = new Set(items.map((item) => item.code));
  const updates = rows.flatMap((row) => {
    const parsed = parseItems(row.structuredItemsJson);
    let changed = false;
    for (const item of parsed) {
      for (const key of relationKeys[item.kind] || []) {
        const attribute = item.attributes?.find((entry) => entry.key === key);
        if (!attribute) continue;
        const valid = attribute.value.split(/[,，、;；\s]+/).map((code) => code.trim()).filter((code) => code && existingCodes.has(code));
        const normalized = [...new Set(valid)].join(",");
        if (normalized !== attribute.value) { attribute.value = normalized; changed = true; }
      }
    }
    return changed ? [{ id: row.id, value: JSON.stringify(parsed) }] : [];
  });
  const update = productSqlite.prepare("UPDATE formal_sections SET structured_items_json = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?");
  for (const row of updates) update.run(row.value, row.id);
  return { repairedSections: updates.length };
}

export function evaluateCandidateConsistency(solutionId: string, candidateItems: StructuredItem[], allowedSourceIds: Set<string>) {
  const existingRows = productSqlite.prepare("SELECT structured_items_json AS structuredItemsJson FROM formal_sections WHERE solution_id = ? AND status = 'validated'").all(solutionId) as Array<{ structuredItemsJson: string | null }>;
  const existingItems = existingRows.flatMap((row) => parseItems(row.structuredItemsJson));
  const existingCodes = new Set(existingItems.map((item) => item.code));
  const candidateCodes = new Set(candidateItems.map((item) => item.code));
  const availableCodes = new Set([...existingCodes, ...candidateCodes]);
  const checks: Array<{ code: string; passed: boolean; message: string }> = [];
  checks.push({ code: "PROJECT_CODE_UNIQUENESS", passed: candidateItems.every((item) => !existingCodes.has(item.code)) && candidateCodes.size === candidateItems.length, message: "本章结构化编号不得与既有成果对象重复。" });
  checks.push({ code: "PROJECT_SOURCE_OWNERSHIP", passed: candidateItems.every((item) => item.sourceBlockIds.length > 0 && item.sourceBlockIds.every((id) => allowedSourceIds.has(id))), message: "本章结构化对象只能引用当前上下文中的项目来源。" });
  checks.push({ code: "PROJECT_RELATION_TARGETS", passed: candidateItems.every((item) => (relationKeys[item.kind] || []).every((key) => attributeCodes(item, key).every((code) => availableCodes.has(code)))), message: "跨成果关系必须指向已存在或本章同时创建的对象编号。" });
  return { status: checks.every((check) => check.passed) ? "pass" : "fail", checks };
}

export function projectConsistencyStatus(solutionId: string) {
  const row = productSqlite.prepare("SELECT status, report_json AS reportJson, updated_at AS updatedAt FROM project_consistency_reports WHERE solution_id = ?").get(solutionId) as { status: string; reportJson: string; updatedAt: string } | undefined;
  if (!row) return null;
  try { return { ...JSON.parse(row.reportJson), updatedAt: row.updatedAt }; } catch { return { status: row.status, metrics: null, issues: [], updatedAt: row.updatedAt }; }
}

function parseItems(value: string | null): StructuredItem[] {
  if (!value) return [];
  try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed : []; } catch { return []; }
}

function attributeCodes(item: StructuredItem, key: string) {
  const value = item.attributes?.find((attribute) => attribute.key === key)?.value || "";
  return value.split(/[,，、;；\s]+/).map((code) => code.trim()).filter(Boolean);
}

function addCoverageWarning(issues: ConsistencyIssue[], code: string, items: StructuredItem[], covered: Set<string>, label: string) {
  const missing = items.filter((item) => !covered.has(item.code)).map((item) => item.code);
  if (missing.length) issues.push({ code, severity: "warning", message: `${label}：${missing.join("、")}。`, itemCodes: missing });
}

function coverage(items: StructuredItem[], covered: Set<string>) {
  if (!items.length) return null;
  return Number((items.filter((item) => covered.has(item.code)).length / items.length).toFixed(4));
}
