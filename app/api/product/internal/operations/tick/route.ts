import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { createOperationsSnapshot } from "../../../../../../lib/product/operations";
import { applyOperationsControls } from "../../../../../../lib/product/operations-controls";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const configured = process.env.PRODUCT_WORKER_SECRET || "";
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
  const expectedBytes = Buffer.from(configured);
  const suppliedBytes = Buffer.from(supplied);
  if (!configured || expectedBytes.length !== suppliedBytes.length || !timingSafeEqual(expectedBytes, suppliedBytes)) {
    return NextResponse.json({ success: false, error: { code: "WORKER_UNAUTHORIZED", message: "调度凭证无效。", retryable: false } }, { status: 401 });
  }
  try {
    const snapshot = createOperationsSnapshot(Number(request.nextUrl.searchParams.get("hours") || 24));
    const controls = applyOperationsControls(snapshot.snapshotId, snapshot.alerts);
    return NextResponse.json({ success: true, data: { snapshot, controls } });
  } catch {
    return NextResponse.json({ success: false, error: { code: "OPERATIONS_TICK_FAILED", message: "自动运行控制更新失败。", retryable: true } }, { status: 500 });
  }
}
