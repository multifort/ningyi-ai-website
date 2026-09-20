import { NextRequest, NextResponse } from "next/server";
import { requireProductSession } from "../../../../../../lib/product/auth";
import { productSqlite } from "../../../../../../lib/product/db";
import { formalStatus, initializeFormalDocument } from "../../../../../../lib/product/formal-analysis";
import { isOperationsControlEnabled } from "../../../../../../lib/product/operations-controls";

async function owned(request: NextRequest, solutionId: string) {
  const auth = await requireProductSession(request);
  if ("response" in auth) return auth;
  const solution = productSqlite.prepare("SELECT id FROM product_solutions WHERE id = ? AND owner_user_id = ? AND status NOT IN ('deletion_pending', 'deleted')").get(solutionId, auth.session.userId);
  if (!solution) return { response: NextResponse.json({ success: false, error: { code: "SOLUTION_NOT_FOUND", message: "方案不存在或无法访问。", retryable: false } }, { status: 404 }) };
  return auth;
}

export async function GET(request: NextRequest, context: { params: Promise<{ solutionId: string }> }) {
  const { solutionId } = await context.params;
  const auth = await owned(request, solutionId);
  if ("response" in auth) return auth.response;
  return NextResponse.json({ success: true, data: formalStatus(solutionId) || initializeFormalDocument(solutionId) });
}

export async function POST(request: NextRequest, context: { params: Promise<{ solutionId: string }> }) {
  const { solutionId } = await context.params;
  const auth = await owned(request, solutionId);
  if ("response" in auth) return auth.response;
  const state = initializeFormalDocument(solutionId);
  if (isOperationsControlEnabled("defer_new_formal") && state?.status === "pending") {
    productSqlite.prepare("UPDATE formal_documents SET status = 'deferred_operations', updated_at = CURRENT_TIMESTAMP WHERE solution_id = ? AND status = 'pending'").run(solutionId);
    return NextResponse.json({ success: true, data: { ...state, status: "deferred_operations", queued: true, deferred: true, reason: "SYSTEM_CAPACITY_PROTECTION" } }, { status: 202 });
  }
  return NextResponse.json({ success: true, data: { ...state, queued: state?.configured === true } }, { status: 202 });
}
