import { NextRequest, NextResponse } from "next/server";
import { requireProductSession } from "../../../../../../lib/product/auth";
import { productSqlite } from "../../../../../../lib/product/db";
import { ensurePrimaryDeliverables, listDeliverables } from "../../../../../../lib/product/deliverables";
import { deliverableOutcomeCatalog } from "../../../../../../lib/product/deliverable-catalog";

async function owned(request: NextRequest, solutionId: string) {
  const auth = await requireProductSession(request);
  if (!("session" in auth)) return { response: auth.response };
  const solution = productSqlite.prepare("SELECT stage FROM product_solutions WHERE id = ? AND owner_user_id = ? AND status NOT IN ('deletion_pending', 'deleted')").get(solutionId, auth.session.userId) as { stage: string } | undefined;
  if (!solution) return { response: NextResponse.json({ success: false, error: { code: "SOLUTION_NOT_FOUND", message: "成果不存在或无法访问。", retryable: false } }, { status: 404 }) };
  return { session: auth.session, solution };
}

export async function GET(request: NextRequest, context: { params: Promise<{ solutionId: string }> }) {
  const { solutionId } = await context.params;
  const auth = await owned(request, solutionId);
  if (!("session" in auth)) return auth.response;
  return NextResponse.json({ success: true, data: { outcomes: deliverableOutcomeCatalog(solutionId, auth.session.userId), deliverables: listDeliverables(solutionId, auth.session.userId) } });
}

export async function POST(request: NextRequest, context: { params: Promise<{ solutionId: string }> }) {
  const { solutionId } = await context.params;
  const auth = await owned(request, solutionId);
  if (!("session" in auth)) return auth.response;
  if (!['rendering', 'completed'].includes(auth.solution.stage)) return NextResponse.json({ success: false, error: { code: "FORMAL_DOCUMENT_INCOMPLETE", message: "正式内容尚未完成。", retryable: true } }, { status: 409 });
  const deliverables = await ensurePrimaryDeliverables(solutionId, auth.session.userId);
  return NextResponse.json({ success: true, data: { outcomes: deliverableOutcomeCatalog(solutionId, auth.session.userId), deliverables } });
}
