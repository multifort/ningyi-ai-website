import fs from "fs/promises";
import path from "path";
import JSZip from "jszip";
import { NextRequest, NextResponse } from "next/server";
import { requireProductSession } from "../../../../../../../lib/product/auth";
import { productSqlite } from "../../../../../../../lib/product/db";
import { projectInputFingerprint } from "../../../../../../../lib/product/input-fingerprint";
import { recordProjectEvent } from "../../../../../../../lib/product/project-events";
import { deliverableOutcomeCatalog, outcomeForArtifactType as findOutcomeForArtifactType, requiredDeliverableArtifactTypes } from "../../../../../../../lib/product/deliverable-catalog";
import { validatePackageContentVersion } from "../../../../../../../lib/product/deliverable-package";
import { safePrivatePath } from "../../../../../../../lib/product/private-storage";

const clientArtifactTypes = new Set<string>(requiredDeliverableArtifactTypes);

type Artifact = { id: string; artifactType: string; displayName: string; mimeType: string; storageKey: string; sizeBytes: number; sha256: string; contentFingerprint: string | null; contentVersion: number; renderVersion: number };
type SourceFile = { id: string; category: string; originalName: string; detectedFormat: string | null; storageKey: string; sizeBytes: number; sha256: string | null };
type HistoricalArtifact = Artifact & { versionId: string; artifactId: string; archivedAt: string };

export async function GET(request: NextRequest, context: { params: Promise<{ solutionId: string }> }) {
  const auth = await requireProductSession(request);
  if ("response" in auth) return auth.response;
  const { solutionId } = await context.params;
  const scope = packageScope(request.nextUrl.searchParams.get("scope"));
  if (!scope) return NextResponse.json({ success: false, error: { code: "PACKAGE_SCOPE_INVALID", message: "不支持这个成果包类型。", retryable: false } }, { status: 400 });
  const solution = productSqlite.prepare("SELECT title, stage FROM product_solutions WHERE id = ? AND owner_user_id = ? AND status NOT IN ('deletion_pending', 'deleted')").get(solutionId, auth.session.userId) as { title: string; stage: string } | undefined;
  if (!solution) return NextResponse.json({ success: false, error: { code: "SOLUTION_NOT_FOUND", message: "成果不存在或无法访问。", retryable: false } }, { status: 404 });
  const availableArtifacts = productSqlite.prepare(`SELECT id, artifact_type AS artifactType, display_name AS displayName, mime_type AS mimeType,
    storage_key AS storageKey, size_bytes AS sizeBytes, sha256, content_fingerprint AS contentFingerprint, content_version AS contentVersion, render_version AS renderVersion FROM deliverable_artifacts
    WHERE solution_id = ? AND user_id = ? AND status = 'available' ORDER BY created_at, id`).all(solutionId, auth.session.userId) as Artifact[];
  const artifacts = scope === "client" ? availableArtifacts.filter((artifact) => clientArtifactTypes.has(artifact.artifactType)) : availableArtifacts;
  if (!artifacts.length) return NextResponse.json({ success: false, error: { code: "DELIVERABLE_PACKAGE_EMPTY", message: "当前还没有可以打包的交付成果。", retryable: true } }, { status: 409 });
  const packageVersion = validatePackageContentVersion(artifacts);
  if (!packageVersion.passed) return NextResponse.json({ success: false, error: { code: "DELIVERABLE_PACKAGE_MIXED_CONTENT_VERSION", message: "当前成果仍处于不同内容版本，请等待相关成果重新生成后再打包。", retryable: true } }, { status: 409 });

  const sourceFiles = scope === "archive" ? productSqlite.prepare(`SELECT id, category, original_name AS originalName, detected_format AS detectedFormat,
    storage_key AS storageKey, size_bytes AS sizeBytes, sha256 FROM source_files
    WHERE solution_id = ? AND user_id = ? AND status = 'uploaded' ORDER BY created_at, id`).all(solutionId, auth.session.userId) as SourceFile[] : [];
  const historicalArtifacts = scope === "archive" ? productSqlite.prepare(`SELECT id AS versionId, artifact_id AS artifactId, artifact_type AS artifactType,
    display_name AS displayName, mime_type AS mimeType, storage_key AS storageKey, size_bytes AS sizeBytes, sha256, content_fingerprint AS contentFingerprint,
    content_version AS contentVersion, render_version AS renderVersion, archived_at AS archivedAt
    FROM deliverable_artifact_versions WHERE solution_id = ? AND user_id = ?
    ORDER BY artifact_type, content_version, render_version`).all(solutionId, auth.session.userId) as HistoricalArtifact[] : [];
  const packageBytes = artifacts.reduce((total, artifact) => total + artifact.sizeBytes, 0) + sourceFiles.reduce((total, file) => total + file.sizeBytes, 0) + historicalArtifacts.reduce((total, artifact) => total + artifact.sizeBytes, 0);
  const configuredMaximumBytes = Number(process.env.PRODUCT_PACKAGE_MAX_BYTES || 250 * 1024 * 1024);
  const maximumBytes = Number.isFinite(configuredMaximumBytes) ? Math.max(10 * 1024 * 1024, configuredMaximumBytes) : 250 * 1024 * 1024;
  if (packageBytes > maximumBytes) return NextResponse.json({ success: false, error: { code: "PACKAGE_SIZE_LIMIT", message: "当前归档内容超过单次打包上限，请分批下载成果和原始材料。", retryable: false } }, { status: 413 });

  const zip = new JSZip();
  const fileManifest = [];
  for (const artifact of artifacts) {
    const target = safePrivatePath(auth.session.userId, solutionId, artifact.id);
    if (target.relativeKey !== artifact.storageKey) return NextResponse.json({ success: false, error: { code: "DELIVERABLE_STORAGE_MISMATCH", message: "成果包暂时无法生成，系统会自动重试。", retryable: true } }, { status: 409 });
    const bytes = await fs.readFile(target.absolutePath);
    const actualName = safePackageFilename(artifact.displayName, artifact.id);
    zip.file(`交付成果/${actualName}`, bytes);
    fileManifest.push({ ...outcomeManifestFields(artifact.artifactType), artifactType: artifact.artifactType, filename: actualName, mimeType: artifact.mimeType, sizeBytes: artifact.sizeBytes, sha256: artifact.sha256, contentFingerprint: artifact.contentFingerprint, contentVersion: artifact.contentVersion, renderVersion: artifact.renderVersion, versionLabel: `V${artifact.contentVersion}.R${artifact.renderVersion}` });
  }
  const inputManifest = [];
  for (const file of sourceFiles) {
    const target = safePrivatePath(auth.session.userId, solutionId, file.id);
    if (target.relativeKey !== file.storageKey) return NextResponse.json({ success: false, error: { code: "SOURCE_STORAGE_MISMATCH", message: "归档包暂时无法生成，系统会自动重试。", retryable: true } }, { status: 409 });
    const bytes = await fs.readFile(target.absolutePath);
    const category = file.category === "template" ? "企业模板" : file.category === "brand" ? "品牌素材" : "项目材料";
    const actualName = safePackageFilename(file.originalName, file.id);
    zip.file(`原始材料/${category}/${actualName}`, bytes);
    inputManifest.push({ category: file.category, filename: actualName, detectedFormat: file.detectedFormat, sizeBytes: file.sizeBytes, sha256: file.sha256 });
  }
  const historyManifest = [];
  for (const artifact of historicalArtifacts) {
    const target = safePrivatePath(auth.session.userId, solutionId, artifact.artifactId);
    if (target.relativeKey !== artifact.storageKey) return NextResponse.json({ success: false, error: { code: "HISTORY_STORAGE_MISMATCH", message: "历史成果暂时无法归档，系统会自动重试。", retryable: true } }, { status: 409 });
    const bytes = await fs.readFile(target.absolutePath);
    const outcome = outcomeManifestFields(artifact.artifactType);
    const actualName = safePackageFilename(artifact.displayName, artifact.artifactId);
    const versionLabel = `V${artifact.contentVersion}.R${artifact.renderVersion}`;
    zip.file(`历史版本/${outcome.outcomeTitle || "其他成果"}/${versionLabel}/${actualName}`, bytes);
    historyManifest.push({ ...outcome, versionId: artifact.versionId, artifactType: artifact.artifactType, filename: actualName, sizeBytes: artifact.sizeBytes, sha256: artifact.sha256, contentFingerprint: artifact.contentFingerprint, contentVersion: artifact.contentVersion, renderVersion: artifact.renderVersion, versionLabel, archivedAt: artifact.archivedAt });
  }
  const outcomes = deliverableOutcomeCatalog(solutionId, auth.session.userId).map((outcome) => ({ code: outcome.code, title: outcome.title, status: outcome.status, includedFiles: outcome.files.filter((file) => scope !== "client" || clientArtifactTypes.has(file.artifactType)).map((file) => file.displayName) }));
  const currentInputFingerprint = projectInputFingerprint(solutionId, auth.session.userId);
  const manifest = { schemaVersion: "1.2", packageScope: scope, solutionId, solutionTitle: solution.title, completeness: solution.stage === "completed" ? "complete" : "progressive", generatedAt: new Date().toISOString(), currentInputFingerprint, contentVersion: packageVersion.contentVersion, modelCallsDuringPackaging: 0, outcomes, files: fileManifest, inputs: inputManifest, history: historyManifest };
  zip.file("manifest.json", JSON.stringify(manifest, null, 2));
  zip.file("交付说明.txt", `项目：${solution.title}\n成果包类型：${scopeLabel(scope)}\n成果包状态：${manifest.completeness === "complete" ? "完整" : "阶段性"}\n统一内容版本：V${manifest.contentVersion}\n当前输入快照（SHA-256）：${currentInputFingerprint || "暂未生成"}\n\n本压缩包只组装已经通过质量门且属于同一内容版本的成果。未完成成果不会以空文件或占位文件加入，生成成果包不会重新调用模型。manifest.json 中的 currentInputFingerprint 标识当前项目输入；每份成果的 contentFingerprint 标识该成果正文版本。${scope === "archive" ? "本归档包含用户上传的原始材料与模板，请按敏感数据要求保存。" : ""}\n`);
  const bytes = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 6 }, platform: "UNIX" });
  const filename = `${safePackageFilename(solution.title, solutionId)}-${scopeLabel(scope)}-${manifest.completeness === "complete" ? "完整" : "阶段"}.zip`;
  recordProjectEvent({ solutionId, userId: auth.session.userId, type: "deliverable_package_downloaded", summary: `下载了${scopeLabel(scope)}`, metadata: { scope, availableArtifacts: artifacts.length, currentInputFingerprint } });
  return new NextResponse(new Uint8Array(bytes), { headers: { "Content-Type": "application/zip", "Content-Length": String(bytes.length), "Content-Disposition": `attachment; filename="deliverables-${solutionId}.zip"; filename*=UTF-8''${encodeURIComponent(filename)}`, "Cache-Control": "private, no-store" } });
}

function packageScope(value: string | null): "client" | "internal" | "archive" | null {
  if (!value || value === "client") return "client";
  return value === "internal" || value === "archive" ? value : null;
}

function scopeLabel(scope: "client" | "internal" | "archive") {
  return scope === "client" ? "客户交付包" : scope === "internal" ? "内部评审包" : "完整归档包";
}

function outcomeManifestFields(artifactType: string) {
  const outcome = findOutcomeForArtifactType(artifactType);
  return outcome ? { outcomeCode: outcome.code, outcomeTitle: outcome.title } : { outcomeCode: null, outcomeTitle: null };
}

function safePackageFilename(value: string, fallback: string) {
  const filename = path.basename(value).replace(/[\\/:*?"<>|]/g, "-").replace(/\s+/g, " ").trim().slice(0, 120);
  return filename || `成果-${fallback}`;
}
