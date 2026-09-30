import { createHash, randomUUID } from "crypto";
import { validateDeliverablePackage } from "./deliverable-package";
import { validateDeliverableLayout } from "./deliverable-layout-quality";
import { productSqlite } from "./db";
import { detectFormat, writePrivateFile } from "./private-storage";
import { deliverablePublicationRepository } from "./product-data-ports";
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
  const repository = deliverablePublicationRepository();
  await repository.assertRenderLease(input.solutionId, workerId);
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
  const contentFingerprint = await artifactContentFingerprint(input.solutionId, input.artifactType);
  const renderFingerprint = await artifactRenderFingerprint(input.solutionId, input.expectedFormat);
  const existing = await repository.findExisting(input.solutionId, input.artifactType);
  if (existing && existing.contentFingerprint === contentFingerprint && existing.renderFingerprint === renderFingerprint) {
    await repository.restoreAvailable(existing.id, input.userId, input.solutionId, workerId);
    return;
  }
  const artifactId = randomUUID();
  const contentVersion = existing ? (existing.contentFingerprint === contentFingerprint ? existing.contentVersion : existing.contentVersion + 1) : 1;
  const renderVersion = existing ? (existing.contentFingerprint === contentFingerprint ? existing.renderVersion + 1 : 1) : 1;
  const stored = await writePrivateFile(input.userId, input.solutionId, artifactId, input.bytes);
  await repository.publish({
    artifactId,
    solutionId: input.solutionId,
    userId: input.userId,
    artifactType: input.artifactType,
    displayName: input.displayName,
    mimeType: input.mimeType,
    storageKey: stored.storageKey,
    sizeBytes: input.bytes.length,
    sha256: stored.sha256,
    qualityJson: JSON.stringify(quality),
    contentFingerprint,
    renderFingerprint,
    contentVersion,
    renderVersion,
    existing,
  }, workerId);
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

export async function supersedeStaleRenderedArtifacts(solutionId: string, userId: string) {
  const repository = deliverablePublicationRepository();
  const rows = await repository.availableRenderFingerprints(solutionId, userId);
  for (const row of rows) {
    const expectedFormat = row.artifactType.endsWith("_xlsx") ? "xlsx" : row.artifactType.endsWith("_pptx") ? "pptx" : row.artifactType.endsWith("_pdf") ? "pdf" : "docx";
    if (row.renderFingerprint !== await artifactRenderFingerprint(solutionId, expectedFormat)) await repository.supersedeArtifact(row.id);
  }
}

function queueRender(solutionId: string, userId: string) {
  productSqlite.prepare("UPDATE product_solutions SET status = 'processing', stage = 'rendering', render_attempt_count = 0, render_next_attempt_at = NULL, render_error_code = NULL, render_failed_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND owner_user_id = ?").run(solutionId, userId);
}

async function artifactContentFingerprint(solutionId: string, artifactType: string) {
  const titles = artifactDependencyTitles(artifactType);
  const sections = await deliverablePublicationRepository().contentSections(solutionId, titles);
  const deterministicParameters = ["project_quote_xlsx", "project_quote_pdf"].includes(artifactType)
    ? quoteParameterFingerprint(solutionId, true)
    : artifactType === "workload_estimate_xlsx" ? quoteParameterFingerprint(solutionId, true, true) : null;
  return createHash("sha256").update(JSON.stringify({ sections, deterministicParameters })).digest("hex");
}

async function artifactRenderFingerprint(solutionId: string, expectedFormat: string) {
  const profile = await deliverablePublicationRepository().templateProfile(solutionId, expectedFormat);
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
