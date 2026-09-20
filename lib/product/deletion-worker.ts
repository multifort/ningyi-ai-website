import { randomUUID } from "crypto";
import fs from "fs/promises";
import path from "path";
import { productSqlite } from "./db";
import { safePrivatePath } from "./private-storage";

type DeletionRun = { id: string; solutionId: string; ownerUserId: string; attemptCount: number };

export async function processDeletionBatch(requestedLimit = 2) {
  const limit = Math.min(10, Math.max(1, Math.floor(requestedLimit)));
  const workerId = randomUUID();
  const repairSeconds = Math.min(604800, Math.max(3600, Number(process.env.PRODUCT_DELETION_AUTO_REPAIR_SECONDS || 21600)));
  const repaired = productSqlite.prepare(`UPDATE solution_deletion_runs SET status = 'retry_wait', attempt_count = 0, error_code = 'DELETION_AUTO_REPAIR', next_attempt_at = CURRENT_TIMESTAMP, completed_at = NULL, updated_at = CURRENT_TIMESTAMP
    WHERE status = 'failed' AND completed_at <= datetime('now', ?)`).run(`-${repairSeconds} seconds`).changes;
  const recovered = productSqlite.prepare(`UPDATE solution_deletion_runs SET status = 'retry_wait', lease_owner = NULL, lease_until = NULL, next_attempt_at = CURRENT_TIMESTAMP, error_code = 'DELETION_LEASE_EXPIRED', updated_at = CURRENT_TIMESTAMP
    WHERE status = 'running' AND lease_until IS NOT NULL AND lease_until < CURRENT_TIMESTAMP`).run().changes;
  const claimed: DeletionRun[] = [];
  for (let index = 0; index < limit; index += 1) {
    const run = claimDeletionRun(workerId);
    if (!run) break;
    claimed.push(run);
  }
  const results = await Promise.all(claimed.map((run) => executeDeletion(run, workerId)));
  const finalizedAccounts = finalizeAccountDeletionRuns();
  return {
    workerId,
    claimed: claimed.length,
    processed: results.length,
    completed: results.filter((result) => result === "completed").length,
    retrying: results.filter((result) => result === "retry_wait").length,
    failed: results.filter((result) => result === "failed").length,
    recovered,
    repaired,
    finalizedAccounts,
  };
}

function finalizeAccountDeletionRuns() {
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

function claimDeletionRun(workerId: string): DeletionRun | undefined {
  return productSqlite.transaction(() => {
    const candidate = productSqlite.prepare(`SELECT id, solution_id AS solutionId, owner_user_id AS ownerUserId, attempt_count AS attemptCount
      FROM solution_deletion_runs
      WHERE status IN ('pending','retry_wait') AND attempt_count < 5 AND (next_attempt_at IS NULL OR next_attempt_at <= CURRENT_TIMESTAMP)
      ORDER BY requested_at LIMIT 1`).get() as DeletionRun | undefined;
    if (!candidate) return undefined;
    const leaseSeconds = Math.min(3600, Math.max(60, Number(process.env.PRODUCT_DELETION_LEASE_SECONDS || 600)));
    const claimed = productSqlite.prepare(`UPDATE solution_deletion_runs SET status = 'running', attempt_count = attempt_count + 1, lease_owner = ?, lease_until = datetime('now', ?), next_attempt_at = NULL, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND status IN ('pending','retry_wait') AND attempt_count < 5`).run(workerId, `+${leaseSeconds} seconds`, candidate.id).changes;
    return claimed === 1 ? candidate : undefined;
  })();
}

async function executeDeletion(run: DeletionRun, workerId: string): Promise<"completed" | "retry_wait" | "failed"> {
  try {
    assertLease(run.id, workerId);
    const probe = safePrivatePath(run.ownerUserId, run.solutionId, "00000000-0000-4000-8000-000000000000");
    await fs.rm(path.dirname(probe.absolutePath), { recursive: true, force: true });
    assertLease(run.id, workerId);
    productSqlite.transaction(() => {
      assertLease(run.id, workerId);
      for (const table of ["change_impact_plans", "project_model_locks", "project_model_snapshots", "deliverable_artifact_versions", "deliverable_artifacts", "formal_section_attempts", "formal_sections", "formal_documents", "project_consistency_reports", "model_calls", "free_analyses", "solution_understandings", "template_profiles", "media_analysis_tasks", "source_blocks", "project_user_facts", "processing_runs", "source_files", "intake_drafts"]) {
        productSqlite.prepare(`DELETE FROM ${table} WHERE solution_id = ?`).run(run.solutionId);
      }
      productSqlite.prepare("UPDATE product_solutions SET title = '已删除成果', status = 'deleted', stage = 'deleted', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND owner_user_id = ?").run(run.solutionId, run.ownerUserId);
      productSqlite.prepare(`UPDATE solution_deletion_runs SET status = 'completed', manifest_json = '{"verified":true}', error_code = NULL, lease_owner = NULL, lease_until = NULL, next_attempt_at = NULL, completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND lease_owner = ?`).run(run.id, workerId);
    })();
    return "completed";
  } catch {
    const exhausted = run.attemptCount + 1 >= 5;
    const retryDelays = [5, 30, 120, 600];
    const retrySeconds = retryDelays[Math.min(run.attemptCount, retryDelays.length - 1)];
    productSqlite.prepare(`UPDATE solution_deletion_runs SET status = ?, error_code = ?, lease_owner = NULL, lease_until = NULL,
      next_attempt_at = CASE WHEN ? = 'failed' THEN NULL ELSE datetime('now', ?) END, completed_at = CASE WHEN ? = 'failed' THEN CURRENT_TIMESTAMP ELSE NULL END,
      updated_at = CURRENT_TIMESTAMP WHERE id = ? AND lease_owner = ?`).run(exhausted ? "failed" : "retry_wait", exhausted ? "DELETION_RETRY_EXHAUSTED" : "DELETION_FAILED", exhausted ? "failed" : "retry_wait", `+${retrySeconds} seconds`, exhausted ? "failed" : "retry_wait", run.id, workerId);
    return exhausted ? "failed" : "retry_wait";
  }
}

function assertLease(runId: string, workerId: string) {
  const owned = productSqlite.prepare(`SELECT 1 FROM solution_deletion_runs WHERE id = ? AND status = 'running' AND lease_owner = ? AND lease_until >= CURRENT_TIMESTAMP`).get(runId, workerId);
  if (!owned) throw new Error("DELETION_LEASE_LOST");
}
