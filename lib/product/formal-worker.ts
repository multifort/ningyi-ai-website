import { randomUUID } from "crypto";
import { productSqlite } from "./db";
import { ensurePrimaryDeliverables, ensureTraceableBenchmarkFacts } from "./deliverables";
import { requiredDeliverableArtifactTypes } from "./deliverable-catalog";
import { continueFormalDocument, reactivateConfiguredFormalDocuments, recoverStaleFormalWork, repairExhaustedFormalWork } from "./formal-analysis";
import { modelExecutionWindow } from "./model-execution-window";

export async function processFormalBatch(requestedLimit = 1) {
  const recovered = recoverStaleFormalWork();
  const repairedFormal = repairExhaustedFormalWork();
  const reactivatedConfiguration = reactivateConfiguredFormalDocuments();
  const recoveredRendering = productSqlite.prepare("UPDATE product_solutions SET status = 'recovering', render_lease_owner = NULL, render_lease_until = NULL, render_next_attempt_at = CURRENT_TIMESTAMP, render_error_code = 'STALE_RENDER_RECOVERED', updated_at = CURRENT_TIMESTAMP WHERE stage = 'rendering' AND status = 'rendering' AND render_lease_until < CURRENT_TIMESTAMP").run().changes;
  const repairedRendering = repairExhaustedRendering();
  const requeuedIncompleteDeliveries = requeueIncompleteCompletedDeliveries();
  const workerId = `formal-${randomUUID()}`;
  const configuredLimit = Math.max(1, Number(process.env.PRODUCT_FORMAL_BATCH_CONCURRENCY || ((process.env.OPENAI_BASE_URL || "").includes("deepseek.com") ? 1 : 4)));
  const limit = Math.min(10, configuredLimit, Math.max(1, Math.floor(requestedLimit)));
  const results = await Promise.all(Array.from({ length: limit }, () => processOneFormalWork(workerId)));
  return { workerId, requested: limit, processed: results.filter((item) => item.status !== "idle" && item.status !== "contended").length, recovered, repairedFormal, reactivatedConfiguration, recoveredRendering, repairedRendering, requeuedIncompleteDeliveries, results };
}

function requeueIncompleteCompletedDeliveries() {
  const limit = Math.min(20, Math.max(1, Math.floor(Number(process.env.PRODUCT_DELIVERABLE_RECONCILE_BATCH || 4))));
  const placeholders = requiredDeliverableArtifactTypes.map(() => "?").join(", ");
  const rows = productSqlite.prepare(`SELECT s.id
    FROM product_solutions s JOIN formal_documents d ON d.solution_id = s.id
    WHERE s.status = 'completed' AND s.stage = 'completed' AND d.status = 'completed'
      AND (SELECT COUNT(DISTINCT a.artifact_type) FROM deliverable_artifacts a
        WHERE a.solution_id = s.id AND a.user_id = s.owner_user_id AND a.status = 'available'
          AND a.artifact_type IN (${placeholders})) < ?
    ORDER BY s.updated_at, s.id LIMIT ?`).all(...requiredDeliverableArtifactTypes, requiredDeliverableArtifactTypes.length, limit) as Array<{ id: string }>;
  if (!rows.length) return 0;
  const update = productSqlite.prepare(`UPDATE product_solutions SET status = 'recovering', stage = 'rendering', render_attempt_count = 0,
    render_lease_owner = NULL, render_lease_until = NULL, render_next_attempt_at = CURRENT_TIMESTAMP,
    render_error_code = 'DELIVERABLE_CONTRACT_RECONCILE', render_failed_at = NULL, updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND status = 'completed' AND stage = 'completed'`);
  return productSqlite.transaction((solutionRows: Array<{ id: string }>) => solutionRows.reduce((count, row) => count + update.run(row.id).changes, 0))(rows);
}

async function processOneFormalWork(workerId: string) {
  const configuredUserConcurrency = Number(process.env.PRODUCT_FORMAL_USER_CONCURRENCY);
  const userConcurrency = Number.isFinite(configuredUserConcurrency) && configuredUserConcurrency > 0
    ? Math.floor(configuredUserConcurrency)
    : ((process.env.OPENAI_BASE_URL || "").includes("deepseek.com") ? 1 : 2);
  const next = productSqlite.prepare(`SELECT d.solution_id AS solutionId, s.owner_user_id AS userId
    FROM formal_documents d JOIN product_solutions s ON s.id = d.solution_id
    WHERE d.status = 'pending' AND s.status NOT IN ('deletion_pending', 'deleted')
      AND EXISTS (SELECT 1 FROM formal_sections ready WHERE ready.solution_id = d.solution_id AND ready.status = 'pending' AND (ready.next_attempt_at IS NULL OR ready.next_attempt_at <= CURRENT_TIMESTAMP))
      AND (SELECT COUNT(*) FROM formal_sections active JOIN product_solutions active_solution ON active_solution.id = active.solution_id
        WHERE active_solution.owner_user_id = s.owner_user_id AND active.status = 'generating' AND active.lease_until > CURRENT_TIMESTAMP) < ?
    ORDER BY d.updated_at, d.solution_id LIMIT 1`).get(userConcurrency) as { solutionId: string; userId: string } | undefined;
  if (next) {
    const executionWindow = modelExecutionWindow();
    if (!executionWindow.allowed) return { status: "deferred_to_model_window", solutionId: next.solutionId, executionWindow };
  }
  if (!next) {
    const rendering = productSqlite.prepare(`SELECT s.id AS solutionId, s.owner_user_id AS userId
      FROM product_solutions s JOIN formal_documents d ON d.solution_id = s.id
      WHERE s.stage = 'rendering' AND s.status IN ('processing', 'recovering') AND (s.render_next_attempt_at IS NULL OR s.render_next_attempt_at <= CURRENT_TIMESTAMP) AND d.status = 'completed'
        AND (SELECT COUNT(*) FROM product_solutions active WHERE active.owner_user_id = s.owner_user_id AND active.stage = 'rendering' AND active.status = 'rendering' AND active.render_lease_until > CURRENT_TIMESTAMP) < ?
      ORDER BY s.updated_at, s.id LIMIT 1`).get(Math.max(1, Math.floor(Number(process.env.PRODUCT_RENDER_USER_CONCURRENCY || 1)))) as { solutionId: string; userId: string } | undefined;
    if (!rendering) return { status: "idle" };
    const leaseSeconds = Math.max(180, Number(process.env.PRODUCT_RENDER_LEASE_SECONDS || 1800));
    const claimed = productSqlite.prepare("UPDATE product_solutions SET status = 'rendering', render_attempt_count = render_attempt_count + 1, render_lease_owner = ?, render_lease_until = datetime('now', ?), render_next_attempt_at = NULL, render_error_code = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND stage = 'rendering' AND status IN ('processing', 'recovering') AND (render_next_attempt_at IS NULL OR render_next_attempt_at <= CURRENT_TIMESTAMP)").run(workerId, `+${leaseSeconds} seconds`, rendering.solutionId);
    if (!claimed.changes) return { status: "contended", solutionId: rendering.solutionId };
    try {
      ensureTraceableBenchmarkFacts(rendering.solutionId);
      const deliverables = await ensurePrimaryDeliverables(rendering.solutionId, rendering.userId, { workerId });
      return { status: "rendered", solutionId: rendering.solutionId, deliverableCount: deliverables.length };
    } catch (error) {
      const state = productSqlite.prepare("SELECT render_attempt_count AS attemptCount FROM product_solutions WHERE id = ? AND render_lease_owner = ?").get(rendering.solutionId, workerId) as { attemptCount: number } | undefined;
      if (!state) return { status: "render_lease_lost", solutionId: rendering.solutionId, errorCode: "RENDER_LEASE_LOST" };
      const maxAttempts = Math.min(10, Math.max(2, Number(process.env.PRODUCT_RENDER_MAX_ATTEMPTS || 5)));
      const exhausted = state.attemptCount >= maxAttempts;
      const delays = [5, 30, 120, 600];
      const retrySeconds = delays[Math.min(Math.max(0, state.attemptCount - 1), delays.length - 1)];
      const code = exhausted ? "RENDER_RETRY_EXHAUSTED" : renderErrorCode(error);
      productSqlite.prepare(`UPDATE product_solutions SET status = ?, stage = 'rendering', render_lease_owner = NULL, render_lease_until = NULL, render_error_code = ?,
        render_next_attempt_at = CASE WHEN ? = 'blocked' THEN NULL ELSE datetime('now', ?) END,
        render_failed_at = CASE WHEN ? = 'blocked' THEN CURRENT_TIMESTAMP ELSE NULL END, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND render_lease_owner = ?`).run(exhausted ? "blocked" : "recovering", code, exhausted ? "blocked" : "recovering", `+${retrySeconds} seconds`, exhausted ? "blocked" : "recovering", rendering.solutionId, workerId);
      return { status: exhausted ? "render_failed" : "render_retry_scheduled", solutionId: rendering.solutionId, errorCode: code };
    }
  }
  const state = await continueFormalDocument(next.solutionId, next.userId, { workerId });
  return { status: "processed", solutionId: next.solutionId, document: state };
}

function repairExhaustedRendering() {
  const seconds = Math.min(604800, Math.max(3600, Number(process.env.PRODUCT_RENDER_AUTO_REPAIR_SECONDS || 21600)));
  return productSqlite.prepare(`UPDATE product_solutions SET status = 'recovering', render_attempt_count = 0, render_next_attempt_at = CURRENT_TIMESTAMP,
    render_error_code = 'RENDER_AUTO_REPAIR', render_failed_at = NULL, updated_at = CURRENT_TIMESTAMP
    WHERE stage = 'rendering' AND status = 'blocked' AND render_error_code = 'RENDER_RETRY_EXHAUSTED' AND render_failed_at <= datetime('now', ?)`).run(`-${seconds} seconds`).changes;
}

function renderErrorCode(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.split(":", 1)[0].replace(/[^A-Z0-9_]/gi, "_").slice(0, 80) || "DELIVERABLE_RENDER_FAILED";
}
