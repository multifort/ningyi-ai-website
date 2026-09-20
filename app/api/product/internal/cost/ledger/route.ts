import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getCostLedger, recordBillingCalibration } from "../../../../../../lib/product/cost-ledger";

function authorized(request: NextRequest) {
  const expected = Buffer.from(process.env.PRODUCT_WORKER_SECRET || "");
  const supplied = Buffer.from(request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "");
  return expected.length > 0 && expected.length === supplied.length && timingSafeEqual(expected, supplied);
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ success: false, error: { code: "WORKER_UNAUTHORIZED", message: "调度凭证无效。", retryable: false } }, { status: 401 });
  try {
    return NextResponse.json({ success: true, data: getCostLedger(request.nextUrl.searchParams.get("from") || undefined, request.nextUrl.searchParams.get("to") || undefined) });
  } catch (error) {
    return NextResponse.json({ success: false, error: { code: error instanceof Error ? error.message : "COST_LEDGER_FAILED", message: "成本台账生成失败。", retryable: false } }, { status: 400 });
  }
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ success: false, error: { code: "WORKER_UNAUTHORIZED", message: "调度凭证无效。", retryable: false } }, { status: 401 });
  try {
    return NextResponse.json({ success: true, data: recordBillingCalibration(await request.json()) }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ success: false, error: { code: error instanceof Error ? error.message : "BILLING_CALIBRATION_FAILED", message: "供应商账单校准失败。", retryable: false } }, { status: 400 });
  }
}
