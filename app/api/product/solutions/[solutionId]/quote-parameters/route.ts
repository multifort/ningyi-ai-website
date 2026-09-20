import { NextRequest, NextResponse } from "next/server";
import { requireProductSession } from "../../../../../../lib/product/auth";
import { listQuoteParameters, updateQuoteParameters } from "../../../../../../lib/product/quote-parameters";

export async function GET(request: NextRequest, context: { params: Promise<{ solutionId: string }> }) {
  const auth = await requireProductSession(request);
  if ("response" in auth) return auth.response;
  const { solutionId } = await context.params;
  try { return NextResponse.json({ success: true, data: listQuoteParameters(solutionId, auth.session.userId) }); }
  catch (error) { return failure(error); }
}

export async function PUT(request: NextRequest, context: { params: Promise<{ solutionId: string }> }) {
  const auth = await requireProductSession(request);
  if ("response" in auth) return auth.response;
  const { solutionId } = await context.params;
  try {
    const body = await request.json();
    const data = updateQuoteParameters(solutionId, auth.session.userId, body?.changes);
    return NextResponse.json({ success: true, data });
  } catch (error) { return failure(error); }
}

function failure(error: unknown) {
  const code = error instanceof Error ? error.message : "QUOTE_PARAMETER_OPERATION_FAILED";
  const status = code === "SOLUTION_NOT_FOUND" ? 404
    : code === "FORMAL_DOCUMENT_INCOMPLETE" ? 409
      : code.startsWith("INVALID_") || code.startsWith("DUPLICATE_") || code === "QUOTE_PARAMETER_ITEM_AMBIGUOUS" ? 400 : 500;
  return NextResponse.json({ success: false, error: { code } }, { status });
}
