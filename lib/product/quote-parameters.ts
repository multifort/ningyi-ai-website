import { createHash } from "crypto";
import { productSqlite } from "./db";
import { recordProjectEvent } from "./project-events";

const PARAMETER_KEYS = ["base_days", "complexity_factor", "reuse_factor", "integration_factor", "security_factor", "uncertainty_factor", "daily_rate", "tax_rate", "discount_rate", "valid_days", "budget_min", "budget_max"] as const;
const PARAMETER_LABELS: Record<(typeof PARAMETER_KEYS)[number], string> = {
  base_days: "基准人天", complexity_factor: "复杂度系数", reuse_factor: "复用系数", integration_factor: "集成系数",
  security_factor: "安全系数", uncertainty_factor: "不确定性系数", daily_rate: "日单价", tax_rate: "税率",
  discount_rate: "折扣率", valid_days: "报价有效天数", budget_min: "预算下限", budget_max: "预算上限",
};
type Item = { kind: string; code: string; title: string; attributes?: Array<{ key: string; value: string }> };

export function listQuoteParameters(solutionId: string, userId: string) {
  assertOwner(solutionId, userId);
  const items = withDefaultQuoteAssumption(readItems(solutionId));
  const overrides = readOverrides(solutionId);
  return items.filter((item) => item.kind === "estimation_item" || item.kind === "quote_assumption").map((item) => ({
    code: item.code,
    title: item.title,
    kind: item.kind,
    parameters: PARAMETER_KEYS.filter((key) => item.kind === "estimation_item" ? !["valid_days", "budget_min", "budget_max"].includes(key) : !["base_days", "complexity_factor", "reuse_factor", "integration_factor", "security_factor", "uncertainty_factor"].includes(key)).map((key) => {
      const source = item.attributes?.find((attribute) => attribute.key === key)?.value;
      const sourceValue = source != null && /^-?\d+(?:\.\d+)?$/.test(source.trim()) ? Number(source) : null;
      const overrideValue = overrides.get(`${item.code}:${key}`) ?? null;
      return { key, label: PARAMETER_LABELS[key], sourceValue, overrideValue, value: overrideValue ?? sourceValue };
    }),
  }));
}

export function updateQuoteParameters(solutionId: string, userId: string, changes: unknown) {
  assertOwner(solutionId, userId);
  if (!Array.isArray(changes) || changes.length < 1 || changes.length > 200) throw new Error("INVALID_QUOTE_PARAMETER_CHANGES");
  const sections = productSqlite.prepare("SELECT structured_items_json AS itemsJson FROM formal_sections WHERE solution_id = ? AND status = 'validated'").all(solutionId) as Array<{ itemsJson: string | null }>;
  if (sections.length !== 7) throw new Error("FORMAL_DOCUMENT_INCOMPLETE");
  const items = withDefaultQuoteAssumption(readItems(solutionId));
  const byCode = new Map<string, Item>();
  for (const item of items) if (item.kind === "estimation_item" || item.kind === "quote_assumption") {
    if (!item.code || byCode.has(item.code)) throw new Error("QUOTE_PARAMETER_ITEM_AMBIGUOUS");
    byCode.set(item.code, item);
  }
  const seen = new Set<string>();
  const normalized = changes.map((change: any) => {
    if (!change || typeof change.code !== "string" || typeof change.key !== "string" || !(PARAMETER_KEYS as readonly string[]).includes(change.key)
      || !byCode.has(change.code) || !Array.isArray(byCode.get(change.code)?.attributes)) throw new Error("INVALID_QUOTE_PARAMETER_CHANGE");
    const item = byCode.get(change.code)!;
    const applicable = item.kind === "estimation_item" ? !["valid_days", "budget_min", "budget_max"].includes(change.key) : !["base_days", "complexity_factor", "reuse_factor", "integration_factor", "security_factor", "uncertainty_factor"].includes(change.key);
    if (!applicable) throw new Error("INVALID_QUOTE_PARAMETER_CHANGE");
    const id = `${change.code}:${change.key}`;
    if (seen.has(id)) throw new Error("DUPLICATE_QUOTE_PARAMETER_CHANGE");
    seen.add(id);
    if (change.value !== null && (typeof change.value !== "number" || !Number.isFinite(change.value) || !withinBounds(change.key, change.value))) throw new Error("INVALID_QUOTE_PARAMETER_VALUE");
    return { code: change.code, key: change.key, value: change.value };
  });
  const update = productSqlite.prepare(`INSERT INTO quote_parameter_overrides (solution_id, user_id, item_code, parameter_key, value)
    VALUES (?, ?, ?, ?, ?) ON CONFLICT(solution_id, item_code, parameter_key) DO UPDATE SET user_id = excluded.user_id,
    value = excluded.value, updated_at = CURRENT_TIMESTAMP`);
  const invalidated = productSqlite.transaction(() => {
    for (const change of normalized) {
      if (change.value === null) productSqlite.prepare("DELETE FROM quote_parameter_overrides WHERE solution_id = ? AND item_code = ? AND parameter_key = ?").run(solutionId, change.code, change.key);
      else update.run(solutionId, userId, change.code, change.key, change.value);
    }
    const affectsEstimate = normalized.some(({ key }) => ["base_days", "complexity_factor", "reuse_factor", "integration_factor", "security_factor", "uncertainty_factor"].includes(key));
    const artifacts = affectsEstimate ? ["workload_estimate_xlsx", "project_quote_xlsx", "project_quote_pdf"] : ["project_quote_xlsx", "project_quote_pdf"];
    const result = productSqlite.prepare(`UPDATE deliverable_artifacts SET status = 'superseded', updated_at = CURRENT_TIMESTAMP
      WHERE solution_id = ? AND user_id = ? AND status = 'available' AND artifact_type IN (${artifacts.map(() => "?").join(",")})`).run(solutionId, userId, ...artifacts);
    if (result.changes > 0) productSqlite.prepare(`UPDATE product_solutions SET status = 'processing', stage = 'rendering', render_attempt_count = 0,
      render_next_attempt_at = NULL, render_error_code = NULL, render_failed_at = NULL, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND owner_user_id = ?`).run(solutionId, userId);
    return { count: result.changes, artifacts: result.changes ? artifacts : [] };
  })();
  recordProjectEvent({ solutionId, userId, type: "quote_parameters_updated", summary: `更新了 ${normalized.length} 项估算或报价参数`, metadata: { changes: normalized.map(({ code, key }) => ({ code, key })), invalidatedArtifacts: invalidated.artifacts } });
  return { updated: normalized.length, renderQueued: invalidated.count > 0, invalidatedArtifacts: invalidated.artifacts };
}

export function quoteParameterOverrides(solutionId: string) { return readOverrides(solutionId); }

export function quoteParameterFingerprint(solutionId: string, includeEstimateInputs = false, estimateOnly = false) {
  const estimateKeys = ["base_days", "complexity_factor", "reuse_factor", "integration_factor", "security_factor", "uncertainty_factor"];
  const keys = estimateOnly ? estimateKeys : includeEstimateInputs ? [...PARAMETER_KEYS] : PARAMETER_KEYS.filter((key) => !estimateKeys.includes(key));
  const rows = productSqlite.prepare(`SELECT item_code AS itemCode, parameter_key AS parameterKey, value FROM quote_parameter_overrides
    WHERE solution_id = ? AND parameter_key IN (${keys.map(() => "?").join(",")}) ORDER BY item_code, parameter_key`).all(solutionId, ...keys);
  return createHash("sha256").update(JSON.stringify(rows)).digest("hex");
}

function readItems(solutionId: string) {
  const rows = productSqlite.prepare("SELECT structured_items_json AS itemsJson FROM formal_sections WHERE solution_id = ? AND status = 'validated'").all(solutionId) as Array<{ itemsJson: string | null }>;
  return rows.flatMap(({ itemsJson }) => {
    try { const items = JSON.parse(itemsJson || "[]"); return Array.isArray(items) ? items as Item[] : []; } catch { return []; }
  });
}
function withDefaultQuoteAssumption(items: Item[]): Item[] {
  return items.some((item) => item.kind === "quote_assumption") ? items : [...items, { kind: "quote_assumption", code: "QUOTE-DEFAULT", title: "项目报价整体参数", attributes: [] }];
}
function readOverrides(solutionId: string) {
  const rows = productSqlite.prepare("SELECT item_code AS itemCode, parameter_key AS parameterKey, value FROM quote_parameter_overrides WHERE solution_id = ?").all(solutionId) as Array<{ itemCode: string; parameterKey: string; value: number }>;
  return new Map(rows.map((row) => [`${row.itemCode}:${row.parameterKey}`, row.value]));
}
function assertOwner(solutionId: string, userId: string) {
  if (!productSqlite.prepare("SELECT 1 FROM product_solutions WHERE id = ? AND owner_user_id = ? AND status NOT IN ('deletion_pending','deleted')").get(solutionId, userId)) throw new Error("SOLUTION_NOT_FOUND");
}
function withinBounds(key: string, value: number) {
  if (["tax_rate", "discount_rate"].includes(key)) return value >= 0 && value <= 1;
  if (["complexity_factor", "reuse_factor", "integration_factor", "security_factor", "uncertainty_factor"].includes(key)) return value > 0 && value <= 10;
  if (key === "valid_days") return Number.isInteger(value) && value >= 1 && value <= 365;
  return value >= 0 && value <= 100_000_000;
}
