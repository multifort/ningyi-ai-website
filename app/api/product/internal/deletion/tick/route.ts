import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { processDeletionBatch } from "../../../../../../lib/product/deletion-worker";

export async function POST(request: NextRequest) {
  const configured = process.env.PRODUCT_WORKER_SECRET;
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
  if (!configured || Buffer.byteLength(configured) !== Buffer.byteLength(supplied) || !timingSafeEqual(Buffer.from(configured), Buffer.from(supplied))) return NextResponse.json({ success: false, error: { code: "WORKER_UNAUTHORIZED", message: "调度凭证无效。", retryable: false } }, { status: 401 });
  try {
    return NextResponse.json({ success: true, data: await processDeletionBatch(Number(request.nextUrl.searchParams.get("limit") || process.env.PRODUCT_DELETION_BATCH_CONCURRENCY || 2)) });
  } catch {
    return NextResponse.json({ success: false, error: { code: "DELETION_TICK_FAILED", message: "删除任务调度失败。", retryable: true } }, { status: 500 });
  }
}
