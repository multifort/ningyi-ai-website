import { productSqlite } from "./db";
import type { FormalDocumentState, FormalWork, FormalWorkRepository, RenderClaim } from "./formal-work-repository";

export class SqliteFormalWorkRepository implements FormalWorkRepository {
  async initializeDocument(input: Parameters<FormalWorkRepository["initializeDocument"]>[0]) {
    productSqlite.transaction(() => {
      productSqlite.prepare("INSERT OR IGNORE INTO formal_documents (solution_id, provider, model, total_sections) VALUES (?, ?, ?, ?)").run(input.solutionId, input.provider, input.model, input.outline.length);
      const insert = productSqlite.prepare("INSERT OR IGNORE INTO formal_sections (id, solution_id, section_index, section_key, title) VALUES (?, ?, ?, ?, ?)");
      input.outline.forEach((section) => insert.run(section.id, input.solutionId, section.sectionIndex, section.sectionKey, section.title));
      productSqlite.prepare("UPDATE formal_documents SET provider = ?, model = ?, status = CASE WHEN status IN ('awaiting_configuration', 'stale') AND ? = 1 THEN 'pending' WHEN status IN ('pending', 'stale') AND ? = 0 THEN 'awaiting_configuration' ELSE status END, updated_at = CURRENT_TIMESTAMP WHERE solution_id = ?").run(input.provider, input.model, input.configured ? 1 : 0, input.configured ? 1 : 0, input.solutionId);
    }).immediate();
  }

  async documentState(solutionId: string) {
    const document = productSqlite.prepare("SELECT status, provider, model, current_section AS currentSection, total_sections AS totalSections, last_error_code AS lastErrorCode FROM formal_documents WHERE solution_id = ?").get(solutionId) as Omit<FormalDocumentState, "sections"> | undefined;
    if (!document) return undefined;
    const sections = productSqlite.prepare(`SELECT section_index AS sectionIndex, section_key AS sectionKey, title, status, summary,
      retry_cycle AS retryCycle, next_attempt_at AS nextAttemptAt, failed_at AS failedAt,
      (SELECT COUNT(*) FROM formal_section_attempts a WHERE a.section_id = formal_sections.id AND a.retry_cycle = formal_sections.retry_cycle) AS attemptCount
      FROM formal_sections WHERE solution_id = ? ORDER BY section_index`).all(solutionId) as FormalDocumentState["sections"];
    return { ...document, sections };
  }

  async markAwaitingConfiguration(solutionId: string) {
    productSqlite.prepare("UPDATE formal_documents SET status = 'awaiting_configuration', updated_at = CURRENT_TIMESTAMP WHERE solution_id = ?").run(solutionId);
  }

  async processingAllowed(solutionId: string, userId: string) {
    return Boolean(productSqlite.prepare("SELECT 1 FROM product_solutions WHERE id = ? AND owner_user_id = ? AND status NOT IN ('deletion_pending', 'deleted')").get(solutionId, userId));
  }

  async recoverStaleFormal(solutionId: string | undefined, staleAfterSeconds: number) {
    const cutoff = `-${staleAfterSeconds} seconds`;
    const scope = solutionId ? " AND solution_id = ?" : "";
    const params = solutionId ? [cutoff, solutionId] : [cutoff];
    const staleSections = productSqlite.prepare(`SELECT id, solution_id AS solutionId FROM formal_sections WHERE status = 'generating' AND (lease_until < CURRENT_TIMESTAMP OR (lease_until IS NULL AND updated_at < datetime('now', ?)))${scope}`).all(...params) as Array<{ id: string; solutionId: string }>;
    if (!staleSections.length) return 0;
    return productSqlite.transaction(() => {
      for (const section of staleSections) {
        productSqlite.prepare("UPDATE formal_sections SET status = 'pending', lease_owner = NULL, lease_until = NULL, next_attempt_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'generating'").run(section.id);
        productSqlite.prepare("UPDATE formal_documents SET status = 'pending', last_error_code = 'STALE_WORK_RECOVERED', updated_at = CURRENT_TIMESTAMP WHERE solution_id = ? AND status = 'generating'").run(section.solutionId);
        productSqlite.prepare("UPDATE formal_section_attempts SET status = 'failed', error_code = 'WORKER_INTERRUPTED', completed_at = CURRENT_TIMESTAMP WHERE section_id = ? AND status = 'running'").run(section.id);
      }
      if (solutionId) {
        productSqlite.prepare("UPDATE model_calls SET status = 'failed', error_code = 'WORKER_INTERRUPTED', completed_at = CURRENT_TIMESTAMP WHERE solution_id = ? AND status = 'running' AND purpose LIKE 'formal_section:%' AND created_at < datetime('now', ?)").run(solutionId, cutoff);
      } else {
        productSqlite.prepare("UPDATE model_calls SET status = 'failed', error_code = 'WORKER_INTERRUPTED', completed_at = CURRENT_TIMESTAMP WHERE status = 'running' AND purpose LIKE 'formal_section:%' AND created_at < datetime('now', ?)").run(cutoff);
      }
      return staleSections.length;
    }).immediate();
  }

  async repairExhaustedFormal(olderThanSeconds: number) {
    return productSqlite.transaction(() => {
      const sections = productSqlite.prepare("SELECT id, solution_id AS solutionId FROM formal_sections WHERE status = 'failed' AND failed_at <= datetime('now', ?)").all(`-${olderThanSeconds} seconds`) as Array<{ id: string; solutionId: string }>;
      if (!sections.length) return 0;
      const repairSection = productSqlite.prepare("UPDATE formal_sections SET status = 'pending', retry_cycle = retry_cycle + 1, next_attempt_at = CURRENT_TIMESTAMP, failed_at = NULL, lease_owner = NULL, lease_until = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'failed'");
      const repairDocument = productSqlite.prepare("UPDATE formal_documents SET status = 'pending', last_error_code = 'FORMAL_AUTO_REPAIR', updated_at = CURRENT_TIMESTAMP WHERE solution_id = ? AND status = 'blocked'");
      const repairSolution = productSqlite.prepare("UPDATE product_solutions SET status = 'recovering', stage = 'formal_analysis', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'blocked'");
      for (const section of sections) {
        repairSection.run(section.id);
        const documentRepaired = repairDocument.run(section.solutionId).changes;
        repairSolution.run(section.solutionId);
        if (documentRepaired) productSqlite.prepare("UPDATE change_impact_plans SET status = 'accepted', updated_at = CURRENT_TIMESTAMP WHERE solution_id = ? AND status = 'failed' AND execution_started_at IS NOT NULL").run(section.solutionId);
      }
      return sections.length;
    }).immediate();
  }

  async reactivateConfiguredFormal(provider: string) {
    return productSqlite.prepare("UPDATE formal_documents SET status = 'pending', last_error_code = NULL, updated_at = CURRENT_TIMESTAMP WHERE status = 'awaiting_configuration' AND provider = ?").run(provider).changes;
  }

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
