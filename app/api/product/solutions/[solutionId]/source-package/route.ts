import fs from "fs/promises";
import JSZip from "jszip";
import { NextRequest, NextResponse } from "next/server";
import { requireProductSession } from "../../../../../../lib/product/auth";
import { productSqlite } from "../../../../../../lib/product/db";
import { projectInputFingerprint } from "../../../../../../lib/product/input-fingerprint";
import { recordProjectEvent } from "../../../../../../lib/product/project-events";
import { safePrivatePath } from "../../../../../../lib/product/private-storage";

const configuredPackageBytes = Number(process.env.PRODUCT_SOURCE_PACKAGE_MAX_BYTES || 200 * 1024 * 1024);
const MAX_PACKAGE_BYTES = Number.isFinite(configuredPackageBytes) ? Math.max(10 * 1024 * 1024, configuredPackageBytes) : 200 * 1024 * 1024;

export async function GET(request: NextRequest, context: { params: Promise<{ solutionId: string }> }) {
  const auth = await requireProductSession(request);
  if ("response" in auth) return auth.response;
  const { solutionId } = await context.params;
  const solution = productSqlite.prepare(`SELECT s.title, i.purpose_primary AS purposePrimary, i.need_description AS needDescription, i.form_data AS formData
    FROM product_solutions s JOIN intake_drafts i ON i.solution_id = s.id
    WHERE s.id = ? AND s.owner_user_id = ? AND s.status NOT IN ('deletion_pending', 'deleted')`).get(solutionId, auth.session.userId) as { title: string; purposePrimary: string; needDescription: string; formData: string } | undefined;
  if (!solution) return failure("SOLUTION_NOT_FOUND", "方案不存在或无法访问。", 404);
  const files = productSqlite.prepare(`SELECT id, category, original_name AS originalName, size_bytes AS sizeBytes, detected_format AS detectedFormat, sha256
    FROM source_files WHERE solution_id = ? AND user_id = ? AND status = 'uploaded' ORDER BY created_at, id`).all(solutionId, auth.session.userId) as Array<{ id: string; category: string; originalName: string; sizeBytes: number; detectedFormat: string | null; sha256: string | null }>;
  const totalBytes = files.reduce((total, file) => total + file.sizeBytes, 0);
  if (totalBytes > MAX_PACKAGE_BYTES) return failure("SOURCE_PACKAGE_TOO_LARGE", "当前输入材料超过可下载包大小限制，请先移除不需要的材料后重试。", 413);
  try {
    const zip = new JSZip();
    const usedNamesByFolder = new Map<string, Set<string>>();
    const exportedFiles: Array<{ category: string; originalName: string; exportPath: string; sizeBytes: number; detectedFormat: string | null; sha256: string | null }> = [];
    for (const file of files) {
      const target = safePrivatePath(auth.session.userId, solutionId, file.id);
      const bytes = await fs.readFile(target.absolutePath);
      const folder = sourceFolder(file.category);
      const usedNames = usedNamesByFolder.get(folder) ?? new Set<string>();
      usedNamesByFolder.set(folder, usedNames);
      const exportPath = `${folder}/${uniqueName(file.originalName, usedNames)}`;
      zip.file(exportPath, bytes);
      exportedFiles.push({ category: file.category, originalName: file.originalName, exportPath, sizeBytes: file.sizeBytes, detectedFormat: file.detectedFormat, sha256: file.sha256 });
    }
    const userFacts = productSqlite.prepare("SELECT text, created_at AS createdAt FROM project_user_facts WHERE solution_id = ? AND user_id = ? AND status = 'active' ORDER BY created_at, id").all(solutionId, auth.session.userId);
    const inputFingerprint = projectInputFingerprint(solutionId, auth.session.userId);
    zip.file("project-input.json", JSON.stringify({
      schemaVersion: "1.1",
      exportedAt: new Date().toISOString(),
      inputFingerprint,
      project: { title: solution.title, purposePrimary: solution.purposePrimary, needDescription: solution.needDescription, formData: parseJson(solution.formData), userConfirmedFacts: userFacts },
      materials: exportedFiles,
    }, null, 2));
    zip.file("README.txt", sourcePackageReadme(solution.title, inputFingerprint, exportedFiles));
    const archive = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 6 } });
    const body = Uint8Array.from(archive).buffer;
    recordProjectEvent({ solutionId, userId: auth.session.userId, type: "source_package_downloaded", summary: "下载了项目输入包", metadata: { sourceFiles: exportedFiles.length, inputFingerprint } });
    return new NextResponse(body, { headers: { "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="${safeDownloadName(solution.title)}-project-input.zip"`, "Cache-Control": "private, no-store" } });
  } catch {
    return failure("SOURCE_PACKAGE_FAILED", "暂时无法整理项目输入材料，请稍后重试。", 500, true);
  }
}

function sourceFolder(category: string) {
  if (category === "template") return "enterprise-templates";
  if (category === "brand") return "brand-assets";
  return category === "content" ? "project-materials" : "other-inputs";
}

function sourcePackageReadme(title: string, inputFingerprint: string | null, files: Array<{ category: string; originalName: string; exportPath: string; sha256: string | null }>) {
  const lines = [
    `项目输入包：${title}`,
    `输入快照指纹（SHA-256）：${inputFingerprint || "暂未生成"}`,
    "",
    "目录说明：",
    "- project-materials/：项目需求、会议纪要及其他内容材料",
    "- enterprise-templates/：企业 Word、Excel、PPT 模板",
    "- brand-assets/：Logo 和品牌素材",
    "",
    "project-input.json 包含项目说明、用户确认事实和文件元数据。",
    "每个文件的 SHA-256 校验值可用于核对下载包中的原始输入是否一致。",
    "",
    "文件校验清单：",
  ];
  for (const file of files) lines.push(`- ${file.exportPath} | ${file.sha256 || "未记录校验值"} | 原始名称：${file.originalName}`);
  return `${lines.join("\n")}\n`;
}

function uniqueName(name: string, used: Set<string>) {
  const safe = name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").slice(0, 160) || "material";
  if (!used.has(safe)) { used.add(safe); return safe; }
  const dot = safe.lastIndexOf(".");
  const base = dot > 0 ? safe.slice(0, dot) : safe, extension = dot > 0 ? safe.slice(dot) : "";
  let index = 2, candidate = `${base}-${index}${extension}`;
  while (used.has(candidate)) candidate = `${base}-${++index}${extension}`;
  used.add(candidate);
  return candidate;
}

function safeDownloadName(title: string) { return title.replace(/[^\w.-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 80) || "project"; }
function parseJson(value: string) { try { return JSON.parse(value); } catch { return {}; } }
function failure(code: string, message: string, status: number, retryable = false) { return NextResponse.json({ success: false, error: { code, message, retryable } }, { status }); }
