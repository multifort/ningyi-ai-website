import { NextRequest, NextResponse } from "next/server";
import { requireProductSession } from "../../../../../../../lib/product/auth";
import { generateProjectModelRevisionDraft } from "../../../../../../../lib/product/project-model-draft";

export async function POST(request: NextRequest, context: { params: Promise<{ solutionId: string }> }) {
  const auth = await requireProductSession(request);
  if ("response" in auth) return auth.response;
  const { solutionId } = await context.params;
  try {
    const data = await generateProjectModelRevisionDraft(solutionId, auth.session.userId);
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    const code = error instanceof Error ? error.message : "PROJECT_MODEL_REVISION_DRAFT_FAILED";
    const status = code === "SOLUTION_NOT_FOUND" ? 404
      : ["PROJECT_MODEL_KNOWLEDGE_NOT_READY", "PROJECT_MODEL_OUTSIDE_EXECUTION_WINDOW", "PROJECT_MODEL_DEFERRED_OPERATIONS"].includes(code) ? 409
        : code === "PROJECT_MODEL_PROVIDER_NOT_CONFIGURED" ? 503
          : code === "PROJECT_MODEL_NO_SOURCE_FACTS" || code === "PROJECT_MODEL_PRIMARY_PURPOSE_REQUIRED" ? 422 : 502;
    return NextResponse.json({ success: false, error: { code, retryable: [429, 502, 503].includes(status) } }, { status });
  }
}
