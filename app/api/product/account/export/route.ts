import { NextRequest, NextResponse } from "next/server";
import { requireProductSession } from "../../../../../lib/product/auth";
import { productSqlite } from "../../../../../lib/product/db";
import { projectInputFingerprint } from "../../../../../lib/product/input-fingerprint";
import { listProjectEvents } from "../../../../../lib/product/project-events";

export async function GET(request: NextRequest) {
  const auth = await requireProductSession(request);
  if ("response" in auth) return auth.response;
  const user = productSqlite.prepare("SELECT username, created_at AS createdAt FROM product_users WHERE id = ? AND status = 'active'").get(auth.session.userId) as { username: string; createdAt: string } | undefined;
  if (!user) return failure("AUTH_REQUIRED", "当前登录已失效。", 401);
  const solutions = productSqlite.prepare(`SELECT id, title, status, stage, created_at AS createdAt, updated_at AS updatedAt
    FROM product_solutions WHERE owner_user_id = ? AND status NOT IN ('deletion_pending', 'deleted') ORDER BY created_at, id`).all(auth.session.userId) as Array<{ id: string; title: string; status: string; stage: string; createdAt: string; updatedAt: string }>;
  const files = productSqlite.prepare(`SELECT solution_id AS solutionId, category, original_name AS originalName, detected_format AS detectedFormat,
    size_bytes AS sizeBytes, sha256, status, created_at AS createdAt
    FROM source_files WHERE user_id = ? AND status != 'removed' ORDER BY solution_id, created_at, id`).all(auth.session.userId) as Array<Record<string, unknown>>;
  const facts = productSqlite.prepare(`SELECT solution_id AS solutionId, text, created_at AS createdAt
    FROM project_user_facts WHERE user_id = ? AND status = 'active' ORDER BY solution_id, created_at, id`).all(auth.session.userId) as Array<Record<string, unknown>>;
  const artifacts = productSqlite.prepare(`SELECT solution_id AS solutionId, artifact_type AS artifactType, display_name AS displayName,
    mime_type AS mimeType, size_bytes AS sizeBytes, sha256, content_version AS contentVersion, render_version AS renderVersion,
    status, published_at AS publishedAt
    FROM deliverable_artifacts WHERE user_id = ? AND status = 'available' ORDER BY solution_id, artifact_type, id`).all(auth.session.userId) as Array<Record<string, unknown>>;
  const bySolution = <T extends Record<string, unknown>>(items: T[]) => items.reduce<Record<string, T[]>>((result, item) => {
    const solutionId = String(item.solutionId || "");
    (result[solutionId] ||= []).push(item);
    return result;
  }, {});
  const filesBySolution = bySolution(files), factsBySolution = bySolution(facts), artifactsBySolution = bySolution(artifacts);
  const data = {
    schemaVersion: "1.0",
    generatedAt: new Date().toISOString(),
    exportKind: "account_data_inventory",
    note: "此清单不包含原始文件正文或成果二进制文件。请从各项目的“下载输入包”或“下载最近包”获取实际文件。",
    account: user,
    projects: solutions.map((solution) => ({
      ...solution,
      inputFingerprint: projectInputFingerprint(solution.id, auth.session.userId),
      recentActivity: listProjectEvents(solution.id, auth.session.userId),
      sourceFiles: filesBySolution[solution.id] || [],
      userConfirmedFacts: factsBySolution[solution.id] || [],
      availableDeliverables: artifactsBySolution[solution.id] || [],
    })),
  };
  const filename = `ningyi-account-data-${new Date().toISOString().slice(0, 10)}.json`;
  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}

function failure(code: string, message: string, status: number) {
  return NextResponse.json({ success: false, error: { code, message, retryable: false } }, { status });
}
