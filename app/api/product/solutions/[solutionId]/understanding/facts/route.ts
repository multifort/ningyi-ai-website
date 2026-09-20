import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireProductSession } from "../../../../../../../lib/product/auth";
import { productSqlite } from "../../../../../../../lib/product/db";
import { initializeFormalDocument } from "../../../../../../../lib/product/formal-analysis";
import { invalidateForUnderstandingRevision } from "../../../../../../../lib/product/understanding-revision";
import { rebuildUnifiedKnowledge } from "../../../../../../../lib/product/unified-knowledge";
import { recordProjectEvent } from "../../../../../../../lib/product/project-events";

export async function POST(request: NextRequest, context: { params: Promise<{ solutionId: string }> }) {
  const auth = await requireProductSession(request);
  if ("response" in auth) return auth.response;
  const { solutionId } = await context.params;
  try {
    const body = await request.json();
    const text = typeof body?.text === "string" ? body.text.replace(/\s+/g, " ").trim() : "";
    if (text.length < 6 || text.length > 2000) return failure("USER_FACT_INVALID", "请用 6–2000 个字符说明需要补充或纠正的信息。", 422);
    const solution = productSqlite.prepare("SELECT id FROM product_solutions WHERE id = ? AND owner_user_id = ? AND status NOT IN ('deletion_pending', 'deleted')").get(solutionId, auth.session.userId);
    if (!solution) return failure("SOLUTION_NOT_FOUND", "方案不存在或无法访问。", 404);
    const fact = { id: randomUUID(), text };
    productSqlite.transaction(() => {
      productSqlite.prepare("INSERT INTO project_user_facts (id, solution_id, user_id, text) VALUES (?, ?, ?, ?)").run(fact.id, solutionId, auth.session.userId, fact.text);
      invalidateForUnderstandingRevision(solutionId, auth.session.userId);
      recordProjectEvent({ solutionId, userId: auth.session.userId, type: "user_fact_added", summary: "新增了一条用户确认", metadata: { length: text.length } });
    })();
    const unified = rebuildUnifiedKnowledge(solutionId);
    const formal = initializeFormalDocument(solutionId);
    return NextResponse.json({ success: true, data: { fact: { ...fact, status: "active", source: "user_confirmed" }, knowledge: { factCount: unified.facts.length, conflictCount: unified.knowledge.stats.conflictCount }, formalStatus: formal?.status || null } }, { status: 201 });
  } catch {
    return failure("USER_FACT_SAVE_FAILED", "暂时无法保存这条项目修正，请稍后重试。", 500, true);
  }
}

function failure(code: string, message: string, status: number, retryable = false) {
  return NextResponse.json({ success: false, error: { code, message, retryable } }, { status });
}
