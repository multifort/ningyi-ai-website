import { NextRequest, NextResponse } from "next/server";
import { requireProductSession } from "../../../../../../../lib/product/auth";
import { previewProjectModelImpact } from "../../../../../../../lib/product/project-model-state";

export async function POST(request: NextRequest, context: { params: Promise<{ solutionId: string }> }) {
  const auth = await requireProductSession(request);
  if ("response" in auth) return auth.response;
  const { solutionId } = await context.params;
  try {
    const body = await request.json();
    return NextResponse.json({ success: true, data: previewProjectModelImpact(solutionId, auth.session.userId, body) });
  } catch (error) {
    const code = error instanceof Error ? error.message : "CHANGE_IMPACT_PREVIEW_FAILED";
    const status = code === "SOLUTION_NOT_FOUND" || code === "ACTIVE_PROJECT_MODEL_REQUIRED" ? 404
      : code.startsWith("INVALID_") || code.startsWith("UNKNOWN_") || code === "PROJECT_RESTRUCTURE_TARGET_MUST_BE_PROJECT_MODEL" ? 400
        : code.startsWith("CHANGE_") ? 400 : 500;
    return NextResponse.json({ success: false, error: { code } }, { status });
  }
}
