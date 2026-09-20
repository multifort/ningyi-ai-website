import { NextRequest, NextResponse } from "next/server";
import { requireProductSession } from "../../../../../../../../../lib/product/auth";
import { createProjectModelEntityRevision } from "../../../../../../../../../lib/product/project-model-state";

export async function POST(request: NextRequest, context: { params: Promise<{ solutionId: string; entityKey: string }> }) {
  const auth = await requireProductSession(request);
  if ("response" in auth) return auth.response;
  const { solutionId, entityKey } = await context.params;
  try {
    const body = await request.json();
    if (typeof body?.baseSnapshotId !== "string") return NextResponse.json({ success: false, error: { code: "INVALID_PROJECT_MODEL_REVISION" } }, { status: 400 });
    const data = createProjectModelEntityRevision(solutionId, auth.session.userId, body.baseSnapshotId, entityKey, body.patch);
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    const code = error instanceof Error ? error.message : "PROJECT_MODEL_REVISION_FAILED";
    const status = code === "SOLUTION_NOT_FOUND" || code === "PROJECT_MODEL_ENTITY_NOT_FOUND" ? 404
      : code === "PROJECT_MODEL_BASE_NOT_ACTIVE" || code === "PROJECT_MODEL_ENTITY_LOCKED" ? 409
        : code.startsWith("INVALID_") ? 400 : 500;
    return NextResponse.json({ success: false, error: { code } }, { status });
  }
}
