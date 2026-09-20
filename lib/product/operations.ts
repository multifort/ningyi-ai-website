import { randomUUID } from "crypto";
import { productSqlite } from "./db";
import { requiredDeliverableArtifactTypes } from "./deliverable-catalog";
import { unifiedKnowledgeBacklog } from "./unified-knowledge";

type Alert = { code: string; severity: "warning" | "critical"; automaticAction: string };

const numberEnv = (name: string, fallback: number) => {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? value : fallback;
};

function percentile(values: number[], fraction: number) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)];
}

function secondsBetween(start?: string | null, end?: string | null) {
  if (!start || !end) return 0;
  const value = (Date.parse(`${end}Z`) - Date.parse(`${start}Z`)) / 1000;
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

export function createOperationsSnapshot(hours = 24) {
  const snapshotId = randomUUID();
  const safeHours = Math.min(168, Math.max(1, Math.floor(hours)));
  const windowTo = new Date();
  const windowFrom = new Date(windowTo.getTime() - safeHours * 3600_000);
  const fromSql = windowFrom.toISOString().replace("T", " ").slice(0, 19);

  const runs = productSqlite.prepare(`SELECT status, error_code, attempt_count AS attemptCount, created_at AS createdAt,
    started_at AS startedAt, completed_at AS completedAt FROM processing_runs WHERE created_at >= ?`).all(fromSql) as Array<Record<string, any>>;
  const terminal = runs.filter((run) => ["completed", "succeeded", "failed"].includes(run.status));
  const succeeded = terminal.filter((run) => ["completed", "succeeded"].includes(run.status));
  const durations = terminal.map((run) => secondsBetween(run.startedAt || run.createdAt, run.completedAt)).filter(Boolean);
  const queued = runs.filter((run) => ["queued", "retry_wait", "recovering"].includes(run.status));
  const sourceRetryExhausted = runs.filter((run) => run.status === "failed" && run.error_code === "SOURCE_RETRY_EXHAUSTED").length;

  const solutions = productSqlite.prepare(`SELECT id, status, stage FROM product_solutions WHERE created_at >= ?`).all(fromSql) as Array<{ id: string; status: string; stage: string }>;
  const completedSolutions = solutions.filter((solution) => solution.status === "completed");
  const incompleteCompletedDeliveries = countIncompleteCompletedDeliveries();
  const completeDeliveries = completedSolutions.filter((solution) => {
    const rows = productSqlite.prepare("SELECT DISTINCT artifact_type AS artifactType FROM deliverable_artifacts WHERE solution_id = ? AND status = 'available'").all(solution.id) as Array<{ artifactType: string }>;
    const available = new Set(rows.map((row) => row.artifactType));
    return requiredDeliverableArtifactTypes.every((artifactType) => available.has(artifactType));
  });

  const calls = productSqlite.prepare(`SELECT provider, status, error_code AS errorCode, purpose, estimated_cost_microusd AS cost,
    created_at AS createdAt, completed_at AS completedAt FROM model_calls WHERE created_at >= ?`).all(fromSql) as Array<Record<string, any>>;
  const providerMap = new Map<string, typeof calls>();
  for (const call of calls) providerMap.set(call.provider, [...(providerMap.get(call.provider) || []), call]);
  const providerHealth = [...providerMap.entries()].map(([provider, events]) => ({
    provider,
    calls: events.length,
    failureRate: events.length ? events.filter((event) => event.status === "failed" && event.errorCode !== "MATERIAL_CHANGED_DURING_GENERATION").length / events.length : 0,
    p95Seconds: percentile(events.map((event) => secondsBetween(event.createdAt, event.completedAt)).filter(Boolean), 0.95),
  }));

  const estimatedCostMicrousd = calls.reduce((sum, call) => sum + Number(call.cost || 0), 0);
  const materialChangeDiscards = calls.filter((call) => call.errorCode === "MATERIAL_CHANGED_DURING_GENERATION");
  const formalCalls = calls.filter((call) => String(call.purpose || "").startsWith("formal_section:"));
  const materialChangeDiscardCostMicrousd = materialChangeDiscards.reduce((sum, call) => sum + Number(call.cost || 0), 0);
  const configuredExpectedPerCall = numberEnv("PRODUCT_OPS_EXPECTED_COST_MICROUSD_PER_CALL", 0);
  const expectedCostMicrousd = configuredExpectedPerCall > 0 ? calls.length * configuredExpectedPerCall : estimatedCostMicrousd;
  const oldestQueueAgeSeconds = queued.length ? Math.max(...queued.map((run) => secondsBetween(run.createdAt, windowTo.toISOString().replace("T", " ").slice(0, 19)))) : 0;
  const deletion = productSqlite.prepare(`SELECT
    SUM(CASE WHEN status IN ('pending','running','retry_wait') THEN 1 ELSE 0 END) AS backlog,
    SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed,
    MIN(CASE WHEN status IN ('pending','running','retry_wait') THEN requested_at END) AS oldest
    FROM solution_deletion_runs WHERE requested_at >= ?`).get(fromSql) as { backlog: number | null; failed: number | null; oldest: string | null };
  const deletionOldestAgeSeconds = Math.round(secondsBetween(deletion.oldest, windowTo.toISOString().replace("T", " ").slice(0, 19)));
  const storage = productSqlite.prepare("SELECT status, orphan_files AS orphanFiles, removed_files AS removedFiles, created_at AS createdAt FROM storage_maintenance_runs ORDER BY created_at DESC LIMIT 1").get() as Record<string, any> | undefined;
  const mediaRows = productSqlite.prepare(`SELECT status, route, error_code, attempt_count AS attemptCount, created_at AS createdAt
    FROM media_analysis_tasks WHERE updated_at >= ? OR status IN ('queued','processing','awaiting_configuration')`).all(fromSql) as Array<Record<string, any>>;
  const mediaPending = mediaRows.filter((row) => ["queued", "processing", "awaiting_configuration"].includes(row.status));
  const mediaOldestAgeSeconds = mediaPending.length ? Math.max(...mediaPending.map((row) => secondsBetween(row.createdAt, windowTo.toISOString().replace("T", " ").slice(0, 19)))) : 0;
  const mediaFallbacks = mediaRows.filter((row) => row.route !== "ocr_standard" && Number(row.attemptCount) > 0);
  const mediaConfigurationExhausted = mediaRows.filter((row) => row.status === "failed" && row.error_code === "MEDIA_CONFIGURATION_RETRY_EXHAUSTED").length;
  const nowSql = windowTo.toISOString().replace("T", " ").slice(0, 19);
  const sourceQueue = queueHealth("source", nowSql);
  const mediaQueue = queueHealth("media", nowSql);
  const formalQueue = queueHealth("formal", nowSql);
  const renderQueue = queueHealth("render", nowSql);
  const stageQueues = { source: sourceQueue, media: mediaQueue, formal: formalQueue, render: renderQueue };
  const workerStaleSeconds = Math.min(600, Math.max(15, numberEnv("PRODUCT_WORKER_STALE_SECONDS", 45)));
  const workerCounts = productSqlite.prepare(`SELECT
    SUM(CASE WHEN status = 'running' AND last_seen_at >= datetime('now', ?) THEN 1 ELSE 0 END) AS active,
    SUM(CASE WHEN status = 'running' AND last_seen_at < datetime('now', ?) THEN 1 ELSE 0 END) AS stale
    FROM worker_heartbeats`).get(`-${workerStaleSeconds} seconds`, `-${workerStaleSeconds} seconds`) as { active: number | null; stale: number | null };
  const activeWorkerHealth = productSqlite.prepare("SELECT capabilities_json AS capabilitiesJson, health_json AS healthJson FROM worker_heartbeats WHERE status = 'running' AND last_seen_at >= datetime('now', ?)").all(`-${workerStaleSeconds} seconds`) as Array<{ capabilitiesJson: string; healthJson: string }>;
  const pipelineHealthStaleSeconds = Math.min(900, Math.max(30, numberEnv("PRODUCT_PIPELINE_HEALTH_STALE_SECONDS", 60)));
  const deletionHealthStaleSeconds = Math.min(900, Math.max(30, numberEnv("PRODUCT_DELETION_HEALTH_STALE_SECONDS", 60)));
  const operationsHealthStaleSeconds = Math.min(3600, Math.max(120, numberEnv("PRODUCT_OPERATIONS_HEALTH_STALE_SECONDS", 180)));
  const storageHealthStaleSeconds = Math.min(172800, Math.max(3600, numberEnv("PRODUCT_STORAGE_HEALTH_STALE_SECONDS", 46800)));
  const runnablePipelineBacklog = runnableBacklog();
  const runnableDeletionBacklog = deletionRunnableBacklog();
  const pipelineLoopHealthy = loopHealthy(activeWorkerHealth, "pipeline", "pipeline", runnablePipelineBacklog, pipelineHealthStaleSeconds);
  const deletionLoopHealthy = loopHealthy(activeWorkerHealth, "deletion", "deletion", runnableDeletionBacklog, deletionHealthStaleSeconds);
  const operationsLoopHealthy = capabilityLoopHealthy(activeWorkerHealth, "operations", "operations", operationsHealthStaleSeconds);
  const storageLoopHealthy = capabilityLoopHealthy(activeWorkerHealth, "storage_maintenance", "storage_maintenance", storageHealthStaleSeconds);
  const renderRetryExhausted = (productSqlite.prepare("SELECT COUNT(*) AS count FROM product_solutions WHERE stage = 'rendering' AND status = 'blocked' AND render_error_code = 'RENDER_RETRY_EXHAUSTED'").get() as { count: number }).count;
  const formalRetryExhausted = (productSqlite.prepare("SELECT COUNT(*) AS count FROM formal_documents WHERE status = 'blocked' AND last_error_code = 'SECTION_RETRY_EXHAUSTED'").get() as { count: number }).count;
  const knowledgeBacklog = unifiedKnowledgeBacklog();
  const knowledgeOldestAgeSeconds = Math.round(secondsBetween(knowledgeBacklog.oldest, nowSql));

  const metrics = {
    runs: terminal.length,
    successRate: terminal.length ? succeeded.length / terminal.length : 0,
    completeDeliveryRate: completedSolutions.length ? completeDeliveries.length / completedSolutions.length : 0,
    latencyP50Seconds: percentile(durations, 0.5), latencyP95Seconds: percentile(durations, 0.95),
    queuedTasks: queued.length, oldestQueueAgeSeconds: Math.round(oldestQueueAgeSeconds),
    retryRate: runs.length ? runs.filter((run) => Number(run.attemptCount) > 1).length / runs.length : 0,
    estimatedCost: estimatedCostMicrousd / 1_000_000,
    expectedCost: expectedCostMicrousd / 1_000_000,
    costRatio: expectedCostMicrousd ? estimatedCostMicrousd / expectedCostMicrousd : 0,
    materialChangeDiscardedCalls: materialChangeDiscards.length,
    materialChangeDiscardRate: formalCalls.length ? materialChangeDiscards.length / formalCalls.length : 0,
    materialChangeDiscardedCost: materialChangeDiscardCostMicrousd / 1_000_000,
    mediaQueuedTasks: mediaPending.length,
    mediaOldestQueueAgeSeconds: Math.round(mediaOldestAgeSeconds),
    mediaFailureRate: mediaRows.length ? mediaRows.filter((row) => row.status === "failed").length / mediaRows.length : 0,
    mediaFallbackRate: mediaRows.length ? mediaFallbacks.length / mediaRows.length : 0,
    mediaConfigurationExhausted,
    totalActiveLeases: Object.values(stageQueues).reduce((sum, item) => sum + item.active, 0),
    totalStageBacklog: Object.values(stageQueues).reduce((sum, item) => sum + item.queued, 0),
    sourceRetryExhausted,
    renderRetryExhausted,
    formalRetryExhausted,
    incompleteCompletedDeliveries,
    knowledgeReconciliationBacklog: knowledgeBacklog.count,
    knowledgeOldestBacklogAgeSeconds: knowledgeOldestAgeSeconds,
  };
  const alerts: Alert[] = [];
  const minimumSamples = numberEnv("PRODUCT_OPS_MIN_SAMPLES", 10);
  if (terminal.length >= minimumSamples && metrics.successRate < numberEnv("PRODUCT_OPS_SUCCESS_RATE_MIN", 0.95)) alerts.push({ code: "SUCCESS_RATE_LOW", severity: "critical", automaticAction: "hold_rollout" });
  if (completedSolutions.length >= minimumSamples && metrics.completeDeliveryRate < numberEnv("PRODUCT_OPS_DELIVERY_RATE_MIN", 0.95)) alerts.push({ code: "DELIVERY_RATE_LOW", severity: "critical", automaticAction: "hold_rollout" });
  if (incompleteCompletedDeliveries > 0) alerts.push({ code: "DELIVERABLE_CONTRACT_RECONCILE_PENDING", severity: "warning", automaticAction: "continue_render_reconciliation" });
  if (terminal.length >= minimumSamples && metrics.latencyP95Seconds > numberEnv("PRODUCT_OPS_P95_MAX_SECONDS", 1800)) alerts.push({ code: "LATENCY_P95_HIGH", severity: "warning", automaticAction: "increase_worker_capacity" });
  if (metrics.queuedTasks > numberEnv("PRODUCT_OPS_QUEUE_MAX", 20) || metrics.oldestQueueAgeSeconds > numberEnv("PRODUCT_OPS_QUEUE_AGE_MAX_SECONDS", 900)) alerts.push({ code: "BACKLOG_HIGH", severity: "warning", automaticAction: "increase_worker_capacity" });
  if (sourceRetryExhausted > 0) alerts.push({ code: "SOURCE_RETRY_EXHAUSTED", severity: "critical", automaticAction: "schedule_source_auto_repair" });
  if (renderRetryExhausted > 0) alerts.push({ code: "RENDER_RETRY_EXHAUSTED", severity: "critical", automaticAction: "schedule_render_auto_repair" });
  if (formalRetryExhausted > 0) alerts.push({ code: "SECTION_RETRY_EXHAUSTED", severity: "critical", automaticAction: "schedule_formal_auto_repair" });
  if (knowledgeBacklog.count > numberEnv("PRODUCT_OPS_KNOWLEDGE_BACKLOG_MAX", 20) || knowledgeOldestAgeSeconds > numberEnv("PRODUCT_OPS_KNOWLEDGE_BACKLOG_AGE_MAX_SECONDS", 300)) alerts.push({ code: "KNOWLEDGE_RECONCILIATION_BACKLOG", severity: "warning", automaticAction: "continue_knowledge_reconciliation" });
  if (providerHealth.some((provider) => provider.calls >= 5 && provider.failureRate > 0.2)) alerts.push({ code: "PROVIDER_FAILURE_HIGH", severity: "critical", automaticAction: "route_verified_backup_or_pause" });
  if (expectedCostMicrousd > 0 && metrics.costRatio > numberEnv("PRODUCT_OPS_COST_RATIO_MAX", 1.25)) alerts.push({ code: "COST_ANOMALY", severity: "critical", automaticAction: "throttle_free_and_defer_new_formal" });
  if (materialChangeDiscards.length >= numberEnv("PRODUCT_OPS_MATERIAL_CHANGE_DISCARD_MIN", 3) && metrics.materialChangeDiscardRate > numberEnv("PRODUCT_OPS_MATERIAL_CHANGE_DISCARD_RATE_MAX", 0.1)) alerts.push({ code: "MATERIAL_CHANGE_DISCARD_HIGH", severity: "warning", automaticAction: "apply_material_settle_backoff" });
  if ((deletion.failed || 0) > 0) alerts.push({ code: "DELETION_RETRY_EXHAUSTED", severity: "critical", automaticAction: "schedule_deletion_auto_repair" });
  else if ((deletion.backlog || 0) > numberEnv("PRODUCT_OPS_DELETION_QUEUE_MAX", 20) || deletionOldestAgeSeconds > numberEnv("PRODUCT_OPS_DELETION_QUEUE_AGE_MAX_SECONDS", 900)) alerts.push({ code: "DELETION_BACKLOG", severity: "warning", automaticAction: "increase_deletion_worker_capacity" });
  if (storage?.status === "failed") alerts.push({ code: "STORAGE_MAINTENANCE_FAILED", severity: "warning", automaticAction: "retry_storage_audit" });
  if (metrics.mediaQueuedTasks > numberEnv("PRODUCT_OPS_MEDIA_QUEUE_MAX", 20) || metrics.mediaOldestQueueAgeSeconds > numberEnv("PRODUCT_OPS_MEDIA_QUEUE_AGE_MAX_SECONDS", 900)) alerts.push({ code: "MEDIA_BACKLOG_HIGH", severity: "warning", automaticAction: "increase_media_worker_capacity" });
  if (mediaRows.some((row) => row.status === "awaiting_configuration")) alerts.push({ code: "MEDIA_PROVIDER_NOT_CONFIGURED", severity: "critical", automaticAction: "configure_media_provider" });
  if (mediaConfigurationExhausted > 0) alerts.push({ code: "MEDIA_CONFIGURATION_RETRY_EXHAUSTED", severity: "critical", automaticAction: "schedule_media_auto_repair" });
  if (mediaRows.length >= 5 && metrics.mediaFailureRate > numberEnv("PRODUCT_OPS_MEDIA_FAILURE_RATE_MAX", 0.2)) alerts.push({ code: "MEDIA_FAILURE_HIGH", severity: "critical", automaticAction: "route_verified_backup_or_pause" });
  for (const [stage, queue] of Object.entries(stageQueues)) {
    const ageLimit = numberEnv(`PRODUCT_OPS_${stage.toUpperCase()}_QUEUE_AGE_MAX_SECONDS`, stage === "render" ? 300 : 30);
    if (queue.queued > 0 && queue.saturation >= 1) alerts.push({ code: `${stage.toUpperCase()}_CAPACITY_SATURATED`, severity: queue.oldestQueueAgeSeconds > ageLimit * 3 ? "critical" : "warning", automaticAction: `increase_${stage}_worker_capacity` });
    else if (queue.queued > 0 && queue.oldestQueueAgeSeconds > ageLimit) alerts.push({ code: `${stage.toUpperCase()}_BACKLOG_HIGH`, severity: queue.oldestQueueAgeSeconds > ageLimit * 3 ? "critical" : "warning", automaticAction: `increase_${stage}_worker_capacity` });
  }
  if ((metrics.totalStageBacklog > 0 || runnableDeletionBacklog > 0) && (workerCounts.active || 0) === 0) alerts.push({ code: "WORKER_UNAVAILABLE", severity: "critical", automaticAction: "restart_worker_pool" });
  else if (!pipelineLoopHealthy) alerts.push({ code: "PIPELINE_LOOP_STALLED", severity: "critical", automaticAction: "restart_worker_pool" });
  else if (!deletionLoopHealthy) alerts.push({ code: "DELETION_LOOP_STALLED", severity: "critical", automaticAction: "restart_worker_pool" });
  else if (!operationsLoopHealthy) alerts.push({ code: "OPERATIONS_LOOP_STALLED", severity: "critical", automaticAction: "restart_worker_pool" });
  else if (!storageLoopHealthy) alerts.push({ code: "STORAGE_LOOP_STALLED", severity: "critical", automaticAction: "restart_worker_pool" });
  else if ((workerCounts.stale || 0) > 0) alerts.push({ code: "WORKER_HEARTBEAT_STALE", severity: "warning", automaticAction: "replace_stale_worker" });

  const snapshot = {
    snapshotId,
    schemaVersion: "1.3", window: { from: Math.floor(windowFrom.getTime() / 1000), to: Math.floor(windowTo.getTime() / 1000) },
    metrics, stageQueues, providerHealth, knowledgeHealth: { backlog: knowledgeBacklog.count, oldestBacklogAgeSeconds: knowledgeOldestAgeSeconds }, mediaHealth: { total: mediaRows.length, pending: mediaPending.length, awaitingConfiguration: mediaRows.filter((row) => row.status === "awaiting_configuration").length, failed: mediaRows.filter((row) => row.status === "failed").length, fallbackCount: mediaFallbacks.length }, deletionHealth: { backlog: deletion.backlog || 0, failed: deletion.failed || 0, oldestQueueAgeSeconds: deletionOldestAgeSeconds },
    storageHealth: storage ? { status: storage.status, orphanFiles: storage.orphanFiles, removedFiles: storage.removedFiles } : null,
    workerHealth: { active: workerCounts.active || 0, stale: workerCounts.stale || 0, staleAfterSeconds: workerStaleSeconds, pipelineLoopHealthy, pipelineHealthStaleSeconds, runnablePipelineBacklog, deletionLoopHealthy, deletionHealthStaleSeconds, runnableDeletionBacklog, operationsLoopHealthy, operationsHealthStaleSeconds, storageLoopHealthy, storageHealthStaleSeconds },
    alerts, routingSafety: { formalSilentDowngrades: 0, unverifiedProviderRoutes: 0 },
  };
  productSqlite.prepare("INSERT INTO operations_snapshots (id, window_from, window_to, status, snapshot_json) VALUES (?, ?, ?, ?, ?)").run(snapshotId, fromSql, windowTo.toISOString().replace("T", " ").slice(0, 19), alerts.some((alert) => alert.severity === "critical") ? "critical" : alerts.length ? "warning" : "healthy", JSON.stringify(snapshot));
  return snapshot;
}

function countIncompleteCompletedDeliveries() {
  const placeholders = requiredDeliverableArtifactTypes.map(() => "?").join(", ");
  const row = productSqlite.prepare(`SELECT COUNT(*) AS count FROM product_solutions s
    WHERE s.status = 'completed' AND s.stage = 'completed'
      AND (SELECT COUNT(DISTINCT a.artifact_type) FROM deliverable_artifacts a
        WHERE a.solution_id = s.id AND a.user_id = s.owner_user_id AND a.status = 'available'
          AND a.artifact_type IN (${placeholders})) < ?`).get(...requiredDeliverableArtifactTypes, requiredDeliverableArtifactTypes.length) as { count: number };
  return row.count;
}

function runnableBacklog() {
  const queries = [
    "SELECT COUNT(*) AS count FROM processing_runs WHERE run_type = 'source_ingestion' AND status IN ('queued','retry_wait') AND (next_attempt_at IS NULL OR next_attempt_at <= CURRENT_TIMESTAMP)",
    "SELECT COUNT(*) AS count FROM media_analysis_tasks WHERE status IN ('queued','awaiting_configuration') AND (next_attempt_at IS NULL OR next_attempt_at <= CURRENT_TIMESTAMP)",
    "SELECT COUNT(*) AS count FROM formal_documents WHERE status = 'pending'",
    "SELECT COUNT(*) AS count FROM product_solutions WHERE stage = 'rendering' AND status IN ('processing','recovering') AND (render_next_attempt_at IS NULL OR render_next_attempt_at <= CURRENT_TIMESTAMP)",
  ];
  return queries.reduce((sum, query) => sum + (productSqlite.prepare(query).get() as { count: number }).count, 0) + unifiedKnowledgeBacklog().count;
}

function deletionRunnableBacklog() {
  return (productSqlite.prepare(`SELECT COUNT(*) AS count FROM solution_deletion_runs WHERE
    (status IN ('pending','retry_wait') AND (next_attempt_at IS NULL OR next_attempt_at <= CURRENT_TIMESTAMP))
    OR (status = 'running' AND lease_until <= CURRENT_TIMESTAMP)`).get() as { count: number }).count;
}

function loopHealthy(workers: Array<{ capabilitiesJson: string; healthJson: string }>, capability: string, loop: string, backlog: number, staleSeconds: number) {
  if (backlog === 0) return true;
  return workers.some((worker) => hasCapability(worker.capabilitiesJson, capability) && recentLoopSuccess(worker.healthJson, loop, staleSeconds));
}

function capabilityLoopHealthy(workers: Array<{ capabilitiesJson: string; healthJson: string }>, capability: string, loop: string, staleSeconds: number) {
  return workers.some((worker) => hasCapability(worker.capabilitiesJson, capability) && recentLoopSuccess(worker.healthJson, loop, staleSeconds));
}

function hasCapability(capabilitiesJson: string, capability: string) {
  try { return JSON.parse(capabilitiesJson)?.includes(capability); }
  catch { return false; }
}

function recentLoopSuccess(healthJson: string, loop: string, staleSeconds: number) {
  try {
    const value = JSON.parse(healthJson)?.[loop]?.lastSuccessAt;
    return typeof value === "string" && Date.now() - Date.parse(value) <= staleSeconds * 1000;
  } catch { return false; }
}

function queueHealth(stage: "source" | "media" | "formal" | "render", nowSql: string) {
  const definitions = {
    source: { table: "processing_runs", queued: "run_type = 'source_ingestion' AND status IN ('queued','retry_wait')", active: "run_type = 'source_ingestion' AND status = 'running' AND lease_until > CURRENT_TIMESTAMP", owner: "user_id", created: "created_at", capacity: Math.max(1, numberEnv("PRODUCT_SOURCE_BATCH_CONCURRENCY", 2)) },
    media: { table: "media_analysis_tasks", queued: "status IN ('queued','awaiting_configuration')", active: "status = 'processing' AND lease_until > CURRENT_TIMESTAMP", owner: "solution_id", created: "created_at", capacity: Math.max(1, numberEnv("PRODUCT_MEDIA_BATCH_CONCURRENCY", 4)) },
    formal: { table: "formal_documents", queued: "status = 'pending'", active: "status = 'generating'", owner: "solution_id", created: "updated_at", capacity: Math.max(1, numberEnv("PRODUCT_FORMAL_BATCH_CONCURRENCY", 4)) },
    render: { table: "product_solutions", queued: "stage = 'rendering' AND status IN ('processing','recovering')", active: "stage = 'rendering' AND status = 'rendering' AND render_lease_until > CURRENT_TIMESTAMP", owner: "owner_user_id", created: "updated_at", capacity: Math.max(1, numberEnv("PRODUCT_RENDER_BATCH_CONCURRENCY", 2)) },
  } as const;
  const item = definitions[stage];
  const counts = productSqlite.prepare(`SELECT SUM(CASE WHEN ${item.queued} THEN 1 ELSE 0 END) AS queued, SUM(CASE WHEN ${item.active} THEN 1 ELSE 0 END) AS active, MIN(CASE WHEN ${item.queued} THEN ${item.created} END) AS oldest FROM ${item.table}`).get() as { queued: number | null; active: number | null; oldest: string | null };
  const maxOwner = productSqlite.prepare(`SELECT COALESCE(MAX(active_count), 0) AS count FROM (SELECT ${item.owner}, COUNT(*) AS active_count FROM ${item.table} WHERE ${item.active} GROUP BY ${item.owner})`).get() as { count: number };
  const active = counts.active || 0, queuedCount = counts.queued || 0;
  return { queued: queuedCount, active, capacity: item.capacity, saturation: active / item.capacity, oldestQueueAgeSeconds: Math.round(secondsBetween(counts.oldest, nowSql)), maxActivePerOwner: maxOwner.count };
}
