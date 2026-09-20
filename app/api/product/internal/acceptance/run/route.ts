import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { acceptanceRun, compareAcceptanceCandidates, listAcceptanceRuns, runUnattendedAcceptance } from "../../../../../../lib/product/acceptance";

function authorized(request: NextRequest) {
  const expected = Buffer.from(process.env.PRODUCT_WORKER_SECRET || "");
  const supplied = Buffer.from(request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "");
  return expected.length > 0 && expected.length === supplied.length && timingSafeEqual(expected, supplied);
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ success: false, error: { code: "WORKER_UNAUTHORIZED", message: "调度凭证无效。", retryable: false } }, { status: 401 });
  if (request.nextUrl.searchParams.get("view") === "comparison") {
    try {
      const limit = Number(request.nextUrl.searchParams.get("limit") || 100);
      return NextResponse.json({ success: true, data: compareAcceptanceCandidates(request.nextUrl.searchParams.get("benchmarkId") || "", Number.isFinite(limit) ? limit : 100) });
    } catch (error) {
      return NextResponse.json({ success: false, error: { code: error instanceof Error ? error.message : "ACCEPTANCE_COMPARISON_FAILED", message: "模型候选对比参数无效。", retryable: false } }, { status: 400 });
    }
  }
  const id = request.nextUrl.searchParams.get("id");
  if (id) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) return NextResponse.json({ success: false, error: { code: "ACCEPTANCE_RUN_ID_INVALID", message: "验收运行标识无效。", retryable: false } }, { status: 400 });
    const data = acceptanceRun(id);
    return data ? NextResponse.json({ success: true, data }) : NextResponse.json({ success: false, error: { code: "ACCEPTANCE_RUN_NOT_FOUND", message: "验收运行不存在。", retryable: false } }, { status: 404 });
  }
  const limit = Number(request.nextUrl.searchParams.get("limit") || 20);
  return NextResponse.json({ success: true, data: { runs: listAcceptanceRuns(Number.isFinite(limit) ? limit : 20) } });
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ success: false, error: { code: "WORKER_UNAUTHORIZED", message: "调度凭证无效。", retryable: false } }, { status: 401 });
  try {
    const body = await request.json().catch(() => ({}));
    return NextResponse.json({ success: true, data: await runUnattendedAcceptance(typeof body.solutionId === "string" ? body.solutionId : undefined) });
  } catch {
    return NextResponse.json({ success: false, error: { code: "ACCEPTANCE_RUN_FAILED", message: "无人值守验收运行失败。", retryable: true } }, { status: 500 });
  }
}
