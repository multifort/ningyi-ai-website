import { productSqlite } from "./db";
import type { DeletionRepository, DeletionRun } from "./deletion-repository";

const solutionDataTables = [
  "change_impact_plans", "project_model_locks", "project_model_snapshots", "deliverable_artifact_versions",
  "deliverable_artifacts", "formal_section_attempts", "formal_sections", "formal_documents",
  "project_consistency_reports", "model_calls", "free_analyses", "solution_understandings",
  "template_profiles", "media_analysis_tasks", "source_blocks", "project_user_facts", "processing_runs",
  "source_files", "intake_drafts",
] as const;

export class SqliteDeletionRepository implements DeletionRepository {
  async repairFailed(olderThanSeconds: number) {
    return productSqlite.prepare(`UPDATE solution_deletion_runs SET status = 'retry_wait', attempt_count = 0, error_code = 'DELETION_AUTO_REPAIR', next_attempt_at = CURRENT_TIMESTAMP, completed_at = NULL, updated_at = CURRENT_TIMESTAMP
      WHERE status = 'failed' AND completed_at <= datetime('now', ?)`).run(`-${olderThanSeconds} seconds`).changes;
  }

  async recoverExpiredLeases() {
    return productSqlite.prepare(`UPDATE solution_deletion_runs SET status = 'retry_wait', lease_owner = NULL, lease_until = NULL, next_attempt_at = CURRENT_TIMESTAMP, error_code = 'DELETION_LEASE_EXPIRED', updated_at = CURRENT_TIMESTAMP
      WHERE status = 'running' AND lease_until IS NOT NULL AND lease_until < CURRENT_TIMESTAMP`).run().changes;
  }

  async claimNext(workerId: string, leaseSeconds: number) {
    return productSqlite.transaction(() => {
      const candidate = productSqlite.prepare(`SELECT id, solution_id AS solutionId, owner_user_id AS ownerUserId, attempt_count AS attemptCount
        FROM solution_deletion_runs
        WHERE status IN ('pending','retry_wait') AND attempt_count < 5 AND (next_attempt_at IS NULL OR next_attempt_at <= CURRENT_TIMESTAMP)
        ORDER BY requested_at LIMIT 1`).get() as DeletionRun | undefined;
      if (!candidate) return undefined;
      const claimed = productSqlite.prepare(`UPDATE solution_deletion_runs SET status = 'running', attempt_count = attempt_count + 1, lease_owner = ?, lease_until = datetime('now', ?), next_attempt_at = NULL, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND status IN ('pending','retry_wait') AND attempt_count < 5`).run(workerId, `+${leaseSeconds} seconds`, candidate.id).changes;
      return claimed === 1 ? candidate : undefined;
    })();
  }

  async assertLease(runId: string, workerId: string) {
    const owned = productSqlite.prepare("SELECT 1 FROM solution_deletion_runs WHERE id = ? AND status = 'running' AND lease_owner = ? AND lease_until >= CURRENT_TIMESTAMP").get(runId, workerId);
    if (!owned) throw new Error("DELETION_LEASE_LOST");
  }

  async completeSolution(run: DeletionRun, workerId: string) {
    productSqlite.transaction(() => {
      this.assertLeaseSync(run.id, workerId);
      for (const table of solutionDataTables) productSqlite.prepare(`DELETE FROM ${table} WHERE solution_id = ?`).run(run.solutionId);
      productSqlite.prepare("UPDATE product_solutions SET title = '已删除成果', status = 'deleted', stage = 'deleted', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND owner_user_id = ?").run(run.solutionId, run.ownerUserId);
      productSqlite.prepare(`UPDATE solution_deletion_runs SET status = 'completed', manifest_json = '{"verified":true}', error_code = NULL, lease_owner = NULL, lease_until = NULL, next_attempt_at = NULL, completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND lease_owner = ?`).run(run.id, workerId);
    })();
  }

  async recordFailure(runId: string, workerId: string, exhausted: boolean, retrySeconds: number) {
    const status = exhausted ? "failed" : "retry_wait";
    productSqlite.prepare(`UPDATE solution_deletion_runs SET status = ?, error_code = ?, lease_owner = NULL, lease_until = NULL,
      next_attempt_at = CASE WHEN ? = 'failed' THEN NULL ELSE datetime('now', ?) END, completed_at = CASE WHEN ? = 'failed' THEN CURRENT_TIMESTAMP ELSE NULL END,
      updated_at = CURRENT_TIMESTAMP WHERE id = ? AND lease_owner = ?`).run(status, exhausted ? "DELETION_RETRY_EXHAUSTED" : "DELETION_FAILED", status, `+${retrySeconds} seconds`, status, runId, workerId);
  }

  async finalizeAccounts() {
    const candidates = productSqlite.prepare(`SELECT id, owner_user_id AS ownerUserId
      FROM account_deletion_runs
      WHERE status = 'pending'
        AND NOT EXISTS (
          SELECT 1 FROM solution_deletion_runs d
          JOIN product_solutions s ON s.id = d.solution_id
          WHERE d.owner_user_id = account_deletion_runs.owner_user_id AND d.status != 'completed'
        )`).all() as Array<{ id: string; ownerUserId: string }>;
    for (const candidate of candidates) {
      productSqlite.transaction(() => {
        const changed = productSqlite.prepare("UPDATE account_deletion_runs SET status = 'completed', completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'pending'").run(candidate.id).changes;
        if (changed !== 1) return;
        const tombstone = `deleted_${candidate.ownerUserId}`;
        productSqlite.prepare("UPDATE product_users SET username = ?, username_normalized = ?, password_hash = ?, status = 'deleted', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'deletion_pending'").run(tombstone, tombstone, "$2b$12$Jq9XwFQPrv4vtqJU3K5hIu9VNgW6CqYHZVKxjQpWYRLMUekU6nXcK", candidate.ownerUserId);
      })();
    }
    return candidates.length;
  }

  private assertLeaseSync(runId: string, workerId: string) {
    const owned = productSqlite.prepare("SELECT 1 FROM solution_deletion_runs WHERE id = ? AND status = 'running' AND lease_owner = ? AND lease_until >= CURRENT_TIMESTAMP").get(runId, workerId);
    if (!owned) throw new Error("DELETION_LEASE_LOST");
  }
}
