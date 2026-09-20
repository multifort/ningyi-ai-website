import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { clearProductSessionCookie, requireProductSession } from "../../../../lib/product/auth";
import { verifyProductUserPassword } from "../../../../lib/product/credentials";
import { productSqlite } from "../../../../lib/product/db";

export async function GET(request: NextRequest) {
  const auth = await requireProductSession(request);
  if ("response" in auth) return auth.response;
  const user = productSqlite.prepare("SELECT username, created_at AS createdAt FROM product_users WHERE id = ? AND status = 'active'").get(auth.session.userId) as { username: string; createdAt: string } | undefined;
  if (!user) return NextResponse.json({ success: false, error: { code: "AUTH_REQUIRED", message: "当前登录已失效。", retryable: false } }, { status: 401 });
  const solutions = productSqlite.prepare(`SELECT s.id, s.title, s.status, s.stage, s.created_at AS createdAt, s.updated_at AS updatedAt,
      (SELECT COUNT(*) FROM source_files f WHERE f.solution_id = s.id) AS fileCount,
      (SELECT COUNT(*) FROM deliverable_artifacts a WHERE a.solution_id = s.id) AS artifactCount,
      (SELECT status FROM solution_deletion_runs d WHERE d.solution_id = s.id) AS deletionStatus
    FROM product_solutions s WHERE s.owner_user_id = ? ORDER BY s.updated_at DESC, s.created_at DESC`).all(auth.session.userId);
  const deletion = productSqlite.prepare("SELECT status, requested_at AS requestedAt, completed_at AS completedAt, error_code AS errorCode FROM account_deletion_runs WHERE owner_user_id = ?").get(auth.session.userId) || null;
  const retention = {
    sourceDays: Math.max(1, Number(process.env.PRODUCT_SOURCE_RETENTION_DAYS || 30)),
    artifactDays: Math.max(1, Number(process.env.PRODUCT_ARTIFACT_RETENTION_DAYS || 90)),
    mode: process.env.NODE_ENV === "production" ? "configured" : "test_default",
  };
  return NextResponse.json({ success: true, data: { user: { id: auth.session.userId, username: user.username, createdAt: user.createdAt }, solutions, deletion, retention } });
}

export async function DELETE(request: NextRequest) {
  const auth = await requireProductSession(request);
  if ("response" in auth) return auth.response;
  let body: { password?: unknown; confirmation?: unknown } = {};
  try { body = await request.json(); } catch { /* invalid body handled below */ }
  if (body.confirmation !== "注销账号") {
    return NextResponse.json({ success: false, error: { code: "ACCOUNT_CONFIRMATION_REQUIRED", message: "请输入“注销账号”确认操作。", retryable: false } }, { status: 422 });
  }
  if (typeof body.password !== "string" || !(await verifyProductUserPassword(auth.session.userId, body.password))) {
    return NextResponse.json({ success: false, error: { code: "DELETE_CONFIRMATION_REQUIRED", message: "请输入当前密码确认注销。", retryable: false } }, { status: 403 });
  }
  const existing = productSqlite.prepare("SELECT status FROM account_deletion_runs WHERE owner_user_id = ?").get(auth.session.userId) as { status: string } | undefined;
  if (existing?.status === "pending") {
    const response = NextResponse.json({ success: true, data: { status: "deletion_pending", accessRevoked: true } }, { status: 202 });
    clearProductSessionCookie(response);
    return response;
  }
  const solutions = productSqlite.prepare("SELECT id FROM product_solutions WHERE owner_user_id = ? AND status NOT IN ('deleted', 'deletion_pending')").all(auth.session.userId) as Array<{ id: string }>;
  productSqlite.transaction(() => {
    for (const solution of solutions) {
      const counts = {
        sourceFiles: (productSqlite.prepare("SELECT COUNT(*) AS count FROM source_files WHERE solution_id = ?").get(solution.id) as any).count,
        artifacts: (productSqlite.prepare("SELECT COUNT(*) AS count FROM deliverable_artifacts WHERE solution_id = ?").get(solution.id) as any).count,
        historicalArtifacts: (productSqlite.prepare("SELECT COUNT(*) AS count FROM deliverable_artifact_versions WHERE solution_id = ?").get(solution.id) as any).count,
      };
      productSqlite.prepare("UPDATE product_solutions SET status = 'deletion_pending', stage = 'deletion_pending', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(solution.id);
      productSqlite.prepare("UPDATE source_files SET status = 'deletion_pending', updated_at = CURRENT_TIMESTAMP WHERE solution_id = ?").run(solution.id);
      productSqlite.prepare("UPDATE deliverable_artifacts SET status = 'deletion_pending', updated_at = CURRENT_TIMESTAMP WHERE solution_id = ?").run(solution.id);
      productSqlite.prepare(`INSERT INTO solution_deletion_runs (id, solution_id, owner_user_id, status, manifest_json) VALUES (?, ?, ?, 'pending', ?)
        ON CONFLICT(solution_id) DO UPDATE SET status = 'pending', manifest_json = excluded.manifest_json, error_code = NULL, updated_at = CURRENT_TIMESTAMP`).run(randomUUID(), solution.id, auth.session.userId, JSON.stringify(counts));
    }
    productSqlite.prepare(`INSERT INTO account_deletion_runs (id, owner_user_id, status) VALUES (?, ?, 'pending')
      ON CONFLICT(owner_user_id) DO UPDATE SET status = 'pending', error_code = NULL, completed_at = NULL, updated_at = CURRENT_TIMESTAMP`).run(randomUUID(), auth.session.userId);
    productSqlite.prepare("UPDATE product_users SET status = 'deletion_pending', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'active'").run(auth.session.userId);
  })();
  const response = NextResponse.json({ success: true, data: { status: "deletion_pending", accessRevoked: true, projectsQueued: solutions.length } }, { status: 202 });
  clearProductSessionCookie(response);
  return response;
}
