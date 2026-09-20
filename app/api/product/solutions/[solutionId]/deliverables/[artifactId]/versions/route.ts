import { NextRequest, NextResponse } from "next/server";
import { requireProductSession } from "../../../../../../../../lib/product/auth";
import { productSqlite } from "../../../../../../../../lib/product/db";

export async function GET(request: NextRequest, context: { params: Promise<{ solutionId: string; artifactId: string }> }) {
  const auth = await requireProductSession(request);
  if ("response" in auth) return auth.response;
  const { solutionId, artifactId } = await context.params;
  const current = productSqlite.prepare(`SELECT id, artifact_type AS artifactType, display_name AS displayName, mime_type AS mimeType,
    size_bytes AS sizeBytes, sha256, content_version AS contentVersion, render_version AS renderVersion, published_at AS publishedAt
    FROM deliverable_artifacts WHERE id = ? AND solution_id = ? AND user_id = ? AND status = 'available'`).get(artifactId, solutionId, auth.session.userId) as any;
  if (!current) return NextResponse.json({ success: false, error: { code: "DELIVERABLE_NOT_FOUND", message: "交付成果不存在或无法访问。", retryable: false } }, { status: 404 });
  const history = productSqlite.prepare(`SELECT id AS versionId, display_name AS displayName, mime_type AS mimeType, size_bytes AS sizeBytes,
    sha256, content_version AS contentVersion, render_version AS renderVersion, archived_at AS archivedAt
    FROM deliverable_artifact_versions WHERE solution_id = ? AND user_id = ? AND artifact_type = ?
    ORDER BY content_version DESC, render_version DESC, archived_at DESC`).all(solutionId, auth.session.userId, current.artifactType);
  return NextResponse.json({ success: true, data: { current, history } });
}
