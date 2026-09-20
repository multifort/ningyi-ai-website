import { NextRequest, NextResponse } from "next/server";
import { requireProductSession } from "../../../../../../../../lib/product/auth";
import { productSqlite } from "../../../../../../../../lib/product/db";
import { initializeFormalDocument } from "../../../../../../../../lib/product/formal-analysis";
import { invalidateForUnderstandingRevision } from "../../../../../../../../lib/product/understanding-revision";
import { rebuildUnifiedKnowledge } from "../../../../../../../../lib/product/unified-knowledge";
import { recordProjectEvent } from "../../../../../../../../lib/product/project-events";

export async function DELETE(request: NextRequest, context: { params: Promise<{ solutionId: string; factId: string }> }) {
  const auth = await requireProductSession(request);
  if ("response" in auth) return auth.response;
  const { solutionId, factId } = await context.params;
  const fact = productSqlite.prepare(`SELECT id FROM project_user_facts WHERE id = ? AND solution_id = ? AND user_id = ? AND status = 'active'
    AND EXISTS (SELECT 1 FROM product_solutions WHERE id = ? AND owner_user_id = ? AND status NOT IN ('deletion_pending', 'deleted'))`).get(factId, solutionId, auth.session.userId, solutionId, auth.session.userId);
  if (!fact) return NextResponse.json({ success: false, error: { code: "USER_FACT_NOT_FOUND", message: "这条确认信息不存在、已撤销或无权操作。", retryable: false } }, { status: 404 });
  productSqlite.transaction(() => {
    productSqlite.prepare("UPDATE project_user_facts SET status = 'superseded', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'active'").run(factId);
    invalidateForUnderstandingRevision(solutionId, auth.session.userId);
    recordProjectEvent({ solutionId, userId: auth.session.userId, type: "user_fact_removed", summary: "撤销了一条用户确认" });
  })();
  const unified = rebuildUnifiedKnowledge(solutionId);
  const formal = initializeFormalDocument(solutionId);
  return NextResponse.json({ success: true, data: { factId, status: "superseded", knowledge: { factCount: unified.facts.length, conflictCount: unified.knowledge.stats.conflictCount }, formalStatus: formal?.status || null } });
}
