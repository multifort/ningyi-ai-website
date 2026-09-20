import { NextRequest, NextResponse } from "next/server";
import { requireProductSession } from "../../../../../../../../lib/product/auth";
import { activateProjectModelSnapshot } from "../../../../../../../../lib/product/project-model-state";

export async function POST(request: NextRequest, context: { params: Promise<{ solutionId: string; snapshotId: string }> }) {
  const auth = await requireProductSession(request);
  if ("response" in auth) return auth.response;
  const { solutionId, snapshotId } = await context.params;
  try {
    return NextResponse.json({ success: true, data: activateProjectModelSnapshot(solutionId, auth.session.userId, snapshotId) });
  } catch (error) {
    const code = error instanceof Error ? error.message : "PROJECT_MODEL_ACTIVATION_FAILED";
    const status = code === "SOLUTION_NOT_FOUND" ? 404 : code.startsWith("PROJECT_MODEL_") ? 409 : 500;
    return NextResponse.json({ success: false, error: { code } }, { status });
  }
}
