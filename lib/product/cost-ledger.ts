import { createHash, randomUUID } from "crypto";
import { productSqlite } from "./db";

function normalizeWindow(from?: string, to?: string) {
  const end = to && !Number.isNaN(Date.parse(to)) ? new Date(to) : new Date();
  const start = from && !Number.isNaN(Date.parse(from)) ? new Date(from) : new Date(end.getTime() - 30 * 86400_000);
  if (start >= end) throw new Error("INVALID_BILLING_PERIOD");
  return { from: start.toISOString(), to: end.toISOString(), fromSql: start.toISOString().replace("T", " ").slice(0, 19), toSql: end.toISOString().replace("T", " ").slice(0, 19) };
}

export function getCostLedger(from?: string, to?: string) {
  const window = normalizeWindow(from, to);
  const rows = productSqlite.prepare(`SELECT solution_id AS solutionId, purpose, provider, model, status,
    COALESCE(input_tokens, 0) AS inputTokens, COALESCE(output_tokens, 0) AS outputTokens,
    COALESCE(estimated_cost_microusd, 0) AS estimatedCostMicrousd
    FROM model_calls WHERE created_at >= ? AND created_at < ?`).all(window.fromSql, window.toSql) as Array<Record<string, any>>;
  const calibrations = productSqlite.prepare(`SELECT provider, model, variance_ratio AS varianceRatio FROM provider_billing_calibrations
    WHERE period_to >= ? AND period_from < ? ORDER BY created_at DESC`).all(window.fromSql, window.toSql) as Array<{ provider: string; model: string; varianceRatio: number }>;
  const ratios = new Map(calibrations.map((item) => [`${item.provider}:${item.model}`, item.varianceRatio]));
  const map = new Map<string, { dimension: string; calls: number; failedCalls: number; inputTokens: number; outputTokens: number; estimatedCostMicrousd: number; calibratedCostMicrousd: number }>();
  const add = (dimension: string, row: Record<string, any>) => {
    const item = map.get(dimension) || { dimension, calls: 0, failedCalls: 0, inputTokens: 0, outputTokens: 0, estimatedCostMicrousd: 0, calibratedCostMicrousd: 0 };
    const estimated = Number(row.estimatedCostMicrousd || 0);
    const ratio = ratios.get(`${row.provider}:${row.model}`) || 1;
    item.calls++; item.failedCalls += row.status === "failed" ? 1 : 0; item.inputTokens += Number(row.inputTokens); item.outputTokens += Number(row.outputTokens);
    item.estimatedCostMicrousd += estimated; item.calibratedCostMicrousd += Math.round(estimated * ratio);
    map.set(dimension, item);
  };
  for (const row of rows) {
    add(`stage:${row.purpose === "free_analysis" ? "free_analysis" : row.purpose.startsWith("formal_section:") ? "formal_analysis" : row.purpose.startsWith("media_analysis:") ? "media_analysis" : "other"}`, row);
    add(`provider:${row.provider}/${row.model}`, row);
    add(`project:${createHash("sha256").update(row.solutionId).digest("hex").slice(0, 16)}`, row);
  }
  const items = [...map.values()].sort((a, b) => a.dimension.localeCompare(b.dimension));
  const totals = rows.reduce((value, row) => ({ calls: value.calls + 1, failedCalls: value.failedCalls + (row.status === "failed" ? 1 : 0), inputTokens: value.inputTokens + Number(row.inputTokens), outputTokens: value.outputTokens + Number(row.outputTokens), estimatedCostMicrousd: value.estimatedCostMicrousd + Number(row.estimatedCostMicrousd) }), { calls: 0, failedCalls: 0, inputTokens: 0, outputTokens: 0, estimatedCostMicrousd: 0 });
  const calibratedCostMicrousd = rows.reduce((sum, row) => sum + Math.round(Number(row.estimatedCostMicrousd) * (ratios.get(`${row.provider}:${row.model}`) || 1)), 0);
  return { window: { from: window.from, to: window.to }, totals: { ...totals, calibratedCostMicrousd }, items, calibrationCount: calibrations.length };
}

export function recordBillingCalibration(input: { provider: string; model: string; periodFrom: string; periodTo: string; actualCostMicrousd: number; invoiceReference?: string }) {
  if (!/^[a-z0-9_.-]{2,80}$/i.test(input.provider) || !/^[a-z0-9_.:-]{2,120}$/i.test(input.model)) throw new Error("INVALID_PROVIDER_MODEL");
  const window = normalizeWindow(input.periodFrom, input.periodTo);
  const actual = Math.round(Number(input.actualCostMicrousd));
  if (!Number.isSafeInteger(actual) || actual < 0) throw new Error("INVALID_ACTUAL_COST");
  const estimated = (productSqlite.prepare(`SELECT COALESCE(SUM(estimated_cost_microusd), 0) AS total FROM model_calls
    WHERE provider = ? AND model = ? AND created_at >= ? AND created_at < ?`).get(input.provider, input.model, window.fromSql, window.toSql) as { total: number }).total;
  const ratio = estimated > 0 ? actual / estimated : actual === 0 ? 1 : 0;
  if (estimated === 0 && actual > 0) throw new Error("NO_ESTIMATED_COST_TO_CALIBRATE");
  const id = randomUUID();
  const referenceHash = input.invoiceReference ? createHash("sha256").update(input.invoiceReference).digest("hex") : null;
  productSqlite.prepare(`INSERT INTO provider_billing_calibrations
    (id, provider, model, period_from, period_to, estimated_cost_microusd, actual_cost_microusd, variance_ratio, invoice_reference_hash)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(provider, model, period_from, period_to) DO UPDATE SET estimated_cost_microusd = excluded.estimated_cost_microusd,
    actual_cost_microusd = excluded.actual_cost_microusd, variance_ratio = excluded.variance_ratio,
    invoice_reference_hash = excluded.invoice_reference_hash, created_at = CURRENT_TIMESTAMP`).run(id, input.provider, input.model, window.fromSql, window.toSql, estimated, actual, ratio, referenceHash);
  const stored = productSqlite.prepare("SELECT id FROM provider_billing_calibrations WHERE provider = ? AND model = ? AND period_from = ? AND period_to = ?").get(input.provider, input.model, window.fromSql, window.toSql) as { id: string };
  return { id: stored.id, provider: input.provider, model: input.model, periodFrom: window.from, periodTo: window.to, estimatedCostMicrousd: estimated, actualCostMicrousd: actual, varianceRatio: ratio };
}
