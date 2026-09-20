import { productSqlite } from "./db";

/** Marks generated content stale while retaining the user's source files. */
export function invalidateForUnderstandingRevision(solutionId: string, userId: string) {
  return productSqlite.transaction(() => {
    const formal = productSqlite.prepare("SELECT 1 FROM formal_documents WHERE solution_id = ?").get(solutionId);
    productSqlite.prepare("UPDATE solution_understandings SET status = 'stale', updated_at = CURRENT_TIMESTAMP WHERE solution_id = ?").run(solutionId);
    productSqlite.prepare("UPDATE free_analyses SET status = 'stale', updated_at = CURRENT_TIMESTAMP WHERE solution_id = ?").run(solutionId);
    productSqlite.prepare("UPDATE project_consistency_reports SET status = 'stale', updated_at = CURRENT_TIMESTAMP WHERE solution_id = ?").run(solutionId);
    productSqlite.prepare(`UPDATE deliverable_artifacts SET status = 'superseded', updated_at = CURRENT_TIMESTAMP
      WHERE solution_id = ? AND user_id = ? AND status = 'available'`).run(solutionId, userId);
    productSqlite.prepare("UPDATE model_calls SET status = 'failed', error_code = 'UNDERSTANDING_REVISED_DURING_GENERATION', completed_at = CURRENT_TIMESTAMP WHERE solution_id = ? AND status = 'running'").run(solutionId);
    productSqlite.prepare("UPDATE formal_section_attempts SET status = 'failed', error_code = 'UNDERSTANDING_REVISED_DURING_GENERATION', completed_at = CURRENT_TIMESTAMP WHERE solution_id = ? AND status = 'running'").run(solutionId);
    if (formal) {
      productSqlite.prepare(`UPDATE formal_sections SET status = 'pending', content = NULL, summary = NULL, claims_json = NULL,
        structured_items_json = NULL, context_hash = NULL, retry_cycle = retry_cycle + 1, next_attempt_at = NULL,
        failed_at = NULL, lease_owner = NULL, lease_until = NULL, updated_at = CURRENT_TIMESTAMP WHERE solution_id = ?`).run(solutionId);
      productSqlite.prepare("UPDATE formal_documents SET status = 'stale', current_section = 0, last_error_code = 'USER_FACT_REVISION_PENDING', updated_at = CURRENT_TIMESTAMP WHERE solution_id = ?").run(solutionId);
    }
    productSqlite.prepare(`UPDATE product_solutions SET status = 'processing', stage = ?, render_lease_owner = NULL,
      render_lease_until = NULL, render_next_attempt_at = NULL, render_error_code = NULL, render_failed_at = NULL,
      updated_at = CURRENT_TIMESTAMP WHERE id = ? AND owner_user_id = ?`).run(formal ? "formal_analysis" : "quick_understanding", solutionId, userId);
    return { hasFormalDocument: Boolean(formal) };
  })();
}
