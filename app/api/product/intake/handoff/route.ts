import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireProductSession } from "../../../../../lib/product/auth";
import { productSqlite } from "../../../../../lib/product/db";
import { recordProjectEvent } from "../../../../../lib/product/project-events";

type FileSelection = { clientKey: string; category: "content" | "template" | "brand"; displayName: string; sizeBytes: number; declaredMime?: string };

export async function POST(request: NextRequest) {
  const auth = await requireProductSession(request);
  if ("response" in auth) return auth.response;
  try {
    const body = await request.json();
    const draftId = typeof body.draftId === "string" ? body.draftId : "";
    const purposePrimary = typeof body.purposePrimary === "string" ? body.purposePrimary.trim() : "";
    const needDescription = typeof body.needDescription === "string" ? body.needDescription.trim() : "";
    const files = Array.isArray(body.fileSelections) ? body.fileSelections as FileSelection[] : [];
    if (!/^[0-9a-f-]{36}$/i.test(draftId) || !purposePrimary || (!needDescription && !files.some((file) => file.category === "content"))) {
      return NextResponse.json({ success: false, error: { code: "INTAKE_INVALID", message: "请先完成用途，并描述问题或选择一份项目材料。", retryable: false } }, { status: 422 });
    }
    const existing = productSqlite.prepare("SELECT user_id, solution_id FROM intake_drafts WHERE id = ?").get(draftId) as { user_id: string; solution_id: string } | undefined;
    if (existing) {
      if (existing.user_id !== auth.session.userId) return NextResponse.json({ success: false, error: { code: "DRAFT_OWNERSHIP_DENIED", message: "这份填写内容已属于其他账号。", retryable: false } }, { status: 403 });
      return responseFor(existing.solution_id);
    }
    const solutionId = randomUUID();
    const titleBase = typeof body.formData?.organizationName === "string" && body.formData.organizationName.trim() ? body.formData.organizationName.trim() : purposePrimary;
    const title = titleBase.endsWith("方案") ? titleBase : `${titleBase}方案`;
    const stage = needDescription ? "quick_understanding" : "awaiting_upload";
    const status = needDescription ? "processing" : "preparing";
    const create = productSqlite.transaction(() => {
      productSqlite.prepare("INSERT INTO product_solutions (id, owner_user_id, title, status, stage) VALUES (?, ?, ?, ?, ?)").run(solutionId, auth.session.userId, title, status, stage);
      productSqlite.prepare("INSERT INTO intake_drafts (id, user_id, solution_id, purpose_primary, need_description, form_data, status) VALUES (?, ?, ?, ?, ?, ?, 'submitted')").run(draftId, auth.session.userId, solutionId, purposePrimary, needDescription, JSON.stringify(body.formData || {}));
      const insertFile = productSqlite.prepare("INSERT INTO source_files (id, solution_id, user_id, client_key, category, original_name, declared_mime, size_bytes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
      for (const file of files) {
        if (!file.clientKey || !["content", "template", "brand"].includes(file.category) || !file.displayName || !Number.isSafeInteger(file.sizeBytes) || file.sizeBytes < 0) throw new Error("INVALID_FILE_SELECTION");
        insertFile.run(randomUUID(), solutionId, auth.session.userId, file.clientKey, file.category, file.displayName, file.declaredMime || null, file.sizeBytes);
      }
      recordProjectEvent({ solutionId, userId: auth.session.userId, type: "project_created", summary: "创建了项目", metadata: { sourceFileSelections: files.length } });
    });
    create();
    return responseFor(solutionId, 201);
  } catch {
    return NextResponse.json({ success: false, error: { code: "HANDOFF_FAILED", message: "暂时无法保存填写内容，请稍后重试。", retryable: true } }, { status: 500 });
  }
}

function responseFor(solutionId: string, status = 200) {
  const solution = productSqlite.prepare("SELECT id, status, stage FROM product_solutions WHERE id = ?").get(solutionId) as { id: string; status: string; stage: string };
  const uploads = productSqlite.prepare("SELECT id AS fileId, client_key AS clientKey, status FROM source_files WHERE solution_id = ? ORDER BY created_at, id").all(solutionId);
  return NextResponse.json({ success: true, data: { solutionId, status: solution.status, stage: solution.stage, uploads, autoStarted: solution.stage === "quick_understanding" } }, { status });
}
