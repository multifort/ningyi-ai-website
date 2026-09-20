import { NextRequest, NextResponse } from "next/server";
import { requireProductSession } from "../../../../../../lib/product/auth";
import { productSqlite } from "../../../../../../lib/product/db";
import { formalStatus } from "../../../../../../lib/product/formal-analysis";
import { listDeliverables } from "../../../../../../lib/product/deliverables";
import { deliverableOutcomeCatalog } from "../../../../../../lib/product/deliverable-catalog";
import { projectConsistencyStatus } from "../../../../../../lib/product/project-consistency";
import { solutionRecoveryStatus } from "../../../../../../lib/product/recovery-status";
import { projectInputFingerprint } from "../../../../../../lib/product/input-fingerprint";
import { listProjectEvents } from "../../../../../../lib/product/project-events";

export async function GET(request: NextRequest, context: { params: Promise<{ solutionId: string }> }) {
  const auth = await requireProductSession(request);
  if ("response" in auth) return auth.response;
  const { solutionId } = await context.params;
  const solution = productSqlite.prepare(`SELECT id, title, status, stage, render_attempt_count AS renderAttemptCount,
    render_next_attempt_at AS renderNextAttemptAt, render_error_code AS renderErrorCode, render_failed_at AS renderFailedAt
    FROM product_solutions WHERE id = ? AND owner_user_id = ? AND status NOT IN ('deletion_pending', 'deleted')`).get(solutionId, auth.session.userId) as any;
  if (!solution) return NextResponse.json({ success: false, error: { code: "SOLUTION_NOT_FOUND", message: "方案不存在或无法访问。", retryable: false } }, { status: 404 });
  const files = productSqlite.prepare(`SELECT sf.id, sf.category, sf.original_name AS displayName, sf.status, sf.detected_format AS detectedFormat,
    tp.status AS templateStatus, tp.fallback_reason AS templateNotice, tp.warnings_json AS templateWarnings
    FROM source_files sf LEFT JOIN template_profiles tp ON tp.source_file_id = sf.id
    WHERE sf.solution_id = ? ORDER BY sf.created_at, sf.id`).all(solutionId);
  const intake = productSqlite.prepare("SELECT purpose_primary AS purposePrimary, need_description AS needDescription FROM intake_drafts WHERE solution_id = ? AND user_id = ?").get(solutionId, auth.session.userId);
  const headlines: Record<string, string> = { awaiting_upload: "正在等待项目材料上传", ready_to_process: "项目副本已准备好，确认后即可开始处理", quick_understanding: "正在理解你提供的信息", media_analysis: "正在识别图片与扫描材料", formal_analysis: "材料已经解析，正在形成方案", rendering: "正在整理成果文件", completed: "成果已经准备好" };
  const run = productSqlite.prepare("SELECT status, attempt_count AS attemptCount, error_code AS errorCode, next_attempt_at AS nextAttemptAt, completed_at AS failedAt FROM processing_runs WHERE solution_id = ? AND run_type = 'source_ingestion'").get(solutionId) as any;
  const media = productSqlite.prepare("SELECT status, COUNT(*) AS count FROM media_analysis_tasks WHERE solution_id = ? GROUP BY status").all(solutionId);
  const mediaRecovery = productSqlite.prepare(`SELECT status, attempt_count AS attemptCount, error_code AS errorCode,
    next_attempt_at AS nextAttemptAt, failed_at AS failedAt FROM media_analysis_tasks WHERE solution_id = ? AND status IN ('awaiting_configuration','failed')
    ORDER BY CASE status WHEN 'failed' THEN 0 ELSE 1 END, updated_at LIMIT 1`).get(solutionId) as any;
  const formal = formalStatus(solutionId) as any;
  const recovery = solutionRecoveryStatus(solution, run, mediaRecovery, formal);
  return NextResponse.json({ success: true, data: { solutionId, title: solution.title, status: solution.status, stage: solution.stage, headline: recovery?.headline || headlines[solution.stage] || "方案正在处理中", requiresUserAction: false, automaticRecovery: Boolean(recovery), recovery, processingRun: run || null, mediaAnalysis: media, intake: intake || null, inputFingerprint: projectInputFingerprint(solutionId, auth.session.userId), activity: listProjectEvents(solutionId, auth.session.userId), formalDocument: formal, consistency: projectConsistencyStatus(solutionId), deliverableOutcomes: deliverableOutcomeCatalog(solutionId, auth.session.userId), deliverables: listDeliverables(solutionId, auth.session.userId), files } });
}
