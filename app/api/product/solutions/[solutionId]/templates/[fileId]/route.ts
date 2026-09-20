import fs from "fs/promises";
import { NextRequest, NextResponse } from "next/server";
import { requireProductSession } from "../../../../../../../lib/product/auth";
import { ensurePrimaryDeliverables, hasCompleteFormalDocument, invalidateDeliverablesForTemplate } from "../../../../../../../lib/product/deliverables";
import { productSqlite } from "../../../../../../../lib/product/db";
import { safePrivatePath } from "../../../../../../../lib/product/private-storage";
import { recordProjectEvent } from "../../../../../../../lib/product/project-events";

const templateFormats = new Set(["docx", "xlsx", "pptx"]);

export async function DELETE(request: NextRequest, context: { params: Promise<{ solutionId: string; fileId: string }> }) {
  const auth = await requireProductSession(request);
  if ("response" in auth) return auth.response;
  const { solutionId, fileId } = await context.params;
  const file = productSqlite.prepare(`SELECT id, storage_key AS storageKey, detected_format AS detectedFormat, status FROM source_files
    WHERE id = ? AND solution_id = ? AND user_id = ? AND category = 'template'`).get(fileId, solutionId, auth.session.userId) as { id: string; storageKey: string | null; detectedFormat: string | null; status: string } | undefined;
  if (!file) return failure("TEMPLATE_NOT_FOUND", "企业模板不存在或无法访问。", 404);
  if (file.status === "removed") return NextResponse.json({ success: true, data: { fileId, status: "removed", rerenderQueued: false } });
  if (!file.detectedFormat || !templateFormats.has(file.detectedFormat)) return failure("TEMPLATE_FORMAT_INVALID", "该模板尚未完成识别，暂时无法安全移除。", 409, true);
  const solution = productSqlite.prepare("SELECT id FROM product_solutions WHERE id = ? AND owner_user_id = ? AND status NOT IN ('deletion_pending', 'deleted')").get(solutionId, auth.session.userId);
  if (!solution) return failure("SOLUTION_NOT_FOUND", "方案不存在或无法访问。", 404);
  const target = safePrivatePath(auth.session.userId, solutionId, fileId);
  const complete = hasCompleteFormalDocument(solutionId);
  productSqlite.transaction(() => {
    productSqlite.prepare("UPDATE source_files SET status = 'removed', storage_key = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status != 'removed'").run(fileId);
    invalidateDeliverablesForTemplate(solutionId, auth.session.userId, file.detectedFormat as "docx" | "xlsx" | "pptx");
    recordProjectEvent({ solutionId, userId: auth.session.userId, type: "template_removed", summary: "移除了一份企业模板" });
  })();
  if (file.storageKey === target.relativeKey) await fs.rm(target.absolutePath, { force: true }).catch(() => undefined);
  if (complete) {
    try { await ensurePrimaryDeliverables(solutionId, auth.session.userId); } catch { /* Rendering remains safely queued for the render worker. */ }
  }
  return NextResponse.json({ success: true, data: { fileId, status: "removed", rerenderQueued: complete } });
}

function failure(code: string, message: string, status: number, retryable = false) {
  return NextResponse.json({ success: false, error: { code, message, retryable } }, { status });
}
