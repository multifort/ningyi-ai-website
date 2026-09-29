import { productSqlite } from "./db";
import type { FormalWork, FormalWorkRepository, RenderClaim } from "./formal-work-repository";

export class SqliteFormalWorkRepository implements FormalWorkRepository {
  async recoverStaleRendering() {
    return productSqlite.prepare("UPDATE product_solutions SET status = 'recovering', render_lease_owner = NULL, render_lease_until = NULL, render_next_attempt_at = CURRENT_TIMESTAMP, render_error_code = 'STALE_RENDER_RECOVERED', updated_at = CURRENT_TIMESTAMP WHERE stage = 'rendering' AND status = 'rendering' AND render_lease_until < CURRENT_TIMESTAMP").run().changes;
  }

  async repairExhaustedRendering(olderThanSeconds: number) {
    return productSqlite.prepare(`UPDATE product_solutions SET status = 'recovering', render_attempt_count = 0, render_next_attempt_at = CURRENT_TIMESTAMP,
      render_error_code = 'RENDER_AUTO_REPAIR', render_failed_at = NULL, updated_at = CURRENT_TIMESTAMP
      WHERE stage = 'rendering' AND status = 'blocked' AND render_error_code = 'RENDER_RETRY_EXHAUSTED' AND render_failed_at <= datetime('now', ?)`).run(`-${olderThanSeconds} seconds`).changes;
  }

  async requeueIncompleteDeliveries(requiredArtifactTypes: readonly string[], limit: number) {
    const placeholders = requiredArtifactTypes.map(() => "?").join(", ");
    const rows = productSqlite.prepare(`SELECT s.id
      FROM product_solutions s JOIN formal_documents d ON d.solution_id = s.id
      WHERE s.status = 'completed' AND s.stage = 'completed' AND d.status = 'completed'
        AND (SELECT COUNT(DISTINCT a.artifact_type) FROM deliverable_artifacts a
          WHERE a.solution_id = s.id AND a.user_id = s.owner_user_id AND a.status = 'available'
            AND a.artifact_type IN (${placeholders})) < ?
      ORDER BY s.updated_at, s.id LIMIT ?`).all(...requiredArtifactTypes, requiredArtifactTypes.length, limit) as Array<{ id: string }>;
    if (!rows.length) return 0;
    const update = productSqlite.prepare(`UPDATE product_solutions SET status = 'recovering', stage = 'rendering', render_attempt_count = 0,
      render_lease_owner = NULL, render_lease_until = NULL, render_next_attempt_at = CURRENT_TIMESTAMP,
      render_error_code = 'DELIVERABLE_CONTRACT_RECONCILE', render_failed_at = NULL, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND status = 'completed' AND stage = 'completed'`);
    return productSqlite.transaction((solutionRows: Array<{ id: string }>) => solutionRows.reduce((count, row) => count + update.run(row.id).changes, 0))(rows);
  }

  async findPendingFormal(userConcurrency: number) {
    return productSqlite.prepare(`SELECT d.solution_id AS solutionId, s.owner_user_id AS userId
      FROM formal_documents d JOIN product_solutions s ON s.id = d.solution_id
      WHERE d.status = 'pending' AND s.status NOT IN ('deletion_pending', 'deleted')
        AND EXISTS (SELECT 1 FROM formal_sections ready WHERE ready.solution_id = d.solution_id AND ready.status = 'pending' AND (ready.next_attempt_at IS NULL OR ready.next_attempt_at <= CURRENT_TIMESTAMP))
        AND (SELECT COUNT(*) FROM formal_sections active JOIN product_solutions active_solution ON active_solution.id = active.solution_id
          WHERE active_solution.owner_user_id = s.owner_user_id AND active.status = 'generating' AND active.lease_until > CURRENT_TIMESTAMP) < ?
      ORDER BY d.updated_at, d.solution_id LIMIT 1`).get(userConcurrency) as FormalWork | undefined;
  }

  async claimRendering(workerId: string, userConcurrency: number, leaseSeconds: number): Promise<RenderClaim> {
    return productSqlite.transaction((): RenderClaim => {
      const work = productSqlite.prepare(`SELECT s.id AS solutionId, s.owner_user_id AS userId
        FROM product_solutions s JOIN formal_documents d ON d.solution_id = s.id
        WHERE s.stage = 'rendering' AND s.status IN ('processing', 'recovering') AND (s.render_next_attempt_at IS NULL OR s.render_next_attempt_at <= CURRENT_TIMESTAMP) AND d.status = 'completed'
          AND (SELECT COUNT(*) FROM product_solutions active WHERE active.owner_user_id = s.owner_user_id AND active.stage = 'rendering' AND active.status = 'rendering' AND active.render_lease_until > CURRENT_TIMESTAMP) < ?
        ORDER BY s.updated_at, s.id LIMIT 1`).get(userConcurrency) as FormalWork | undefined;
      if (!work) return { status: "idle" };
      const claimed = productSqlite.prepare("UPDATE product_solutions SET status = 'rendering', render_attempt_count = render_attempt_count + 1, render_lease_owner = ?, render_lease_until = datetime('now', ?), render_next_attempt_at = NULL, render_error_code = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND stage = 'rendering' AND status IN ('processing', 'recovering') AND (render_next_attempt_at IS NULL OR render_next_attempt_at <= CURRENT_TIMESTAMP)").run(workerId, `+${leaseSeconds} seconds`, work.solutionId);
      return claimed.changes === 1 ? { status: "claimed", work } : { status: "contended", solutionId: work.solutionId };
    })();
  }

  async renderAttemptCount(solutionId: string, workerId: string) {
    const state = productSqlite.prepare("SELECT render_attempt_count AS attemptCount FROM product_solutions WHERE id = ? AND render_lease_owner = ?").get(solutionId, workerId) as { attemptCount: number } | undefined;
    return state?.attemptCount;
  }

  async recordRenderFailure(input: { solutionId: string; workerId: string; exhausted: boolean; retrySeconds: number; errorCode: string }) {
    const status = input.exhausted ? "blocked" : "recovering";
    return productSqlite.prepare(`UPDATE product_solutions SET status = ?, stage = 'rendering', render_lease_owner = NULL, render_lease_until = NULL, render_error_code = ?,
      render_next_attempt_at = CASE WHEN ? = 'blocked' THEN NULL ELSE datetime('now', ?) END,
      render_failed_at = CASE WHEN ? = 'blocked' THEN CURRENT_TIMESTAMP ELSE NULL END, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND render_lease_owner = ?`).run(status, input.errorCode, status, `+${input.retrySeconds} seconds`, status, input.solutionId, input.workerId).changes === 1;
  }
}
