import fs from "fs/promises";
import { NextRequest, NextResponse } from "next/server";
import { requireProductSession } from "../../../../../../../lib/product/auth";
import { productSqlite } from "../../../../../../../lib/product/db";
import { invalidateForMaterialRevision } from "../../../../../../../lib/product/material-revision";
import { enqueueSourceProcessing } from "../../../../../../../lib/product/process-solution";
import { safePrivatePath } from "../../../../../../../lib/product/private-storage";
import { recordProjectEvent } from "../../../../../../../lib/product/project-events";

export async function DELETE(request: NextRequest, context: { params: Promise<{ solutionId: string; fileId: string }> }) {
  const auth = await requireProductSession(request);
  if ("response" in auth) return auth.response;
  const { solutionId, fileId } = await context.params;
  const file = productSqlite.prepare(`SELECT sf.id, sf.storage_key AS storageKey, sf.status, i.need_description AS needDescription
    FROM source_files sf JOIN product_solutions s ON s.id = sf.solution_id
    JOIN intake_drafts i ON i.solution_id = s.id
    WHERE sf.id = ? AND sf.solution_id = ? AND sf.user_id = ? AND sf.category = 'content'
      AND sf.status = 'uploaded' AND s.status NOT IN ('deletion_pending', 'deleted')`).get(fileId, solutionId, auth.session.userId) as { id: string; storageKey: string | null; status: string; needDescription: string } | undefined;
  if (!file) return failure("MATERIAL_NOT_FOUND", "这份材料不存在、尚未上传完成或无权移除。", 404);
  const remaining = productSqlite.prepare("SELECT COUNT(*) AS count FROM source_files WHERE solution_id = ? AND user_id = ? AND category = 'content' AND status = 'uploaded' AND id != ?").get(solutionId, auth.session.userId, fileId) as { count: number };
  if (!file.needDescription.trim() && remaining.count === 0) return failure("MATERIAL_REQUIRED", "项目至少需要保留一份已上传材料，或先补充问题描述。", 409);
  try {
    productSqlite.transaction(() => {
      productSqlite.prepare("UPDATE source_files SET status = 'removed', storage_key = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'uploaded'").run(fileId);
      invalidateForMaterialRevision(solutionId, auth.session.userId);
      recordProjectEvent({ solutionId, userId: auth.session.userId, type: "source_file_removed", summary: "移除了一份项目材料" });
    })();
    if (file.storageKey) {
      const target = safePrivatePath(auth.session.userId, solutionId, fileId);
      // The database state is authoritative. If the storage removal is delayed,
      // the existing orphan-file maintenance job safely clears the leftover.
      await fs.rm(target.absolutePath, { force: true }).catch(() => undefined);
    }
    const queue = enqueueSourceProcessing(solutionId, auth.session.userId);
    return NextResponse.json({ success: true, data: { fileId, status: "removed", queue } });
  } catch {
    return failure("MATERIAL_REMOVE_FAILED", "暂时无法移除这份材料，原有项目内容未被替换。", 500, true);
  }
}

function failure(code: string, message: string, status: number, retryable = false) {
  return NextResponse.json({ success: false, error: { code, message, retryable } }, { status });
}
