import { NextRequest, NextResponse } from "next/server";
import { requireProductSession } from "../../../../../../../../../lib/product/auth";
import { executeChangeImpactPlan } from "../../../../../../../../../lib/product/project-model-state";

export async function POST(request: NextRequest, context: { params: Promise<{ solutionId: string; planId: string }> }) {
  const auth = await requireProductSession(request);
  if ("response" in auth) return auth.response;
  const { solutionId, planId } = await context.params;
  try {
    const body = await request.json();
    if (typeof body?.candidateSnapshotId !== "string") {
      return NextResponse.json({ success: false, error: { code: "INVALID_CHANGE_IMPACT_EXECUTION_REQUEST" } }, { status: 400 });
    }
    const data = executeChangeImpactPlan(solutionId, auth.session.userId, planId, body.candidateSnapshotId);
    return NextResponse.json({ success: true, data }, { status: 202 });
  } catch (error) {
    const code = error instanceof Error ? error.message : "CHANGE_IMPACT_EXECUTION_FAILED";
    const status = code === "SOLUTION_NOT_FOUND" || code === "CHANGE_IMPACT_PLAN_NOT_FOUND" || code === "FORMAL_DOCUMENT_NOT_FOUND" ? 404
      : code.startsWith("CHANGE_IMPACT_") ? 409
        : code.startsWith("INVALID_") ? 400 : 500;
    return NextResponse.json({ success: false, error: { code } }, { status });
  }
}
