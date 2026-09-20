import fs from "fs/promises";
import { NextRequest, NextResponse } from "next/server";
import { requireProductSession } from "../../../../../../../lib/product/auth";
import { ensurePrimaryDeliverables, hasCompleteFormalDocument, invalidateDeliverablesForBrand } from "../../../../../../../lib/product/deliverables";
import { productSqlite } from "../../../../../../../lib/product/db";
import { safePrivatePath } from "../../../../../../../lib/product/private-storage";
import { recordProjectEvent } from "../../../../../../../lib/product/project-events";

export async function DELETE(request: NextRequest, context: { params: Promise<{ solutionId: string; fileId: string }> }) {
  const auth = await requireProductSession(request);
  if ("response" in auth) return auth.response;
  const { solutionId, fileId } = await context.params;
  const file = productSqlite.prepare(`SELECT id, storage_key AS storageKey, status FROM source_files
    WHERE id = ? AND solution_id = ? AND user_id = ? AND category = 'brand'`).get(fileId, solutionId, auth.session.userId) as { id: string; storageKey: string | null; status: string } | undefined;
  if (!file) return failure("BRAND_NOT_FOUND", "品牌素材不存在或无法访问。", 404);
  if (file.status === "removed") return NextResponse.json({ success: true, data: { fileId, status: "removed", rerenderQueued: false } });
  const solution = productSqlite.prepare("SELECT id FROM product_solutions WHERE id = ? AND owner_user_id = ? AND status NOT IN ('deletion_pending', 'deleted')").get(solutionId, auth.session.userId);
  if (!solution) return failure("SOLUTION_NOT_FOUND", "方案不存在或无法访问。", 404);
  const target = safePrivatePath(auth.session.userId, solutionId, fileId);
  const complete = hasCompleteFormalDocument(solutionId);
  productSqlite.transaction(() => {
    productSqlite.prepare("UPDATE source_files SET status = 'removed', storage_key = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status != 'removed'").run(fileId);
    invalidateDeliverablesForBrand(solutionId, auth.session.userId);
    recordProjectEvent({ solutionId, userId: auth.session.userId, type: "brand_removed", summary: "移除了一份品牌素材" });
  })();
  if (file.storageKey === target.relativeKey) await fs.rm(target.absolutePath, { force: true }).catch(() => undefined);
  if (complete) {
    try { await ensurePrimaryDeliverables(solutionId, auth.session.userId); } catch { /* Rendering remains safely queued for the render worker. */ }
  }
  return NextResponse.json({ success: true, data: { fileId, status: "removed", rerenderQueued: complete } });
}

function failure(code: string, message: string, status: number) {
  return NextResponse.json({ success: false, error: { code, message, retryable: false } }, { status });
}
