import { NextRequest, NextResponse } from "next/server";
import { requireProductSession } from "../../../../lib/product/auth";
import { productSqlite } from "../../../../lib/product/db";
import { solutionRecoveryStatus } from "../../../../lib/product/recovery-status";

export async function GET(request: NextRequest) {
  const auth = await requireProductSession(request);
  if ("response" in auth) return auth.response;
  const rows = productSqlite.prepare(`
    SELECT s.id, s.title, s.status, s.stage, s.created_at AS createdAt, s.updated_at AS updatedAt,
      s.render_attempt_count AS renderAttemptCount, s.render_next_attempt_at AS renderNextAttemptAt,
      s.render_error_code AS renderErrorCode, s.render_failed_at AS renderFailedAt,
      (SELECT COUNT(*) FROM source_files f WHERE f.solution_id = s.id) AS fileCount,
      (SELECT COUNT(*) FROM deliverable_artifacts a WHERE a.solution_id = s.id AND a.status = 'available') AS artifactCount,
      (SELECT status FROM processing_runs r WHERE r.solution_id = s.id AND r.run_type = 'source_ingestion') AS sourceStatus,
      (SELECT attempt_count FROM processing_runs r WHERE r.solution_id = s.id AND r.run_type = 'source_ingestion') AS sourceAttemptCount,
      (SELECT next_attempt_at FROM processing_runs r WHERE r.solution_id = s.id AND r.run_type = 'source_ingestion') AS sourceNextAttemptAt,
      (SELECT completed_at FROM processing_runs r WHERE r.solution_id = s.id AND r.run_type = 'source_ingestion') AS sourceFailedAt,
      (SELECT error_code FROM processing_runs r WHERE r.solution_id = s.id AND r.run_type = 'source_ingestion') AS sourceErrorCode
    FROM product_solutions s
    WHERE s.owner_user_id = ? AND s.status NOT IN ('deletion_pending', 'deleted')
    ORDER BY s.updated_at DESC, s.created_at DESC
  `).all(auth.session.userId) as any[];
  const mediaQuery = productSqlite.prepare(`SELECT status, attempt_count AS attemptCount, next_attempt_at AS nextAttemptAt,
    failed_at AS failedAt, error_code AS errorCode FROM media_analysis_tasks WHERE solution_id = ? AND status IN ('awaiting_configuration','failed')
    ORDER BY CASE status WHEN 'failed' THEN 0 ELSE 1 END, updated_at LIMIT 1`);
  const formalQuery = productSqlite.prepare("SELECT status, last_error_code AS lastErrorCode FROM formal_documents WHERE solution_id = ?");
  const sectionQuery = productSqlite.prepare(`SELECT status, next_attempt_at AS nextAttemptAt, failed_at AS failedAt,
    (SELECT COUNT(*) FROM formal_section_attempts a WHERE a.section_id = formal_sections.id AND a.retry_cycle = formal_sections.retry_cycle) AS attemptCount
    FROM formal_sections WHERE solution_id = ? AND (status = 'failed' OR next_attempt_at IS NOT NULL) ORDER BY CASE status WHEN 'failed' THEN 0 ELSE 1 END, section_index LIMIT 1`);
  const solutions = rows.map((solution) => {
    const run = solution.sourceStatus ? { status: solution.sourceStatus, attemptCount: solution.sourceAttemptCount, nextAttemptAt: solution.sourceNextAttemptAt, failedAt: solution.sourceFailedAt, errorCode: solution.sourceErrorCode } : null;
    const media = solution.stage === "media_analysis" ? mediaQuery.get(solution.id) : null;
    const formalDocument = solution.stage === "formal_analysis" ? formalQuery.get(solution.id) as any : null;
    const section = formalDocument ? sectionQuery.get(solution.id) : null;
    const formal = formalDocument ? { ...formalDocument, sections: section ? [section] : [] } : null;
    const recovery = solutionRecoveryStatus(solution, run, media, formal);
    const { sourceStatus, sourceAttemptCount, sourceNextAttemptAt, sourceFailedAt, sourceErrorCode, renderAttemptCount, renderNextAttemptAt, renderErrorCode, renderFailedAt, ...publicSolution } = solution;
    return { ...publicSolution, automaticRecovery: Boolean(recovery), recovery };
  });
  return NextResponse.json({ success: true, data: { solutions } });
}
