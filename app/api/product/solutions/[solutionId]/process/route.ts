import { NextRequest, NextResponse } from "next/server";
import { requireProductSession } from "../../../../../../lib/product/auth";
import { productSqlite } from "../../../../../../lib/product/db";
import { enqueueSourceProcessing } from "../../../../../../lib/product/process-solution";

export async function POST(request: NextRequest, context: { params: Promise<{ solutionId: string }> }) {
  const auth = await requireProductSession(request);
  if ("response" in auth) return auth.response;
  const { solutionId } = await context.params;
  const owned = productSqlite.prepare("SELECT id FROM product_solutions WHERE id = ? AND owner_user_id = ? AND status NOT IN ('deletion_pending', 'deleted')").get(solutionId, auth.session.userId);
  if (!owned) return NextResponse.json({ success: false, error: { code: "SOLUTION_NOT_FOUND", message: "方案不存在或无法访问。", retryable: false } }, { status: 404 });
  try {
    const result = enqueueSourceProcessing(solutionId, auth.session.userId);
    return NextResponse.json({ success: true, data: result }, { status: result.status === "succeeded" ? 200 : 202 });
  } catch (error) {
    const pending = error instanceof Error && error.message === "MATERIAL_UPLOAD_PENDING";
    return NextResponse.json({ success: false, error: { code: pending ? "MATERIAL_UPLOAD_PENDING" : "SOURCE_QUEUE_FAILED", message: pending ? "项目材料仍在上传，请上传完成后再开始处理。" : "材料暂时无法进入处理队列，请稍后重试。", retryable: true } }, { status: pending ? 409 : 500 });
  }
}
