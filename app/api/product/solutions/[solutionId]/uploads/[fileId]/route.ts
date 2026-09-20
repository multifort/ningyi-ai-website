import { NextRequest, NextResponse } from "next/server";
import { requireProductSession } from "../../../../../../../lib/product/auth";
import { productSqlite } from "../../../../../../../lib/product/db";
import { detectFormat, extensionMatches, PRODUCT_UPLOAD_MAX_BYTES, writePrivateFile } from "../../../../../../../lib/product/private-storage";
import { profileTemplateFile } from "../../../../../../../lib/product/template-profile";
import { profileBrandFile } from "../../../../../../../lib/product/brand-profile";
import { ensurePrimaryDeliverables, hasCompleteFormalDocument, invalidateDeliverablesForBrand, invalidateDeliverablesForTemplate } from "../../../../../../../lib/product/deliverables";
import { invalidateForMaterialRevision } from "../../../../../../../lib/product/material-revision";
import { recordProjectEvent } from "../../../../../../../lib/product/project-events";

export async function POST(request: NextRequest, context: { params: Promise<{ solutionId: string; fileId: string }> }) {
  const auth = await requireProductSession(request);
  if ("response" in auth) return auth.response;
  const { solutionId, fileId } = await context.params;
  const record = productSqlite.prepare(`SELECT sf.id, sf.solution_id, sf.user_id, sf.category, sf.original_name, sf.size_bytes, sf.status
    FROM source_files sf JOIN product_solutions s ON s.id = sf.solution_id
    WHERE sf.id = ? AND sf.solution_id = ? AND s.status NOT IN ('deletion_pending', 'deleted')`).get(fileId, solutionId) as { id: string; solution_id: string; user_id: string; category: string; original_name: string; size_bytes: number; status: string } | undefined;
  if (!record || record.user_id !== auth.session.userId) return NextResponse.json({ success: false, error: { code: "FILE_ACCESS_DENIED", message: "无法访问这个文件。", retryable: false } }, { status: 404 });
  if (record.status === "uploaded") return uploadedResponse(record.id);
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) return NextResponse.json({ success: false, error: { code: "FILE_REQUIRED", message: "请选择需要上传的文件。", retryable: false } }, { status: 400 });
    if (file.size !== record.size_bytes || file.size > PRODUCT_UPLOAD_MAX_BYTES) return reject(fileId, "FILE_SIZE_INVALID", "文件大小与选择时不一致，或超过 50MB。", 422);
    const bytes = Buffer.from(await file.arrayBuffer());
    const detectedFormat = detectFormat(bytes, record.original_name);
    if (!extensionMatches(record.original_name, detectedFormat)) return reject(fileId, "TYPE_MISMATCH", "文件真实类型与扩展名不一致，请替换文件。", 422);
    const allowed: Record<string, string[]> = { content: ["docx", "xlsx", "pptx", "pdf", "png", "jpeg", "webp", "txt", "csv", "json"], template: ["docx", "xlsx", "pptx"], brand: ["pdf", "png", "jpeg", "webp"] };
    if (!allowed[record.category]?.includes(detectedFormat)) return reject(fileId, "CATEGORY_NOT_ALLOWED", record.category === "template" ? "模板无法使用，系统将采用默认模板。" : "这个文件类型不适用于当前区域。", 422);
    const stored = await writePrivateFile(auth.session.userId, solutionId, fileId, bytes);
    productSqlite.prepare("UPDATE source_files SET detected_format = ?, sha256 = ?, storage_key = ?, status = 'uploaded', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(detectedFormat, stored.sha256, stored.storageKey, fileId);
    if (record.category === "template") {
      await profileTemplateFile({ fileId, solutionId, userId: auth.session.userId, detectedFormat, bytes });
      invalidateDeliverablesForTemplate(solutionId, auth.session.userId, detectedFormat as "docx" | "xlsx" | "pptx");
      if (hasCompleteFormalDocument(solutionId)) {
        try {
          // Template replacement is render-only: reuse validated sections and
          // never invoke either the free-analysis or formal-writing model.
          await ensurePrimaryDeliverables(solutionId, auth.session.userId);
        } catch {
          // The upload remains valid. Keep the solution in `rendering` so the
          // existing deliverables endpoint can retry without another upload.
        }
      }
    }
    if (record.category === "content") invalidateForMaterialRevision(solutionId, auth.session.userId);
    if (record.category === "brand") {
      await profileBrandFile({ fileId, solutionId, userId: auth.session.userId, detectedFormat, bytes });
      invalidateDeliverablesForBrand(solutionId, auth.session.userId);
      if (hasCompleteFormalDocument(solutionId)) {
        try {
          // A logo or palette only changes rendered surfaces, never validated content.
          await ensurePrimaryDeliverables(solutionId, auth.session.userId);
        } catch {
          // The asset is valid. Keep rendering queued so the worker can retry safely.
        }
      }
    }
    recordProjectEvent({ solutionId, userId: auth.session.userId, type: "source_file_uploaded", summary: `上传了${categoryLabel(record.category)}：${record.original_name}`, metadata: { category: record.category, detectedFormat } });
    return uploadedResponse(fileId);
  } catch {
    return NextResponse.json({ success: false, error: { code: "UPLOAD_FAILED", message: "上传暂时失败，系统会保留当前进度，请重试这个文件。", retryable: true } }, { status: 500 });
  }
}

function categoryLabel(category: string) { return category === "template" ? "企业模板" : category === "brand" ? "品牌素材" : "项目材料"; }

function uploadedResponse(fileId: string) {
  const record = productSqlite.prepare("SELECT id AS fileId, status, detected_format AS detectedFormat, size_bytes AS sizeBytes, sha256 FROM source_files WHERE id = ?").get(fileId);
  return NextResponse.json({ success: true, data: record });
}

function reject(fileId: string, code: string, message: string, status: number) {
  productSqlite.prepare("UPDATE source_files SET status = 'failed', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(fileId);
  return NextResponse.json({ success: false, error: { code, message, retryable: false } }, { status });
}
