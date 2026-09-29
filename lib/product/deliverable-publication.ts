import { createHash, randomUUID } from "crypto";
import { validateDeliverablePackage } from "./deliverable-package";
import { validateDeliverableLayout } from "./deliverable-layout-quality";
import { productSqlite } from "./db";
import { detectFormat, writePrivateFile } from "./private-storage";
import { quoteParameterFingerprint } from "./quote-parameters";

export type PublishDeliverableInput = {
  solutionId: string;
  userId: string;
  artifactType: string;
  displayName: string;
  mimeType: string;
  bytes: Buffer;
  expectedFormat: string;
  qualityChecks: Array<Record<string, unknown>>;
};

export async function publishDeliverable(input: PublishDeliverableInput, workerId?: string) {
  assertRenderLease(input.solutionId, workerId);
  const format = detectFormat(input.bytes);
  if (format !== input.expectedFormat) throw new Error("DELIVERABLE_FORMAT_INVALID");
  const packageCheck = await validateDeliverablePackage(input.bytes, format);
  const layoutChecks = packageCheck.passed ? await validateDeliverableLayout(input.bytes, format) : [];
  const checks = [{ code: "NON_EMPTY", passed: input.bytes.length > 1000 }, { code: "PACKAGE_INTEGRITY", passed: packageCheck.passed, reason: packageCheck.passed ? null : packageCheck.code }, ...layoutChecks, ...input.qualityChecks];
  const quality = { status: checks.every((check) => check.passed === true) ? "pass" : "fail", checks };
  if (quality.status !== "pass") {
    const failedCodes = checks.filter((check) => check.passed !== true).map((check) => String(check.code || "UNKNOWN_CHECK"));
    throw new Error(`DELIVERABLE_QUALITY_FAILED:${failedCodes.join(",")}`);
  }
  const contentFingerprint = artifactContentFingerprint(input.solutionId, input.artifactType);
  const renderFingerprint = artifactRenderFingerprint(input.solutionId, input.expectedFormat);
  const existing = productSqlite.prepare(`SELECT id, solution_id AS solutionId, user_id AS userId, artifact_type AS artifactType,
    display_name AS displayName, mime_type AS mimeType, storage_key AS storageKey, size_bytes AS sizeBytes, sha256,
    quality_json AS qualityJson, content_fingerprint AS contentFingerprint, render_fingerprint AS renderFingerprint,
    content_version AS contentVersion, render_version AS renderVersion
    FROM deliverable_artifacts WHERE solution_id = ? AND artifact_type = ?`).get(input.solutionId, input.artifactType) as any;
  if (existing && existing.contentFingerprint === contentFingerprint && existing.renderFingerprint === renderFingerprint) {
    assertRenderLease(input.solutionId, workerId);
    productSqlite.prepare("UPDATE deliverable_artifacts SET status = 'available', published_at = COALESCE(published_at, CURRENT_TIMESTAMP), updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?").run(existing.id, input.userId);
    return;
  }
  const artifactId = randomUUID();
  const contentVersion = existing ? (existing.contentFingerprint === contentFingerprint ? existing.contentVersion : existing.contentVersion + 1) : 1;
  const renderVersion = existing ? (existing.contentFingerprint === contentFingerprint ? existing.renderVersion + 1 : 1) : 1;
  const stored = await writePrivateFile(input.userId, input.solutionId, artifactId, input.bytes);
  productSqlite.transaction(() => {
    assertRenderLease(input.solutionId, workerId);
    if (existing) productSqlite.prepare(`INSERT OR IGNORE INTO deliverable_artifact_versions
      (id, artifact_id, solution_id, user_id, artifact_type, display_name, mime_type, storage_key, size_bytes, sha256, quality_json,
       content_fingerprint, render_fingerprint, content_version, render_version)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      randomUUID(), existing.id, existing.solutionId, existing.userId, existing.artifactType, existing.displayName, existing.mimeType,
      existing.storageKey, existing.sizeBytes, existing.sha256, existing.qualityJson, existing.contentFingerprint, existing.renderFingerprint,
      existing.contentVersion, existing.renderVersion,
    );
    productSqlite.prepare(`INSERT INTO deliverable_artifacts
      (id, solution_id, user_id, artifact_type, display_name, mime_type, storage_key, size_bytes, sha256, status, quality_json,
       content_fingerprint, render_fingerprint, content_version, render_version, published_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'available', ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(solution_id, artifact_type) DO UPDATE SET id = excluded.id, user_id = excluded.user_id, display_name = excluded.display_name,
      mime_type = excluded.mime_type, storage_key = excluded.storage_key, size_bytes = excluded.size_bytes, sha256 = excluded.sha256,
      status = 'available', quality_json = excluded.quality_json, content_fingerprint = excluded.content_fingerprint,
      render_fingerprint = excluded.render_fingerprint, content_version = excluded.content_version, render_version = excluded.render_version,
      published_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP`).run(
      artifactId, input.solutionId, input.userId, input.artifactType, input.displayName, input.mimeType, stored.storageKey, input.bytes.length,
      stored.sha256, JSON.stringify(quality), contentFingerprint, renderFingerprint, contentVersion, renderVersion,
    );
  })();
}

export function listDeliverables(solutionId: string, userId: string) {
  return productSqlite.prepare(`SELECT id, artifact_type AS artifactType, display_name AS displayName, mime_type AS mimeType,
    size_bytes AS sizeBytes, sha256, status, content_version AS contentVersion, render_version AS renderVersion,
    published_at AS publishedAt, created_at AS createdAt, updated_at AS updatedAt,
    (SELECT COUNT(*) FROM deliverable_artifact_versions v WHERE v.solution_id = deliverable_artifacts.solution_id
      AND v.artifact_type = deliverable_artifacts.artifact_type) AS historyCount
    FROM deliverable_artifacts WHERE solution_id = ? AND user_id = ? AND status = 'available' ORDER BY created_at, id`).all(solutionId, userId);
}

export function invalidateDeliverablesForTemplate(solutionId: string, userId: string, format: "docx" | "xlsx" | "pptx") {
  const artifactTypes = format === "docx"
    ? [
        "requirement_analysis_docx",
        "requirement_analysis_pdf",
        "function_catalog_docx",
        "workload_estimate_pdf",
        "implementation_plan_pdf",
        "project_quote_pdf",
        "formal_solution_docx",
        "formal_solution_pdf",
      ]
    : format === "xlsx"
      ? ["function_catalog_xlsx", "workload_estimate_xlsx", "implementation_plan_xlsx", "project_quote_xlsx", "project_traceability_xlsx"]
      : ["solution_briefing_pptx", "solution_briefing_pdf"];
  const placeholders = artifactTypes.map(() => "?").join(", ");
  const result = productSqlite.prepare(`UPDATE deliverable_artifacts SET status = 'superseded', updated_at = CURRENT_TIMESTAMP
    WHERE solution_id = ? AND user_id = ? AND status = 'available' AND artifact_type IN (${placeholders})`).run(solutionId, userId, ...artifactTypes);
  if (result.changes > 0) queueRender(solutionId, userId);
  return { invalidated: result.changes, artifactTypes };
}

/** A brand change affects presentation only; the validated content remains intact. */
export function invalidateDeliverablesForBrand(solutionId: string, userId: string) {
  const result = productSqlite.prepare(`UPDATE deliverable_artifacts SET status = 'superseded', updated_at = CURRENT_TIMESTAMP
    WHERE solution_id = ? AND user_id = ? AND status = 'available'`).run(solutionId, userId);
  if (result.changes > 0) queueRender(solutionId, userId);
  return { invalidated: result.changes };
}

export function hasCompleteFormalDocument(solutionId: string) {
  const result = productSqlite.prepare("SELECT COUNT(*) AS sectionCount FROM formal_sections WHERE solution_id = ? AND status = 'validated' AND TRIM(COALESCE(content, '')) <> ''").get(solutionId) as { sectionCount: number };
  return result.sectionCount === 7;
}

export function supersedeStaleRenderedArtifacts(solutionId: string, userId: string) {
  const rows = productSqlite.prepare("SELECT id, artifact_type AS artifactType, render_fingerprint AS renderFingerprint FROM deliverable_artifacts WHERE solution_id = ? AND user_id = ? AND status = 'available'").all(solutionId, userId) as Array<{ id: string; artifactType: string; renderFingerprint: string | null }>;
  for (const row of rows) {
    const expectedFormat = row.artifactType.endsWith("_xlsx") ? "xlsx" : row.artifactType.endsWith("_pptx") ? "pptx" : row.artifactType.endsWith("_pdf") ? "pdf" : "docx";
    if (row.renderFingerprint !== artifactRenderFingerprint(solutionId, expectedFormat)) {
      productSqlite.prepare("UPDATE deliverable_artifacts SET status = 'superseded', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'available'").run(row.id);
    }
  }
}

function queueRender(solutionId: string, userId: string) {
  productSqlite.prepare("UPDATE product_solutions SET status = 'processing', stage = 'rendering', render_attempt_count = 0, render_next_attempt_at = NULL, render_error_code = NULL, render_failed_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND owner_user_id = ?").run(solutionId, userId);
}

function assertRenderLease(solutionId: string, workerId?: string) {
  if (!workerId) return;
  const owned = productSqlite.prepare("SELECT 1 FROM product_solutions WHERE id = ? AND stage = 'rendering' AND status = 'rendering' AND render_lease_owner = ? AND render_lease_until > CURRENT_TIMESTAMP").get(solutionId, workerId);
  if (!owned) throw new Error("RENDER_LEASE_LOST");
}

function artifactContentFingerprint(solutionId: string, artifactType: string) {
  const titles = artifactDependencyTitles(artifactType);
  const placeholders = titles.map(() => "?").join(", ");
  const sections = titles.length ? productSqlite.prepare(`SELECT section_key AS sectionKey, title, content, summary, structured_items_json AS structuredItemsJson
    FROM formal_sections WHERE solution_id = ? AND status = 'validated' AND title IN (${placeholders}) ORDER BY section_index`).all(solutionId, ...titles) : [];
  const deterministicParameters = ["project_quote_xlsx", "project_quote_pdf"].includes(artifactType)
    ? quoteParameterFingerprint(solutionId, true)
    : artifactType === "workload_estimate_xlsx" ? quoteParameterFingerprint(solutionId, true, true) : null;
  return createHash("sha256").update(JSON.stringify({ sections, deterministicParameters })).digest("hex");
}

function artifactRenderFingerprint(solutionId: string, expectedFormat: string) {
  const profile = productSqlite.prepare(`SELECT tp.detected_format AS detectedFormat, tp.profile_json AS profileJson, tp.render_policy_json AS renderPolicyJson
    FROM template_profiles tp JOIN source_files sf ON sf.id = tp.source_file_id
    WHERE tp.solution_id = ? AND tp.detected_format = ? AND sf.status = 'uploaded'
    ORDER BY sf.created_at DESC, sf.id DESC LIMIT 1`).get(solutionId, expectedFormat) || { detectedFormat: expectedFormat, profileJson: null, renderPolicyJson: null };
  return createHash("sha256").update(JSON.stringify({ rendererVersion: "renderer-v6-layout-quality-v1", expectedFormat, profile })).digest("hex");
}

function artifactDependencyTitles(artifactType: string): string[] {
  const all = ["项目背景与目标", "范围、用户与关键约束", "业务需求与功能规划", "整体解决方案", "工作量与成本依据", "实施计划与交付安排", "风险、假设与待确认事项"];
  const dependencies: Record<string, string[]> = {
    requirement_analysis_docx: [all[0], all[1], all[2], all[6]],
    requirement_analysis_pdf: [all[0], all[1], all[2], all[6]],
    function_catalog_xlsx: [all[2], all[3]],
    function_catalog_docx: [all[2], all[3]],
    workload_estimate_xlsx: [all[4]],
    workload_estimate_pdf: [all[4]],
    implementation_plan_xlsx: [all[5]],
    implementation_plan_pdf: [all[5]],
    project_quote_xlsx: [all[4], all[5]],
    project_quote_pdf: [all[4], all[5]],
    formal_solution_docx: all,
    formal_solution_pdf: all,
    solution_briefing_pptx: all,
    solution_briefing_pdf: all,
    project_traceability_xlsx: all,
  };
  return dependencies[artifactType] || all;
}
