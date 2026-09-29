import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { productSqlite } from "../../../../../lib/product/db";
import { privateStorageReadiness } from "../../../../../lib/product/private-storage";
import { unifiedKnowledgeBacklog } from "../../../../../lib/product/unified-knowledge";
import { sanitizeWorkerLoopHealth, workerCapabilityLoopHealthy, workerLoopHealthy } from "../../../../../lib/product/worker-health";

export const runtime = "nodejs";

function authorized(request: NextRequest) {
  const configured = process.env.PRODUCT_WORKER_SECRET || "";
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
  const expectedBytes = Buffer.from(configured), suppliedBytes = Buffer.from(supplied);
  return Boolean(configured) && expectedBytes.length === suppliedBytes.length && timingSafeEqual(expectedBytes, suppliedBytes);
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ success: false, error: { code: "WORKER_UNAUTHORIZED", message: "调度凭证无效。", retryable: false } }, { status: 401 });
  const body = await request.json().catch(() => null) as { workerId?: string; status?: string; startedAt?: string; capabilities?: string[]; loopHealth?: unknown } | null;
  if (!body?.workerId || !/^[0-9a-f-]{36}$/i.test(body.workerId)) return NextResponse.json({ success: false, error: { code: "WORKER_ID_INVALID", message: "Worker 标识无效。", retryable: false } }, { status: 400 });
  const status = body.status === "stopped" ? "stopped" : "running";
  const capabilities = Array.isArray(body.capabilities) ? body.capabilities.filter((item) => typeof item === "string").slice(0, 16) : [];
  const startedAt = typeof body.startedAt === "string" && !Number.isNaN(Date.parse(body.startedAt)) ? body.startedAt : new Date().toISOString();
  const loopHealth = sanitizeWorkerLoopHealth(body.loopHealth);
  productSqlite.prepare(`INSERT INTO worker_heartbeats (worker_id, status, capabilities_json, health_json, started_at, stopped_at)
    VALUES (?, ?, ?, ?, ?, CASE WHEN ? = 'stopped' THEN CURRENT_TIMESTAMP ELSE NULL END)
    ON CONFLICT(worker_id) DO UPDATE SET status = excluded.status, capabilities_json = excluded.capabilities_json, health_json = excluded.health_json,
    last_seen_at = CURRENT_TIMESTAMP, stopped_at = CASE WHEN excluded.status = 'stopped' THEN CURRENT_TIMESTAMP ELSE NULL END, updated_at = CURRENT_TIMESTAMP`).run(body.workerId, status, JSON.stringify(capabilities), JSON.stringify(loopHealth), startedAt, status);
  return NextResponse.json({ success: true, data: { workerId: body.workerId, status } });
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ success: false, error: { code: "WORKER_UNAUTHORIZED", message: "调度凭证无效。", retryable: false } }, { status: 401 });
  const dependencies = await checkDependencies();
  if (request.nextUrl.searchParams.get("scope") === "dependencies") {
    return NextResponse.json({ success: true, data: { status: dependencies.ready ? "ready" : "not_ready", dependencies } }, { status: dependencies.ready ? 200 : 503 });
  }
  const staleSeconds = Math.min(600, Math.max(15, Number(process.env.PRODUCT_WORKER_STALE_SECONDS || 45)));
  const activeWorkers = productSqlite.prepare(`SELECT worker_id AS workerId, capabilities_json AS capabilitiesJson, health_json AS healthJson FROM worker_heartbeats WHERE status = 'running' AND last_seen_at >= datetime('now', ?)`).all(`-${staleSeconds} seconds`) as Array<{ workerId: string; capabilitiesJson: string; healthJson: string }>;
  const lastSeen = productSqlite.prepare("SELECT last_seen_at AS lastSeenAt FROM worker_heartbeats ORDER BY last_seen_at DESC LIMIT 1").get() as { lastSeenAt: string } | undefined;
  const pipelineStaleSeconds = Math.min(900, Math.max(30, Number(process.env.PRODUCT_PIPELINE_HEALTH_STALE_SECONDS || 60)));
  const deletionStaleSeconds = Math.min(900, Math.max(30, Number(process.env.PRODUCT_DELETION_HEALTH_STALE_SECONDS || 60)));
  const operationsStaleSeconds = Math.min(3600, Math.max(120, Number(process.env.PRODUCT_OPERATIONS_HEALTH_STALE_SECONDS || 180)));
  const storageStaleSeconds = Math.min(172800, Math.max(3600, Number(process.env.PRODUCT_STORAGE_HEALTH_STALE_SECONDS || 46800)));
  const pipelineBacklog = activePipelineBacklog();
  const deletionBacklog = activeDeletionBacklog();
  const pipelineHealthy = workerLoopHealthy(activeWorkers, "pipeline", "pipeline", pipelineBacklog, pipelineStaleSeconds);
  const deletionHealthy = workerLoopHealthy(activeWorkers, "deletion", "deletion", deletionBacklog, deletionStaleSeconds);
  const operationsHealthy = workerCapabilityLoopHealthy(activeWorkers, "operations", "operations", operationsStaleSeconds);
  const storageHealthy = workerCapabilityLoopHealthy(activeWorkers, "storage_maintenance", "storage_maintenance", storageStaleSeconds);
  const healthy = dependencies.ready && activeWorkers.length > 0 && pipelineHealthy && deletionHealthy && operationsHealthy && storageHealthy;
  return NextResponse.json({ success: true, data: { status: healthy ? "healthy" : "unavailable", activeWorkers: activeWorkers.length, staleAfterSeconds: staleSeconds, lastSeenAt: lastSeen?.lastSeenAt || null, pipeline: { healthy: pipelineHealthy, backlog: pipelineBacklog, staleAfterSeconds: pipelineStaleSeconds }, deletion: { healthy: deletionHealthy, backlog: deletionBacklog, staleAfterSeconds: deletionStaleSeconds }, operations: { healthy: operationsHealthy, staleAfterSeconds: operationsStaleSeconds }, storageMaintenance: { healthy: storageHealthy, staleAfterSeconds: storageStaleSeconds }, dependencies } }, { status: healthy ? 200 : 503 });
}

function activePipelineBacklog() {
  const source = (productSqlite.prepare("SELECT COUNT(*) AS count FROM processing_runs WHERE run_type = 'source_ingestion' AND status IN ('queued','retry_wait') AND (next_attempt_at IS NULL OR next_attempt_at <= CURRENT_TIMESTAMP)").get() as { count: number }).count;
  const media = (productSqlite.prepare("SELECT COUNT(*) AS count FROM media_analysis_tasks WHERE status IN ('queued','awaiting_configuration') AND (next_attempt_at IS NULL OR next_attempt_at <= CURRENT_TIMESTAMP)").get() as { count: number }).count;
  const formal = (productSqlite.prepare("SELECT COUNT(*) AS count FROM formal_documents WHERE status = 'pending'").get() as { count: number }).count;
  const render = (productSqlite.prepare("SELECT COUNT(*) AS count FROM product_solutions WHERE stage = 'rendering' AND status IN ('processing','recovering') AND (render_next_attempt_at IS NULL OR render_next_attempt_at <= CURRENT_TIMESTAMP)").get() as { count: number }).count;
  return source + media + formal + render + unifiedKnowledgeBacklog().count;
}

function activeDeletionBacklog() {
  return (productSqlite.prepare(`SELECT COUNT(*) AS count FROM solution_deletion_runs WHERE
    (status IN ('pending','retry_wait') AND (next_attempt_at IS NULL OR next_attempt_at <= CURRENT_TIMESTAMP))
    OR (status = 'running' AND lease_until <= CURRENT_TIMESTAMP)`).get() as { count: number }).count;
}

async function checkDependencies() {
  let database = false, storage = false;
  try {
    const row = productSqlite.prepare("SELECT 1 AS ok").get() as { ok: number };
    database = row.ok === 1;
  } catch {}
  storage = await privateStorageReadiness().catch(() => false);
  const sessionSecret = Boolean(process.env.PRODUCT_SESSION_SECRET);
  return { ready: database && storage && sessionSecret, database, storage, sessionSecret };
}
