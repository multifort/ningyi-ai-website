import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { activateConfigurationRelease, createConfigurationCandidate, listConfigurationReleases, rollbackConfigurationRelease } from "../../../../../../lib/product/configuration-releases";

function authorized(request: NextRequest) {
  const expected = Buffer.from(process.env.PRODUCT_WORKER_SECRET || "");
  const supplied = Buffer.from(request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "");
  return expected.length > 0 && expected.length === supplied.length && timingSafeEqual(expected, supplied);
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ success: false, error: { code: "WORKER_UNAUTHORIZED", message: "调度凭证无效。", retryable: false } }, { status: 401 });
  return NextResponse.json({ success: true, data: listConfigurationReleases() });
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ success: false, error: { code: "WORKER_UNAUTHORIZED", message: "调度凭证无效。", retryable: false } }, { status: 401 });
  try {
    const body = await request.json();
    const data = body.action === "activate" ? activateConfigurationRelease(body.id, body.rolloutPercent || 5)
      : body.action === "rollback" ? rollbackConfigurationRelease(body.id)
      : createConfigurationCandidate(body);
    return NextResponse.json({ success: true, data }, { status: body.action ? 200 : 201 });
  } catch (error) {
    const code = error instanceof Error ? error.message : "CONFIGURATION_RELEASE_FAILED";
    const conflict = ["BENCHMARK_GATE_FAILED", "ROLLOUT_HELD_BY_OPERATIONS", "RELEASE_NOT_ACTIVATABLE", "RELEASE_NOT_ACTIVE"].includes(code);
    return NextResponse.json({ success: false, error: { code, message: "配置发布未通过安全门。", retryable: conflict } }, { status: conflict ? 409 : 400 });
  }
}
