import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { processMediaBatch } from "../../../../../../lib/product/media-analysis";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const configured = process.env.PRODUCT_WORKER_SECRET || "";
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
  const expectedBytes = Buffer.from(configured), suppliedBytes = Buffer.from(supplied);
  if (!configured || expectedBytes.length !== suppliedBytes.length || !timingSafeEqual(expectedBytes, suppliedBytes)) return NextResponse.json({ success: false, error: { code: "WORKER_UNAUTHORIZED", message: "调度凭证无效。", retryable: false } }, { status: 401 });
  try { return NextResponse.json({ success: true, data: await processMediaBatch(Number(request.nextUrl.searchParams.get("limit") || 1)) }); }
  catch { return NextResponse.json({ success: false, error: { code: "MEDIA_TICK_FAILED", message: "媒体分析调度失败。", retryable: true } }, { status: 500 }); }
}
