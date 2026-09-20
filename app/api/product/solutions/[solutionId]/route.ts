import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireProductSession } from "../../../../../lib/product/auth";
import { verifyProductUserPassword } from "../../../../../lib/product/credentials";
import { productSqlite } from "../../../../../lib/product/db";
import { recordProjectEvent } from "../../../../../lib/product/project-events";

export async function PATCH(request: NextRequest, context: { params: Promise<{ solutionId: string }> }) {
  const auth = await requireProductSession(request);
  if ("response" in auth) return auth.response;
  const { solutionId } = await context.params;
  try {
    const body = await request.json();
    const title = typeof body?.title === "string" ? body.title.replace(/\s+/g, " ").trim() : "";
    if (title.length < 2 || title.length > 120) return NextResponse.json({ success: false, error: { code: "TITLE_INVALID", message: "项目名称需为 2–120 个字符。", retryable: false } }, { status: 422 });
    const solution = productSqlite.prepare("SELECT id, title FROM product_solutions WHERE id = ? AND owner_user_id = ? AND status NOT IN ('deletion_pending', 'deleted')").get(solutionId, auth.session.userId) as { id: string; title: string } | undefined;
    if (!solution) return NextResponse.json({ success: false, error: { code: "SOLUTION_NOT_FOUND", message: "方案不存在或无法访问。", retryable: false } }, { status: 404 });
    if (solution.title === title) return NextResponse.json({ success: true, data: { solutionId, title, rerenderQueued: false } });
    const complete = productSqlite.prepare("SELECT COUNT(*) AS count FROM formal_sections WHERE solution_id = ? AND status = 'validated' AND TRIM(COALESCE(content, '')) <> ''").get(solutionId) as { count: number };
    productSqlite.transaction(() => {
      if (complete.count === 7) {
        productSqlite.prepare("UPDATE deliverable_artifacts SET status = 'superseded', updated_at = CURRENT_TIMESTAMP WHERE solution_id = ? AND user_id = ? AND status = 'available'").run(solutionId, auth.session.userId);
        productSqlite.prepare(`UPDATE product_solutions SET title = ?, status = 'processing', stage = 'rendering', render_lease_owner = NULL,
          render_lease_until = NULL, render_attempt_count = 0, render_next_attempt_at = CURRENT_TIMESTAMP, render_error_code = NULL,
          render_failed_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND owner_user_id = ?`).run(title, solutionId, auth.session.userId);
      } else {
        productSqlite.prepare("UPDATE product_solutions SET title = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND owner_user_id = ?").run(title, solutionId, auth.session.userId);
      }
      recordProjectEvent({ solutionId, userId: auth.session.userId, type: "title_updated", summary: "修改了项目名称", metadata: { title } });
    })();
    return NextResponse.json({ success: true, data: { solutionId, title, rerenderQueued: complete.count === 7 } });
  } catch {
    return NextResponse.json({ success: false, error: { code: "TITLE_UPDATE_FAILED", message: "暂时无法更新项目名称，请稍后重试。", retryable: true } }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ solutionId: string }> }) {
  const auth = await requireProductSession(request);
  if ("response" in auth) return auth.response;
  const { solutionId } = await context.params;
  let password = "";
  try {
    const body = await request.json();
    password = typeof body?.password === "string" ? body.password : "";
  } catch {
    // A missing body is treated as an invalid confirmation rather than a server error.
  }
  if (!password || !(await verifyProductUserPassword(auth.session.userId, password))) {
    return NextResponse.json({ success: false, error: { code: "DELETE_CONFIRMATION_REQUIRED", message: "请输入当前密码确认删除。", retryable: false } }, { status: 403 });
  }
  const solution = productSqlite.prepare("SELECT id, status FROM product_solutions WHERE id = ? AND owner_user_id = ?").get(solutionId, auth.session.userId) as { id: string; status: string } | undefined;
  if (!solution) return NextResponse.json({ success: false, error: { code: "SOLUTION_NOT_FOUND", message: "成果不存在或无法访问。", retryable: false } }, { status: 404 });
  if (solution.status === "deleted" || solution.status === "deletion_pending") return NextResponse.json({ success: true, data: { solutionId, status: solution.status } }, { status: 202 });
  const counts = {
    sourceFiles: (productSqlite.prepare("SELECT COUNT(*) AS count FROM source_files WHERE solution_id = ?").get(solutionId) as any).count,
    artifacts: (productSqlite.prepare("SELECT COUNT(*) AS count FROM deliverable_artifacts WHERE solution_id = ?").get(solutionId) as any).count,
    historicalArtifacts: (productSqlite.prepare("SELECT COUNT(*) AS count FROM deliverable_artifact_versions WHERE solution_id = ?").get(solutionId) as any).count,
  };
  productSqlite.transaction(() => {
    productSqlite.prepare("UPDATE product_solutions SET status = 'deletion_pending', stage = 'deletion_pending', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(solutionId);
    productSqlite.prepare("UPDATE source_files SET status = 'deletion_pending', updated_at = CURRENT_TIMESTAMP WHERE solution_id = ?").run(solutionId);
    productSqlite.prepare("UPDATE deliverable_artifacts SET status = 'deletion_pending', updated_at = CURRENT_TIMESTAMP WHERE solution_id = ?").run(solutionId);
    productSqlite.prepare(`INSERT INTO solution_deletion_runs (id, solution_id, owner_user_id, status, manifest_json) VALUES (?, ?, ?, 'pending', ?)
      ON CONFLICT(solution_id) DO UPDATE SET status = 'pending', manifest_json = excluded.manifest_json, error_code = NULL, updated_at = CURRENT_TIMESTAMP`).run(randomUUID(), solutionId, auth.session.userId, JSON.stringify(counts));
  })();
  return NextResponse.json({ success: true, data: { solutionId, status: "deletion_pending", accessRevoked: true } }, { status: 202 });
}
