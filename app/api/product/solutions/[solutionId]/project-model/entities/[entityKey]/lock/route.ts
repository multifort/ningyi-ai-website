import { NextRequest, NextResponse } from "next/server";
import { requireProductSession } from "../../../../../../../../../lib/product/auth";
import { setProjectModelEntityLock } from "../../../../../../../../../lib/product/project-model-state";

export async function PATCH(request: NextRequest, context: { params: Promise<{ solutionId: string; entityKey: string }> }) {
  const auth = await requireProductSession(request);
  if ("response" in auth) return auth.response;
  const { solutionId, entityKey } = await context.params;
  try {
    const body = await request.json();
    if (typeof body?.locked !== "boolean" || (body.reason != null && typeof body.reason !== "string")) {
      return NextResponse.json({ success: false, error: { code: "INVALID_LOCK_REQUEST" } }, { status: 400 });
    }
    const data = setProjectModelEntityLock(solutionId, auth.session.userId, entityKey, body.locked, body.reason);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    const code = error instanceof Error ? error.message : "PROJECT_MODEL_LOCK_FAILED";
    const status = code === "SOLUTION_NOT_FOUND" || code === "PROJECT_MODEL_ENTITY_NOT_FOUND" ? 404
      : code.startsWith("INVALID_") || code === "MODEL_LOCK_CANNOT_BE_REMOVED" ? 400 : 500;
    return NextResponse.json({ success: false, error: { code } }, { status });
  }
}
