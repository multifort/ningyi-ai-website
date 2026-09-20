import { randomUUID } from "crypto";
import fs from "fs/promises";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { requireProductSession } from "../../../../../../lib/product/auth";
import { productSqlite } from "../../../../../../lib/product/db";
import { safePrivatePath, writePrivateFile } from "../../../../../../lib/product/private-storage";
import { projectInputFingerprint } from "../../../../../../lib/product/input-fingerprint";
import { recordProjectEvent } from "../../../../../../lib/product/project-events";

type SourceFile = {
  id: string;
  category: string;
  originalName: string;
  declaredMime: string | null;
  detectedFormat: string | null;
  sizeBytes: number;
  sha256: string | null;
  storageKey: string | null;
};

export async function POST(request: NextRequest, context: { params: Promise<{ solutionId: string }> }) {
  const auth = await requireProductSession(request);
  if ("response" in auth) return auth.response;
  const { solutionId } = await context.params;
  const source = productSqlite.prepare(`SELECT s.title, i.purpose_primary AS purposePrimary, i.need_description AS needDescription, i.form_data AS formData
    FROM product_solutions s JOIN intake_drafts i ON i.solution_id = s.id
    WHERE s.id = ? AND s.owner_user_id = ? AND s.status NOT IN ('deletion_pending', 'deleted')`).get(solutionId, auth.session.userId) as { title: string; purposePrimary: string; needDescription: string; formData: string } | undefined;
  if (!source) return failure("SOLUTION_NOT_FOUND", "方案不存在或无法访问。", 404);

  const files = productSqlite.prepare(`SELECT id, category, original_name AS originalName, declared_mime AS declaredMime,
    detected_format AS detectedFormat, size_bytes AS sizeBytes, sha256, storage_key AS storageKey
    FROM source_files WHERE solution_id = ? AND user_id = ? AND status = 'uploaded' ORDER BY created_at, id`).all(solutionId, auth.session.userId) as SourceFile[];
  const facts = productSqlite.prepare("SELECT text FROM project_user_facts WHERE solution_id = ? AND user_id = ? AND status = 'active' ORDER BY created_at, id").all(solutionId, auth.session.userId) as Array<{ text: string }>;
  const newSolutionId = randomUUID();
  const copiedFiles: Array<SourceFile & { newFileId: string; bytes: Buffer }> = [];
  const cleanupTarget = safePrivatePath(auth.session.userId, newSolutionId, randomUUID());

  try {
    for (const file of files) {
      const existing = safePrivatePath(auth.session.userId, solutionId, file.id);
      if (!file.storageKey || file.storageKey !== existing.relativeKey) return failure("SOURCE_STORAGE_MISMATCH", "原项目中有材料暂时无法读取，暂不能复制。", 409, true);
      copiedFiles.push({ ...file, newFileId: randomUUID(), bytes: await fs.readFile(existing.absolutePath) });
    }

    for (const file of copiedFiles) {
      const stored = await writePrivateFile(auth.session.userId, newSolutionId, file.newFileId, file.bytes);
      if (file.sha256 && stored.sha256 !== file.sha256) throw new Error("SOURCE_COPY_CHECKSUM_MISMATCH");
      file.sha256 = stored.sha256;
    }

    const title = duplicateTitle(source.title);
    productSqlite.transaction(() => {
      productSqlite.prepare("INSERT INTO product_solutions (id, owner_user_id, title, status, stage) VALUES (?, ?, ?, 'preparing', 'ready_to_process')").run(newSolutionId, auth.session.userId, title);
      productSqlite.prepare("INSERT INTO intake_drafts (id, user_id, solution_id, purpose_primary, need_description, form_data, status) VALUES (?, ?, ?, ?, ?, ?, 'submitted')").run(randomUUID(), auth.session.userId, newSolutionId, source.purposePrimary, source.needDescription, source.formData);
      const insertFile = productSqlite.prepare(`INSERT INTO source_files (id, solution_id, user_id, client_key, category, original_name, declared_mime,
        detected_format, size_bytes, sha256, storage_key, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'uploaded')`);
      const copyTemplateProfile = productSqlite.prepare(`INSERT INTO template_profiles (source_file_id, solution_id, user_id, detected_format, status, profile_json, warnings_json, render_policy_json, fallback_reason)
        SELECT ?, ?, ?, detected_format, status, profile_json, warnings_json, render_policy_json, fallback_reason FROM template_profiles WHERE source_file_id = ?`);
      const copyBrandProfile = productSqlite.prepare(`INSERT INTO brand_profiles (source_file_id, solution_id, user_id, detected_format, status, profile_json, fallback_reason)
        SELECT ?, ?, ?, detected_format, status, profile_json, fallback_reason FROM brand_profiles WHERE source_file_id = ?`);
      for (const file of copiedFiles) {
        const target = safePrivatePath(auth.session.userId, newSolutionId, file.newFileId);
        insertFile.run(file.newFileId, newSolutionId, auth.session.userId, `duplicate:${file.id}:${file.newFileId}`, file.category, file.originalName, file.declaredMime, file.detectedFormat, file.sizeBytes, file.sha256, target.relativeKey);
        if (file.category === "template") copyTemplateProfile.run(file.newFileId, newSolutionId, auth.session.userId, file.id);
        if (file.category === "brand") copyBrandProfile.run(file.newFileId, newSolutionId, auth.session.userId, file.id);
      }
      const insertFact = productSqlite.prepare("INSERT INTO project_user_facts (id, solution_id, user_id, text, status) VALUES (?, ?, ?, ?, 'active')");
      for (const fact of facts) insertFact.run(randomUUID(), newSolutionId, auth.session.userId, fact.text);
      recordProjectEvent({ solutionId: newSolutionId, userId: auth.session.userId, type: "project_duplicated", summary: "从已有项目复制了输入", metadata: { sourceSolutionId: solutionId, sourceFiles: copiedFiles.length, userConfirmedFacts: facts.length } });
      recordProjectEvent({ solutionId, userId: auth.session.userId, type: "project_duplicated_source", summary: "此项目的输入被复制为新项目", metadata: { duplicateSolutionId: newSolutionId } });
    })();
    return NextResponse.json({ success: true, data: { sourceSolutionId: solutionId, solutionId: newSolutionId, title, inputFingerprint: projectInputFingerprint(newSolutionId, auth.session.userId), copied: { sourceFiles: copiedFiles.length, userConfirmedFacts: facts.length }, autoStarted: false, nextStep: "review_and_process" } }, { status: 201 });
  } catch {
    await fs.rm(path.dirname(cleanupTarget.absolutePath), { recursive: true, force: true });
    return failure("SOLUTION_DUPLICATE_FAILED", "暂时无法复制项目输入，请稍后重试。", 500, true);
  }
}

function duplicateTitle(title: string) {
  const suffix = "（副本）";
  return `${title.slice(0, Math.max(2, 120 - suffix.length)).trim() || "项目"}${suffix}`;
}

function failure(code: string, message: string, status: number, retryable = false) {
  return NextResponse.json({ success: false, error: { code, message, retryable } }, { status });
}
