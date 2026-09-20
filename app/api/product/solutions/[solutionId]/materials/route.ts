import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireProductSession } from "../../../../../../lib/product/auth";
import { productSqlite } from "../../../../../../lib/product/db";

type FileSelection = { clientKey: string; displayName: string; sizeBytes: number; declaredMime?: string };

export async function POST(request: NextRequest, context: { params: Promise<{ solutionId: string }> }) {
  const auth = await requireProductSession(request);
  if ("response" in auth) return auth.response;
  const { solutionId } = await context.params;
  try {
    const body = await request.json();
    const files = Array.isArray(body?.fileSelections) ? body.fileSelections as FileSelection[] : [];
    if (!files.length || files.length > 20) return failure("MATERIAL_SELECTION_INVALID", "请选择 1–20 个需要补充的项目材料。", 422);
    const solution = productSqlite.prepare("SELECT id FROM product_solutions WHERE id = ? AND owner_user_id = ? AND status NOT IN ('deletion_pending', 'deleted')").get(solutionId, auth.session.userId);
    if (!solution) return failure("SOLUTION_NOT_FOUND", "方案不存在或无法访问。", 404);
    const seen = new Set<string>();
    for (const file of files) {
      if (!file || typeof file.clientKey !== "string" || !file.clientKey || file.clientKey.length > 200 || seen.has(file.clientKey)
        || typeof file.displayName !== "string" || !file.displayName.trim() || file.displayName.length > 255
        || !Number.isSafeInteger(file.sizeBytes) || file.sizeBytes <= 0) return failure("MATERIAL_SELECTION_INVALID", "补充材料的信息不完整，请重新选择文件。", 422);
      seen.add(file.clientKey);
    }
    const uploads = productSqlite.transaction(() => {
      const insert = productSqlite.prepare("INSERT INTO source_files (id, solution_id, user_id, client_key, category, original_name, declared_mime, size_bytes) VALUES (?, ?, ?, ?, 'content', ?, ?, ?)");
      return files.map((file) => {
        const fileId = randomUUID();
        insert.run(fileId, solutionId, auth.session.userId, `revision:${file.clientKey}:${fileId}`, file.displayName.trim(), typeof file.declaredMime === "string" ? file.declaredMime.slice(0, 255) : null, file.sizeBytes);
        return { fileId, clientKey: file.clientKey, status: "waiting_upload" };
      });
    })();
    return NextResponse.json({ success: true, data: { solutionId, uploads } }, { status: 201 });
  } catch {
    return failure("MATERIAL_SELECTION_FAILED", "暂时无法准备补充材料，请稍后重试。", 500, true);
  }
}

function failure(code: string, message: string, status: number, retryable = false) {
  return NextResponse.json({ success: false, error: { code, message, retryable } }, { status });
}
