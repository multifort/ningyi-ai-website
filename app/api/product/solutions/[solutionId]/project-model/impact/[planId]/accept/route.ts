import { NextRequest, NextResponse } from "next/server";
import { requireProductSession } from "../../../../../../../../../lib/product/auth";
import { acceptChangeImpactPlan } from "../../../../../../../../../lib/product/project-model-state";

export async function POST(request: NextRequest, context: { params: Promise<{ solutionId: string; planId: string }> }) {
  const auth = await requireProductSession(request);
  if ("response" in auth) return auth.response;
  const { solutionId, planId } = await context.params;
  try {
    return NextResponse.json({ success: true, data: acceptChangeImpactPlan(solutionId, auth.session.userId, planId) });
  } catch (error) {
    const code = error instanceof Error ? error.message : "CHANGE_IMPACT_PLAN_ACCEPT_FAILED";
    const status = code === "SOLUTION_NOT_FOUND" || code === "CHANGE_IMPACT_PLAN_NOT_FOUND" ? 404
      : code.startsWith("CHANGE_IMPACT_PLAN_") ? 409 : 500;
    return NextResponse.json({ success: false, error: { code } }, { status });
  }
}
