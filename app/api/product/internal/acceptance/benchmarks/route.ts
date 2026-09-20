import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { benchmarkReadiness, registerBenchmarkBinding } from "../../../../../../lib/product/benchmark-bindings";

function authorized(request: NextRequest) {
  const expected = Buffer.from(process.env.PRODUCT_WORKER_SECRET || "");
  const supplied = Buffer.from(request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "");
  return expected.length > 0 && expected.length === supplied.length && timingSafeEqual(expected, supplied);
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ success: false, error: { code: "WORKER_UNAUTHORIZED", message: "调度凭证无效。", retryable: false } }, { status: 401 });
  return NextResponse.json({ success: true, data: benchmarkReadiness() });
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ success: false, error: { code: "WORKER_UNAUTHORIZED", message: "调度凭证无效。", retryable: false } }, { status: 401 });
  try {
    return NextResponse.json({ success: true, data: registerBenchmarkBinding(await request.json()) }, { status: 201 });
  } catch (error) {
    const code = error instanceof Error ? error.message : "BENCHMARK_BINDING_FAILED";
    return NextResponse.json({ success: false, error: { code, message: "基准项目绑定失败。", retryable: false } }, { status: 400 });
  }
}
