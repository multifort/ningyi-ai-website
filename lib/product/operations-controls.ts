import { productSqlite } from "./db";

export type OperationsControlKey = "hold_rollout" | "throttle_free_analysis" | "defer_new_formal";

export function isOperationsControlEnabled(key: OperationsControlKey) {
  const row = productSqlite.prepare("SELECT enabled FROM operations_controls WHERE control_key = ?").get(key) as { enabled: number } | undefined;
  return row?.enabled === 1;
}

export function applyOperationsControls(snapshotId: string, alerts: Array<{ code: string; severity: string; automaticAction: string }>) {
  const critical = new Set(alerts.filter((alert) => alert.severity === "critical").map((alert) => alert.code));
  const desired: Record<OperationsControlKey, { enabled: boolean; reason: string | null }> = {
    hold_rollout: { enabled: critical.has("SUCCESS_RATE_LOW") || critical.has("DELIVERY_RATE_LOW"), reason: critical.has("SUCCESS_RATE_LOW") ? "SUCCESS_RATE_LOW" : critical.has("DELIVERY_RATE_LOW") ? "DELIVERY_RATE_LOW" : null },
    throttle_free_analysis: { enabled: critical.has("COST_ANOMALY"), reason: critical.has("COST_ANOMALY") ? "COST_ANOMALY" : null },
    defer_new_formal: { enabled: critical.has("COST_ANOMALY") || critical.has("PROVIDER_FAILURE_HIGH"), reason: critical.has("COST_ANOMALY") ? "COST_ANOMALY" : critical.has("PROVIDER_FAILURE_HIGH") ? "PROVIDER_FAILURE_HIGH" : null },
  };
  const upsert = productSqlite.prepare(`INSERT INTO operations_controls (control_key, enabled, reason_code, source_snapshot_id)
    VALUES (?, ?, ?, ?) ON CONFLICT(control_key) DO UPDATE SET enabled = excluded.enabled, reason_code = excluded.reason_code,
    source_snapshot_id = excluded.source_snapshot_id, updated_at = CURRENT_TIMESTAMP`);
  productSqlite.transaction(() => {
    for (const [key, value] of Object.entries(desired)) upsert.run(key, value.enabled ? 1 : 0, value.reason, snapshotId);
    if (!desired.defer_new_formal.enabled) productSqlite.prepare("UPDATE formal_documents SET status = 'pending', updated_at = CURRENT_TIMESTAMP WHERE status = 'deferred_operations'").run();
  })();
  return desired;
}
