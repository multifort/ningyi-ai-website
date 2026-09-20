import { NextRequest, NextResponse } from "next/server";
import { requireProductSession } from "../../../../../../lib/product/auth";
import { createProjectModelCandidate, getProjectModelState } from "../../../../../../lib/product/project-model-state";

export async function GET(request: NextRequest, context: { params: Promise<{ solutionId: string }> }) {
  const auth = await requireProductSession(request);
  if ("response" in auth) return auth.response;
  const { solutionId } = await context.params;
  try {
    return NextResponse.json({ success: true, data: getProjectModelState(solutionId, auth.session.userId) });
  } catch (error) {
    return projectModelError(error);
  }
}

export async function POST(request: NextRequest, context: { params: Promise<{ solutionId: string }> }) {
  const auth = await requireProductSession(request);
  if ("response" in auth) return auth.response;
  const { solutionId } = await context.params;
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > 2_000_000) return NextResponse.json({ success: false, error: { code: "PROJECT_MODEL_TOO_LARGE" } }, { status: 413 });
  try {
    const body = await request.json();
    const result = createProjectModelCandidate(solutionId, auth.session.userId, body?.model);
    return NextResponse.json({ success: true, data: result }, { status: result.idempotent ? 200 : 201 });
  } catch (error) {
    return projectModelError(error);
  }
}

function projectModelError(error: unknown) {
  const code = error instanceof Error ? error.message : "PROJECT_MODEL_FAILED";
  const status = code === "SOLUTION_NOT_FOUND" ? 404
    : code.startsWith("INVALID_") ? 400
      : code === "PROJECT_MODEL_SNAPSHOT_EXISTS" || code === "PROJECT_MODEL_SNAPSHOT_NOT_ACTIVATABLE" ? 409 : 500;
  return NextResponse.json({ success: false, error: { code } }, { status });
}
