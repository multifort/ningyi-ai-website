import fs from "fs/promises";
import { NextRequest, NextResponse } from "next/server";
import { requireProductSession } from "../../../../../../../../../../lib/product/auth";
import { productSqlite } from "../../../../../../../../../../lib/product/db";
import { safePrivatePath } from "../../../../../../../../../../lib/product/private-storage";
import { issueDownloadToken, verifyDownloadToken } from "../../../../../../../../../../lib/product/download-tokens";

export async function POST(request: NextRequest, context: { params: Promise<{ solutionId: string; artifactId: string; versionId: string }> }) {
  const auth = await requireProductSession(request);
  if ("response" in auth) return auth.response;
  const { solutionId, artifactId, versionId } = await context.params;
  const version = findVersion(versionId, artifactId, solutionId, auth.session.userId);
  if (!version) return versionNotFound();
  const issued = issueDownloadToken({ userId: auth.session.userId, solutionId, artifactId, versionId });
  const url = new URL(request.url);
  url.search = "";
  url.searchParams.set("token", issued.token);
  return NextResponse.json({ success: true, data: { url: `${url.pathname}${url.search}`, expiresAt: issued.expiresAt, ttlSeconds: issued.ttlSeconds } }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function GET(request: NextRequest, context: { params: Promise<{ solutionId: string; artifactId: string; versionId: string }> }) {
  const auth = await requireProductSession(request);
  if ("response" in auth) return auth.response;
  const { solutionId, artifactId, versionId } = await context.params;
  const token = request.nextUrl.searchParams.get("token") || "";
  if (!verifyDownloadToken(token, { userId: auth.session.userId, solutionId, artifactId, versionId })) return NextResponse.json({ success: false, error: { code: "DOWNLOAD_TOKEN_INVALID", message: "下载链接无效或已过期，请重新获取。", retryable: false } }, { status: 403 });
  const version = findVersion(versionId, artifactId, solutionId, auth.session.userId);
  if (!version) return versionNotFound();
  const target = safePrivatePath(auth.session.userId, solutionId, version.artifactId);
  if (target.relativeKey !== version.storageKey) return NextResponse.json({ success: false, error: { code: "DELIVERABLE_STORAGE_MISMATCH", message: "历史版本暂时无法读取。", retryable: true } }, { status: 409 });
  const bytes = await fs.readFile(target.absolutePath);
  const extension = version.displayName.match(/\.[a-z0-9]+$/i)?.[0] || extensionForMimeType(version.mimeType);
  const asciiName = `deliverable-version-${versionId}${extension}`;
  return new NextResponse(new Uint8Array(bytes), { headers: { "Content-Type": version.mimeType, "Content-Length": String(bytes.length), "Content-Disposition": `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(version.displayName)}`, "Cache-Control": "private, no-store" } });
}

function findVersion(versionId: string, artifactId: string, solutionId: string, userId: string) {
  const current = productSqlite.prepare("SELECT artifact_type AS artifactType FROM deliverable_artifacts WHERE id = ? AND solution_id = ? AND user_id = ? AND status = 'available'").get(artifactId, solutionId, userId) as { artifactType: string } | undefined;
  if (!current) return undefined;
  return productSqlite.prepare(`SELECT artifact_id AS artifactId, display_name AS displayName, mime_type AS mimeType, storage_key AS storageKey
    FROM deliverable_artifact_versions WHERE id = ? AND solution_id = ? AND user_id = ? AND artifact_type = ?`).get(versionId, solutionId, userId, current.artifactType) as { artifactId: string; displayName: string; mimeType: string; storageKey: string } | undefined;
}

function versionNotFound() {
  return NextResponse.json({ success: false, error: { code: "DELIVERABLE_VERSION_NOT_FOUND", message: "历史版本不存在或无法访问。", retryable: false } }, { status: 404 });
}

function extensionForMimeType(mimeType: string) {
  if (mimeType.includes("spreadsheet")) return ".xlsx";
  if (mimeType.includes("presentation")) return ".pptx";
  if (mimeType === "application/pdf") return ".pdf";
  return ".docx";
}
