import { createHash, randomUUID } from "crypto";
import { validateDeliverablePackage } from "./deliverable-package";
import { validateDeliverableLayout } from "./deliverable-layout-quality";
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

export async function listDeliverables(solutionId: string, userId: string) {
  return deliverablePublicationRepository().listAvailable(solutionId, userId);
}

export async function invalidateDeliverablesForTemplate(solutionId: string, userId: string, format: "docx" | "xlsx" | "pptx") {
  const artifactTypes = templateArtifactTypes(format);
  const invalidated = await deliverablePublicationRepository().invalidateAvailable(solutionId, userId, artifactTypes);
  return { invalidated, artifactTypes };
}

/** A brand change affects presentation only; the validated content remains intact. */
export async function invalidateDeliverablesForBrand(solutionId: string, userId: string) {
  const invalidated = await deliverablePublicationRepository().invalidateAvailable(solutionId, userId);
  return { invalidated };
}

export async function hasCompleteFormalDocument(solutionId: string) {
  return deliverablePublicationRepository().hasCompleteFormalDocument(solutionId);
}

export async function removeTemplateAndInvalidate(solutionId: string, userId: string, sourceFileId: string, format: "docx" | "xlsx" | "pptx") {
  return deliverablePublicationRepository().removePresentationSource({
    sourceFileId,
    solutionId,
    userId,
    artifactTypes: templateArtifactTypes(format),
    eventType: "template_removed",
    eventSummary: "移除了一份企业模板",
  });
}

export async function removeBrandAndInvalidate(solutionId: string, userId: string, sourceFileId: string) {
  return deliverablePublicationRepository().removePresentationSource({
    sourceFileId,
    solutionId,
    userId,
    eventType: "brand_removed",
    eventSummary: "移除了一份品牌素材",
  });
}

export async function supersedeStaleRenderedArtifacts(solutionId: string, userId: string) {
  const repository = deliverablePublicationRepository();
  const rows = await repository.availableRenderFingerprints(solutionId, userId);
  for (const row of rows) {
    const expectedFormat = row.artifactType.endsWith("_xlsx") ? "xlsx" : row.artifactType.endsWith("_pptx") ? "pptx" : row.artifactType.endsWith("_pdf") ? "pdf" : "docx";
    if (row.renderFingerprint !== await artifactRenderFingerprint(solutionId, expectedFormat)) await repository.supersedeArtifact(row.id);
  }
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

function templateArtifactTypes(format: "docx" | "xlsx" | "pptx") {
  return format === "docx"
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
}
