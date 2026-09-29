import { randomUUID } from "crypto";
import { productSqlite } from "./db";
import type { SourceProcessingRepository, SourceQueueResult, SourceTask, SourceTaskClaim, StoredSourceFile } from "./source-processing-repository";

export class SqliteSourceProcessingRepository implements SourceProcessingRepository {
  async startInline(runId: string, solutionId: string, userId: string) {
    productSqlite.prepare("INSERT INTO processing_runs (id, solution_id, user_id, run_type, status, attempt_count, started_at) VALUES (?, ?, ?, 'source_ingestion', 'running', 1, CURRENT_TIMESTAMP) ON CONFLICT(solution_id, run_type) DO UPDATE SET status = 'running', attempt_count = attempt_count + 1, error_code = NULL, started_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP").run(runId, solutionId, userId);
  }

  async loadInput(solutionId: string, userId: string) {
    const rows = productSqlite.prepare("SELECT id, original_name AS originalName, detected_format AS detectedFormat, storage_key AS storageKey, category FROM source_files WHERE solution_id = ? AND user_id = ? AND status = 'uploaded' ORDER BY created_at, id").all(solutionId, userId) as StoredSourceFile[];
    const intake = productSqlite.prepare("SELECT purpose_primary AS purposePrimary, need_description AS needDescription, form_data AS formData FROM intake_drafts WHERE solution_id = ? AND user_id = ?").get(solutionId, userId) as { purposePrimary: string; needDescription: string; formData: string } | undefined;
    if (!intake) throw new Error("SOURCE_INTAKE_NOT_FOUND");
    return { files: rows, intake };
  }

  async commitParsed(input: Parameters<SourceProcessingRepository["commitParsed"]>[0]) {
    productSqlite.transaction(() => {
      if (input.workerId && !this.leaseOwned(input.solutionId, input.workerId)) throw new Error("SOURCE_LEASE_LOST");
      productSqlite.prepare("DELETE FROM media_analysis_tasks WHERE solution_id = ?").run(input.solutionId);
      productSqlite.prepare("DELETE FROM source_blocks WHERE solution_id = ?").run(input.solutionId);
      const insertBlock = productSqlite.prepare("INSERT INTO source_blocks (id, solution_id, source_file_id, block_type, canonical_text, locator_json, content_hash, source_format, metadata_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");
      for (const block of input.blocks) insertBlock.run(block.id, input.solutionId, block.sourceFileId, block.blockType, block.canonicalText, JSON.stringify(block.locator), block.contentHash, block.sourceFormat || null, JSON.stringify({ warnings: block.warnings || [], confidence: block.confidence ?? null, structuredData: block.structuredData ?? null, parser: block.parser ?? null }));
      const insertMedia = productSqlite.prepare(`INSERT INTO media_analysis_tasks
        (id, solution_id, source_file_id, source_block_id, route, fallback_route, status, requires_model, reason_codes_json, signals_json, input_hash)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
      for (const route of input.mediaRoutes) insertMedia.run(randomUUID(), input.solutionId, route.sourceFileId, route.sourceBlockId, route.route, route.fallbackRoute, route.status, route.requiresModel ? 1 : 0, JSON.stringify(route.reasonCodes), JSON.stringify(route.signals), route.inputHash);
      productSqlite.prepare("INSERT INTO solution_understandings (solution_id, summary, facts_json, source_block_count, status) VALUES (?, ?, ?, ?, 'ready') ON CONFLICT(solution_id) DO UPDATE SET summary = excluded.summary, facts_json = excluded.facts_json, source_block_count = excluded.source_block_count, status = 'ready', updated_at = CURRENT_TIMESTAMP").run(input.solutionId, input.summary, JSON.stringify(input.facts), input.blocks.length);
      const completed = productSqlite.prepare(`UPDATE processing_runs SET status = 'succeeded', lease_owner = NULL, lease_until = NULL, completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE solution_id = ? AND run_type = 'source_ingestion'${input.workerId ? " AND lease_owner = ?" : ""}`).run(input.solutionId, ...(input.workerId ? [input.workerId] : []));
      if (input.workerId && completed.changes !== 1) throw new Error("SOURCE_LEASE_LOST");
      productSqlite.prepare("UPDATE product_solutions SET stage = ?, status = 'processing', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(input.pendingMedia ? "media_analysis" : "formal_analysis", input.solutionId);
    })();
  }

  async attemptCount(solutionId: string) {
    const run = productSqlite.prepare("SELECT attempt_count AS attemptCount FROM processing_runs WHERE solution_id = ? AND run_type = 'source_ingestion'").get(solutionId) as { attemptCount: number } | undefined;
    return Number(run?.attemptCount || 1);
  }

  async recordFailure(solutionId: string, workerId: string | undefined, exhausted: boolean, retrySeconds: number) {
    const status = exhausted ? "failed" : "retry_wait";
    productSqlite.prepare(`UPDATE processing_runs SET status = ?, lease_owner = NULL, lease_until = NULL, error_code = ?,
      next_attempt_at = CASE WHEN ? = 'failed' THEN NULL ELSE datetime('now', ?) END,
      completed_at = CASE WHEN ? = 'failed' THEN CURRENT_TIMESTAMP ELSE NULL END, updated_at = CURRENT_TIMESTAMP
      WHERE solution_id = ? AND run_type = 'source_ingestion'${workerId ? " AND lease_owner = ?" : ""}`).run(status, exhausted ? "SOURCE_RETRY_EXHAUSTED" : "SOURCE_INGESTION_FAILED", status, `+${retrySeconds} seconds`, status, solutionId, ...(workerId ? [workerId] : []));
    productSqlite.prepare("UPDATE product_solutions SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(exhausted ? "blocked" : "recovering", solutionId);
  }

  async enqueue(runId: string, solutionId: string, userId: string): Promise<SourceQueueResult> {
    const pending = productSqlite.prepare("SELECT COUNT(*) AS count FROM source_files WHERE solution_id = ? AND user_id = ? AND category = 'content' AND status IN ('waiting_upload', 'failed')").get(solutionId, userId) as { count: number };
    if (pending.count) throw new Error("MATERIAL_UPLOAD_PENDING");
    const existing = productSqlite.prepare("SELECT status, attempt_count AS attemptCount FROM processing_runs WHERE solution_id = ? AND run_type = 'source_ingestion'").get(solutionId) as { status: string; attemptCount: number } | undefined;
    if (existing && ["queued", "running", "succeeded"].includes(existing.status)) return { status: existing.status, attemptCount: existing.attemptCount, enqueued: false };
    productSqlite.transaction(() => {
      productSqlite.prepare(`INSERT INTO processing_runs (id, solution_id, user_id, run_type, status, attempt_count)
        VALUES (?, ?, ?, 'source_ingestion', 'queued', 0)
        ON CONFLICT(solution_id, run_type) DO UPDATE SET status = 'queued', attempt_count = 0, lease_owner = NULL, lease_until = NULL, next_attempt_at = NULL, error_code = NULL, completed_at = NULL, updated_at = CURRENT_TIMESTAMP`).run(runId, solutionId, userId);
      productSqlite.prepare("UPDATE product_solutions SET status = 'processing', stage = 'quick_understanding', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(solutionId);
    })();
    return { status: "queued", attemptCount: existing?.attemptCount || 0, enqueued: true };
  }

  async claimNext(workerId: string, userConcurrency: number, leaseSeconds: number): Promise<SourceTaskClaim> {
    return productSqlite.transaction((): SourceTaskClaim => {
      const next = productSqlite.prepare(`SELECT r.solution_id AS solutionId, r.user_id AS userId FROM processing_runs r
        JOIN product_solutions s ON s.id = r.solution_id
        WHERE r.run_type = 'source_ingestion' AND r.status IN ('queued','retry_wait') AND (r.next_attempt_at IS NULL OR r.next_attempt_at <= CURRENT_TIMESTAMP) AND s.status NOT IN ('deletion_pending','deleted')
          AND (SELECT COUNT(*) FROM processing_runs active WHERE active.user_id = r.user_id AND active.run_type = 'source_ingestion' AND active.status = 'running' AND active.lease_until > CURRENT_TIMESTAMP) < ?
        ORDER BY r.updated_at, r.solution_id LIMIT 1`).get(userConcurrency) as SourceTask | undefined;
      if (!next) return { status: "idle" };
      const claimed = productSqlite.prepare("UPDATE processing_runs SET status = 'running', attempt_count = attempt_count + 1, lease_owner = ?, lease_until = datetime('now', ?), next_attempt_at = NULL, error_code = NULL, started_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE solution_id = ? AND run_type = 'source_ingestion' AND status IN ('queued','retry_wait') AND (next_attempt_at IS NULL OR next_attempt_at <= CURRENT_TIMESTAMP)").run(workerId, `+${leaseSeconds} seconds`, next.solutionId);
      return claimed.changes === 1 ? { status: "claimed", task: next } : { status: "contended", solutionId: next.solutionId };
    })();
  }

  async recoverStale(olderThanSeconds: number) {
    return productSqlite.prepare("UPDATE processing_runs SET status = 'queued', lease_owner = NULL, lease_until = NULL, error_code = 'STALE_WORK_RECOVERED', updated_at = CURRENT_TIMESTAMP WHERE run_type = 'source_ingestion' AND status = 'running' AND (lease_until < CURRENT_TIMESTAMP OR (lease_until IS NULL AND updated_at < datetime('now', ?)))").run(`-${olderThanSeconds} seconds`).changes;
  }

  async repairFailed(olderThanSeconds: number) {
    return productSqlite.transaction(() => {
      const solutions = productSqlite.prepare("SELECT solution_id AS solutionId FROM processing_runs WHERE run_type = 'source_ingestion' AND status = 'failed' AND completed_at <= datetime('now', ?)").all(`-${olderThanSeconds} seconds`) as Array<{ solutionId: string }>;
      if (!solutions.length) return 0;
      const repaired = productSqlite.prepare("UPDATE processing_runs SET status = 'retry_wait', attempt_count = 0, error_code = 'SOURCE_AUTO_REPAIR', next_attempt_at = CURRENT_TIMESTAMP, completed_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE run_type = 'source_ingestion' AND status = 'failed' AND completed_at <= datetime('now', ?)").run(`-${olderThanSeconds} seconds`).changes;
      const restore = productSqlite.prepare("UPDATE product_solutions SET status = 'recovering', stage = 'quick_understanding', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'blocked'");
      for (const solution of solutions) restore.run(solution.solutionId);
      return repaired;
    })();
  }

  private leaseOwned(solutionId: string, workerId: string) {
    return Boolean(productSqlite.prepare("SELECT 1 FROM processing_runs WHERE solution_id = ? AND run_type = 'source_ingestion' AND status = 'running' AND lease_owner = ? AND lease_until > CURRENT_TIMESTAMP").get(solutionId, workerId));
  }
}
