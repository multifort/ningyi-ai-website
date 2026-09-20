import { NextRequest, NextResponse } from "next/server";
import { createOperationsSnapshot } from "../../../../../../lib/product/operations";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const secret = process.env.PRODUCT_WORKER_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ success: false, error: { code: "UNAUTHORIZED", message: "未授权访问运行指标。", retryable: false } }, { status: 401 });
  }
  try {
    const hours = Number(request.nextUrl.searchParams.get("hours") || 24);
    return NextResponse.json({ success: true, data: createOperationsSnapshot(hours) });
  } catch {
    return NextResponse.json({ success: false, error: { code: "OPERATIONS_SNAPSHOT_FAILED", message: "运行快照生成失败。", retryable: true } }, { status: 500 });
  }
}
