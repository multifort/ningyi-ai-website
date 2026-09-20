import { NextRequest, NextResponse } from "next/server";
import { requireProductSession } from "../../../../../../lib/product/auth";
import { productSqlite } from "../../../../../../lib/product/db";
import { invalidateForMaterialRevision } from "../../../../../../lib/product/material-revision";
import { enqueueSourceProcessing } from "../../../../../../lib/product/process-solution";
import { recordProjectEvent } from "../../../../../../lib/product/project-events";

export async function PATCH(request: NextRequest, context: { params: Promise<{ solutionId: string }> }) {
  const auth = await requireProductSession(request);
  if ("response" in auth) return auth.response;
  const { solutionId } = await context.params;
  try {
    const body = await request.json();
    const needDescription = typeof body?.needDescription === "string" ? body.needDescription.trim() : "";
    if (needDescription.length > 12000 || (needDescription.length > 0 && needDescription.length < 6)) return failure("DESCRIPTION_INVALID", "项目说明需为 6–12000 个字符；如需清空，请至少保留一份已上传项目材料。", 422);
    const draft = productSqlite.prepare(`SELECT i.id FROM intake_drafts i JOIN product_solutions s ON s.id = i.solution_id
      WHERE i.solution_id = ? AND i.user_id = ? AND s.status NOT IN ('deletion_pending', 'deleted')`).get(solutionId, auth.session.userId);
    if (!draft) return failure("SOLUTION_NOT_FOUND", "方案不存在或无法访问。", 404);
    if (!needDescription) {
      const uploadedContent = productSqlite.prepare("SELECT COUNT(*) AS count FROM source_files WHERE solution_id = ? AND user_id = ? AND category = 'content' AND status = 'uploaded'").get(solutionId, auth.session.userId) as { count: number };
      if (!uploadedContent.count) return failure("DESCRIPTION_OR_MATERIAL_REQUIRED", "清空项目说明前，请至少保留一份已上传项目材料。", 409);
    }
    productSqlite.transaction(() => {
      productSqlite.prepare("UPDATE intake_drafts SET need_description = ?, updated_at = CURRENT_TIMESTAMP WHERE solution_id = ? AND user_id = ?").run(needDescription, solutionId, auth.session.userId);
      invalidateForMaterialRevision(solutionId, auth.session.userId);
      recordProjectEvent({ solutionId, userId: auth.session.userId, type: "description_updated", summary: needDescription ? "修改了项目说明" : "清空了项目说明", metadata: { hasDescription: Boolean(needDescription) } });
    })();
    const queue = enqueueSourceProcessing(solutionId, auth.session.userId);
    return NextResponse.json({ success: true, data: { solutionId, needDescription, queue } });
  } catch {
    return failure("DESCRIPTION_UPDATE_FAILED", "暂时无法更新项目说明，请稍后重试。", 500, true);
  }
}

function failure(code: string, message: string, status: number, retryable = false) {
  return NextResponse.json({ success: false, error: { code, message, retryable } }, { status });
}
