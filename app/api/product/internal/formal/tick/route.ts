import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { processFormalBatch } from "../../../../../../lib/product/formal-worker";

export async function POST(request: NextRequest) {
  const configured = process.env.PRODUCT_WORKER_SECRET;
  if (!configured) return NextResponse.json({ success: false, error: { code: "WORKER_NOT_CONFIGURED", message: "正式分析调度器尚未配置。", retryable: false } }, { status: 503 });
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
  const expectedBytes = Buffer.from(configured);
  const suppliedBytes = Buffer.from(supplied);
  if (expectedBytes.length !== suppliedBytes.length || !timingSafeEqual(expectedBytes, suppliedBytes)) return NextResponse.json({ success: false, error: { code: "WORKER_UNAUTHORIZED", message: "调度凭证无效。", retryable: false } }, { status: 401 });
  return NextResponse.json({ success: true, data: await processFormalBatch(Number(request.nextUrl.searchParams.get("limit") || 1)) });
}
