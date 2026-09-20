import fs from "fs/promises";
import { NextRequest, NextResponse } from "next/server";
import { requireProductSession } from "../../../../../../../../lib/product/auth";
import { productSqlite } from "../../../../../../../../lib/product/db";
import { safePrivatePath } from "../../../../../../../../lib/product/private-storage";
import { issueDownloadToken, verifyDownloadToken } from "../../../../../../../../lib/product/download-tokens";

export async function POST(request: NextRequest, context: { params: Promise<{ solutionId: string; artifactId: string }> }) {
  const auth = await requireProductSession(request);
  if ("response" in auth) return auth.response;
  const { solutionId, artifactId } = await context.params;
  const artifact = findArtifact(artifactId, solutionId, auth.session.userId);
  if (!artifact) return notFound();
  const issued = issueDownloadToken({ userId: auth.session.userId, solutionId, artifactId });
  const url = new URL(request.url);
  url.search = "";
  url.searchParams.set("token", issued.token);
  return NextResponse.json({ success: true, data: { url: `${url.pathname}${url.search}`, expiresAt: issued.expiresAt, ttlSeconds: issued.ttlSeconds } }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function GET(request: NextRequest, context: { params: Promise<{ solutionId: string; artifactId: string }> }) {
  const auth = await requireProductSession(request);
  if ("response" in auth) return auth.response;
  const { solutionId, artifactId } = await context.params;
  const token = request.nextUrl.searchParams.get("token") || "";
  if (!verifyDownloadToken(token, { userId: auth.session.userId, solutionId, artifactId })) return NextResponse.json({ success: false, error: { code: "DOWNLOAD_TOKEN_INVALID", message: "下载链接无效或已过期，请重新获取。", retryable: false } }, { status: 403 });
  const artifact = findArtifact(artifactId, solutionId, auth.session.userId);
  if (!artifact) return notFound();
  const target = safePrivatePath(auth.session.userId, solutionId, artifactId);
  if (target.relativeKey !== artifact.storageKey) return NextResponse.json({ success: false, error: { code: "DELIVERABLE_STORAGE_MISMATCH", message: "交付成果暂时无法读取。", retryable: true } }, { status: 409 });
  const bytes = await fs.readFile(target.absolutePath);
  const extension = artifact.displayName.match(/\.[a-z0-9]+$/i)?.[0] || extensionForMimeType(artifact.mimeType);
  const asciiName = `deliverable-${artifactId}${extension}`;
  return new NextResponse(bytes, { headers: { "Content-Type": artifact.mimeType, "Content-Length": String(bytes.length), "Content-Disposition": `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(artifact.displayName)}`, "Cache-Control": "private, no-store" } });
}

function findArtifact(artifactId: string, solutionId: string, userId: string) {
  return productSqlite.prepare(`SELECT display_name AS displayName, mime_type AS mimeType, storage_key AS storageKey
    FROM deliverable_artifacts WHERE id = ? AND solution_id = ? AND user_id = ? AND status = 'available'`).get(artifactId, solutionId, userId) as { displayName: string; mimeType: string; storageKey: string } | undefined;
}

function notFound() {
  return NextResponse.json({ success: false, error: { code: "DELIVERABLE_NOT_FOUND", message: "交付成果不存在或无法访问。", retryable: false } }, { status: 404 });
}

function extensionForMimeType(mimeType: string) {
  if (mimeType.includes("spreadsheet")) return ".xlsx";
  if (mimeType.includes("presentation")) return ".pptx";
  if (mimeType === "application/pdf") return ".pdf";
  return ".docx";
}
