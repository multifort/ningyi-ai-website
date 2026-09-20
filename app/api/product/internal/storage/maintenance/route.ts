import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { maintainPrivateStorage } from "../../../../../../lib/product/storage-maintenance";

export async function POST(request: NextRequest) {
  const configured = process.env.PRODUCT_WORKER_SECRET || "", supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
  if (!configured || Buffer.byteLength(configured) !== Buffer.byteLength(supplied) || !timingSafeEqual(Buffer.from(configured), Buffer.from(supplied))) return NextResponse.json({ success: false, error: { code: "WORKER_UNAUTHORIZED", message: "调度凭证无效。", retryable: false } }, { status: 401 });
  const mode = request.nextUrl.searchParams.get("mode") === "cleanup" ? "cleanup" : "audit";
  try { return NextResponse.json({ success: true, data: await maintainPrivateStorage(mode) }); }
  catch { return NextResponse.json({ success: false, error: { code: "STORAGE_MAINTENANCE_FAILED", message: "私有存储维护失败，系统将在下一周期重试。", retryable: true } }, { status: 500 }); }
}
