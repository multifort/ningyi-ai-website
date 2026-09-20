import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { campaignStatus, recordFaultEvidence, startAcceptanceCampaign, tickAcceptanceCampaign } from "../../../../../../lib/product/acceptance-campaign";
import { runAcceptanceFaultProbes } from "../../../../../../lib/product/acceptance-fault-probes";

function authorized(request: NextRequest) {
  const expected = Buffer.from(process.env.PRODUCT_WORKER_SECRET || "");
  const supplied = Buffer.from(request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "");
  return expected.length > 0 && expected.length === supplied.length && timingSafeEqual(expected, supplied);
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ success: false, error: { code: "WORKER_UNAUTHORIZED", message: "调度凭证无效。", retryable: false } }, { status: 401 });
  const data = campaignStatus(request.nextUrl.searchParams.get("id") || "");
  return data ? NextResponse.json({ success: true, data }) : NextResponse.json({ success: false, error: { code: "CAMPAIGN_NOT_FOUND", message: "验收活动不存在。", retryable: false } }, { status: 404 });
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ success: false, error: { code: "WORKER_UNAUTHORIZED", message: "调度凭证无效。", retryable: false } }, { status: 401 });
  try {
    const body = await request.json();
    const data = body.action === "tick" ? await tickAcceptanceCampaign(body.campaignId, body.benchmarkId, body.solutionId)
      : body.action === "record_fault" ? recordFaultEvidence(body.campaignId, body)
      : body.action === "probe_faults" ? await runAndRecordFaultProbes(body.campaignId, body.confirmation)
      : startAcceptanceCampaign(body.targetConsecutiveRuns, body.scope === "pilot" ? "pilot" : "full");
    return NextResponse.json({ success: true, data }, { status: body.action ? 200 : 201 });
  } catch (error) {
    const code = error instanceof Error ? error.message : "ACCEPTANCE_CAMPAIGN_FAILED";
    return NextResponse.json({ success: false, error: { code, message: "验收活动操作失败。", retryable: false } }, { status: 400 });
  }
}

async function runAndRecordFaultProbes(campaignId: string, confirmation: unknown) {
  if (process.env.PRODUCT_ACCEPTANCE_FAULT_PROBES !== "1" || confirmation !== "RUN_ISOLATED_FAULT_PROBES") throw new Error("FAULT_PROBE_GUARD_REQUIRED");
  const probes = await runAcceptanceFaultProbes();
  for (const probe of probes) recordFaultEvidence(campaignId, probe);
  return { campaign: campaignStatus(campaignId), probes };
}
