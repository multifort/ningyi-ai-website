import { productSqlite } from "./db";
import { MediaLeaseLostError, type MediaTask, type MediaTaskRepository } from "./media-task-repository";

export class SqliteMediaTaskRepository implements MediaTaskRepository {
  async findNext(userConcurrency: number) {
    return productSqlite.prepare(`SELECT t.id, t.solution_id AS solutionId, t.source_file_id AS sourceFileId,
        t.source_block_id AS sourceBlockId, t.route, t.fallback_route AS fallbackRoute, t.attempt_count AS attemptCount,
        s.owner_user_id AS userId, f.detected_format AS detectedFormat, f.storage_key AS storageKey,
        f.original_name AS originalName, b.metadata_json AS metadataJson
      FROM media_analysis_tasks t
      JOIN product_solutions s ON s.id = t.solution_id
      JOIN source_files f ON f.id = t.source_file_id
      JOIN source_blocks b ON b.id = t.source_block_id
      WHERE t.status IN ('queued', 'awaiting_configuration') AND (t.next_attempt_at IS NULL OR t.next_attempt_at <= CURRENT_TIMESTAMP) AND s.status NOT IN ('deletion_pending', 'deleted')
        AND (SELECT COUNT(*) FROM media_analysis_tasks active JOIN product_solutions active_solution ON active_solution.id = active.solution_id
          WHERE active_solution.owner_user_id = s.owner_user_id AND active.status = 'processing' AND active.lease_until > CURRENT_TIMESTAMP) < ?
      ORDER BY t.updated_at, t.id LIMIT 1`).get(userConcurrency) as MediaTask | undefined;
  }

  async claim(taskId: string, workerId: string, leaseSeconds: number) {
    return productSqlite.prepare("UPDATE media_analysis_tasks SET status = 'processing', attempt_count = attempt_count + 1, lease_owner = ?, lease_until = datetime('now', ?), next_attempt_at = NULL, error_code = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status IN ('queued', 'awaiting_configuration') AND (next_attempt_at IS NULL OR next_attempt_at <= CURRENT_TIMESTAMP)").run(workerId, `+${leaseSeconds} seconds`, taskId).changes === 1;
  }

  async complete(task: MediaTask, workerId: string, result: { canonicalText: string; contentHash: string; confidence: number; provider: string; model: string }) {
    return productSqlite.transaction(() => {
      const completed = productSqlite.prepare("UPDATE media_analysis_tasks SET status = 'completed', lease_owner = NULL, lease_until = NULL, next_attempt_at = NULL, failed_at = NULL, error_code = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'processing' AND lease_owner = ? AND lease_until > CURRENT_TIMESTAMP").run(task.id, workerId);
      if (!completed.changes) throw new MediaLeaseLostError();
      productSqlite.prepare("UPDATE source_blocks SET canonical_text = ?, content_hash = ?, metadata_json = json_set(metadata_json, '$.mediaAnalysis', json(?)) WHERE id = ?").run(result.canonicalText, result.contentHash, JSON.stringify({ route: task.route, confidence: result.confidence, provider: result.provider, model: result.model }), task.sourceBlockId);
      return (productSqlite.prepare("SELECT COUNT(*) AS count FROM media_analysis_tasks WHERE solution_id = ? AND status != 'completed'").get(task.solutionId) as { count: number }).count;
    })();
  }

  async scheduleFallback(taskId: string, workerId: string, route: string, fallbackRoute: string, errorCode: string) {
    return productSqlite.prepare("UPDATE media_analysis_tasks SET route = ?, fallback_route = ?, status = 'queued', lease_owner = NULL, lease_until = NULL, next_attempt_at = CURRENT_TIMESTAMP, error_code = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND lease_owner = ?").run(route, fallbackRoute, errorCode, taskId, workerId).changes === 1;
  }

  async recordConfigurationFailure(task: MediaTask, workerId: string, exhausted: boolean, errorCode: string, retrySeconds: number) {
    const status = exhausted ? "failed" : "awaiting_configuration";
    const released = productSqlite.prepare(`UPDATE media_analysis_tasks SET status = ?, lease_owner = NULL, lease_until = NULL, error_code = ?,
      next_attempt_at = CASE WHEN ? = 'failed' THEN NULL ELSE datetime('now', ?) END,
      failed_at = CASE WHEN ? = 'failed' THEN CURRENT_TIMESTAMP ELSE NULL END, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND lease_owner = ?`).run(status, exhausted ? "MEDIA_CONFIGURATION_RETRY_EXHAUSTED" : errorCode, status, `+${retrySeconds} seconds`, status, task.id, workerId);
    if (released.changes === 1 && exhausted) productSqlite.prepare("UPDATE product_solutions SET status = 'blocked', stage = 'media_analysis', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(task.solutionId);
    return released.changes === 1;
  }

  async recordTerminalFailure(task: MediaTask, workerId: string, errorCode: string) {
    return productSqlite.transaction(() => {
      const failed = productSqlite.prepare("UPDATE media_analysis_tasks SET status = 'failed', lease_owner = NULL, lease_until = NULL, next_attempt_at = NULL, failed_at = CURRENT_TIMESTAMP, error_code = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND lease_owner = ?").run(errorCode, task.id, workerId);
      if (!failed.changes) return { owned: false, terminal: false };
      const retryable = productSqlite.prepare("SELECT COUNT(*) AS count FROM media_analysis_tasks WHERE solution_id = ? AND status IN ('queued', 'processing', 'awaiting_configuration')").get(task.solutionId) as { count: number };
      productSqlite.prepare("UPDATE product_solutions SET status = ?, stage = 'media_analysis', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(retryable.count ? "recovering" : "blocked", task.solutionId);
      return { owned: true, terminal: retryable.count === 0 };
    })();
  }

  async recoverStale(olderThanSeconds: number) {
    return productSqlite.prepare("UPDATE media_analysis_tasks SET status = 'queued', lease_owner = NULL, lease_until = NULL, next_attempt_at = CURRENT_TIMESTAMP, error_code = 'STALE_WORK_RECOVERED', updated_at = CURRENT_TIMESTAMP WHERE status = 'processing' AND (lease_until < CURRENT_TIMESTAMP OR (lease_until IS NULL AND updated_at < datetime('now', ?)))").run(`-${olderThanSeconds} seconds`).changes;
  }

  async repairFailed(olderThanSeconds: number) {
    return productSqlite.transaction(() => {
      const solutions = productSqlite.prepare("SELECT DISTINCT solution_id AS solutionId FROM media_analysis_tasks WHERE status = 'failed' AND failed_at <= datetime('now', ?)").all(`-${olderThanSeconds} seconds`) as Array<{ solutionId: string }>;
      const repaired = productSqlite.prepare("UPDATE media_analysis_tasks SET status = 'queued', attempt_count = 0, next_attempt_at = CURRENT_TIMESTAMP, failed_at = NULL, error_code = 'MEDIA_AUTO_REPAIR', updated_at = CURRENT_TIMESTAMP WHERE status = 'failed' AND failed_at <= datetime('now', ?)").run(`-${olderThanSeconds} seconds`).changes;
      const restore = productSqlite.prepare("UPDATE product_solutions SET status = 'recovering', stage = 'media_analysis', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'blocked'");
      for (const solution of solutions) restore.run(solution.solutionId);
      return repaired;
    })();
  }

  async advanceToFormalAnalysis(solutionId: string) {
    productSqlite.prepare("UPDATE product_solutions SET stage = 'formal_analysis', status = 'processing', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(solutionId);
  }
}
