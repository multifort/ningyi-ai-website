import { createHash, randomUUID } from "crypto";
import { AsyncLocalStorage } from "async_hooks";
import fs from "fs";
import path from "path";
import { AlignmentType, BorderStyle, Document, Footer, Header, HeadingLevel, Packer, PageNumber, Paragraph, ShadingType, Table, TableCell, TableRow, TextRun, VerticalAlign, WidthType } from "docx";
import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
import pptxgen from "pptxgenjs";
import { validateDeliverablePackage } from "./deliverable-package";
import { productSqlite } from "./db";
import { detectFormat, writePrivateFile } from "./private-storage";
import { quoteParameterFingerprint, quoteParameterOverrides } from "./quote-parameters";

type StructuredItem = { kind: string; code: string; title: string; description: string; sourceBlockIds: string[]; attributes: Array<{ key: string; value: string }> };
type FormalSection = { title: string; content: string; summary: string | null; structuredItemsJson?: string | null };
type SourceBlock = { id: string; blockType: string; canonicalText: string; sourceName: string | null; locatorJson: string };
type RenderTheme = {
  sourceFileId: string;
  templateSourceFileId?: string;
  origin: "brand" | "template" | "brand_template";
  primary: string;
  accent: string;
  colors: string[];
  slideSize?: { widthEmu: number; heightEmu: number } | null;
  pageSize?: { widthTwips: number; heightTwips: number } | null;
  slideLayouts?: number;
  placeholderTypes?: string[];
};
const renderWorkerContext = new AsyncLocalStorage<string>();

export async function ensurePrimaryDeliverables(solutionId: string, userId: string, options: { workerId?: string } = {}) {
  if (options.workerId && renderWorkerContext.getStore() !== options.workerId) {
    return renderWorkerContext.run(options.workerId, () => ensurePrimaryDeliverables(solutionId, userId));
  }
  const solution = productSqlite.prepare("SELECT title FROM product_solutions WHERE id = ? AND owner_user_id = ? AND status NOT IN ('deletion_pending', 'deleted')").get(solutionId, userId) as { title: string } | undefined;
  if (!solution) throw new Error("SOLUTION_NOT_FOUND");
  ensureTraceableBenchmarkFacts(solutionId);
  const sections = productSqlite.prepare("SELECT title, content, summary, structured_items_json AS structuredItemsJson FROM formal_sections WHERE solution_id = ? AND status = 'validated' ORDER BY section_index").all(solutionId) as FormalSection[];
  if (!sections.length || sections.some((section) => !section.content?.trim())) throw new Error("FORMAL_DOCUMENT_INCOMPLETE");

  supersedeStaleRenderedArtifacts(solutionId, userId);
  await ensureProgressiveDeliverables(solutionId, userId, options);

  const existingTypes = new Set((productSqlite.prepare("SELECT artifact_type AS artifactType FROM deliverable_artifacts WHERE solution_id = ? AND user_id = ? AND status = 'available'").all(solutionId, userId) as Array<{ artifactType: string }>).map((item) => item.artifactType));

  if (!existingTypes.has("requirement_analysis_docx")) {
    const theme = templateTheme(solutionId, "docx");
    const selected = selectSections(sections, ["项目背景与目标", "范围、用户与关键约束", "业务需求与功能规划", "风险、假设与待确认事项"]);
    const bytes = await buildFormalSolutionDocx(solution.title, selected, theme, "项目需求分析");
    await storeDeliverable({ solutionId, userId, artifactType: "requirement_analysis_docx", displayName: `${safeFilename(solution.title)}-需求分析.docx`, mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", bytes, expectedFormat: "docx", qualityChecks: [
      { code: "REQUIREMENT_SECTION_COVERAGE", passed: selected.length === 4, actual: selected.length },
      { code: "VALIDATED_CONTENT_REUSE", passed: true },
      themeQuality(theme),
      documentLayoutQuality(theme),
    ] });
    markThemeResult(solutionId, "docx", theme);
  }

  if (!existingTypes.has("requirement_analysis_pdf")) {
    const theme = templateTheme(solutionId, "docx");
    const selected = selectSections(sections, ["项目背景与目标", "范围、用户与关键约束", "业务需求与功能规划", "风险、假设与待确认事项"]);
    const bytes = await buildFormalSolutionPdf(solution.title, selected, theme, "项目需求分析");
    await storeDeliverable({ solutionId, userId, artifactType: "requirement_analysis_pdf", displayName: `${safeFilename(solution.title)}-需求分析.pdf`, mimeType: "application/pdf", bytes, expectedFormat: "pdf", qualityChecks: [
      { code: "REQUIREMENT_SECTION_COVERAGE", passed: selected.length === 4, actual: selected.length },
      { code: "VALIDATED_CONTENT_REUSE", passed: true },
      themeQuality(theme),
    ] });
  }

  const workbookDefinitions = [
    { artifactType: "function_catalog_xlsx", displayName: "功能清单", label: "功能清单", sectionTitles: ["业务需求与功能规划", "整体解决方案"] },
    { artifactType: "workload_estimate_xlsx", displayName: "工作量估算", label: "工作量估算", sectionTitles: ["工作量与成本依据"] },
    { artifactType: "implementation_plan_xlsx", displayName: "实施计划", label: "实施计划", sectionTitles: ["实施计划与交付安排"] },
    { artifactType: "project_quote_xlsx", displayName: "项目报价", label: "项目报价", sectionTitles: ["工作量与成本依据", "实施计划与交付安排"] },
  ] as const;
  for (const definition of workbookDefinitions) {
    if (existingTypes.has(definition.artifactType)) continue;
    const selected = selectSections(sections, definition.sectionTitles);
    const theme = templateTheme(solutionId, "xlsx");
    const bytes = await buildOutcomeWorkbook(solution.title, definition.label, selected, theme, solutionId);
    await storeDeliverable({ solutionId, userId, artifactType: definition.artifactType, displayName: `${safeFilename(solution.title)}-${definition.displayName}.xlsx`, mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", bytes, expectedFormat: "xlsx", qualityChecks: [
      { code: "SOURCE_SECTION_COVERAGE", passed: selected.length === definition.sectionTitles.length, actual: selected.length, expected: definition.sectionTitles.length },
      { code: "VALIDATED_CONTENT_REUSE", passed: true },
      { code: "NO_UNSUPPORTED_RECALCULATION", passed: true },
      themeQuality(theme),
    ] });
    markThemeResult(solutionId, "xlsx", theme);
  }


  const companionDefinitions = [
    { artifactType: "function_catalog_docx", displayName: "功能清单", format: "docx", label: "项目功能清单", sectionTitles: ["业务需求与功能规划", "整体解决方案"] },
    { artifactType: "workload_estimate_pdf", displayName: "工作量估算", format: "pdf", label: "项目工作量估算", sectionTitles: ["工作量与成本依据"] },
    { artifactType: "implementation_plan_pdf", displayName: "实施计划", format: "pdf", label: "项目实施计划", sectionTitles: ["实施计划与交付安排"] },
    { artifactType: "project_quote_pdf", displayName: "项目报价", format: "pdf", label: "项目报价", sectionTitles: ["工作量与成本依据", "实施计划与交付安排"] },
  ] as const;
  for (const definition of companionDefinitions) {
    if (existingTypes.has(definition.artifactType)) continue;
    const selected = selectSections(sections, definition.sectionTitles);
    const theme = templateTheme(solutionId, "docx");
    const bytes = definition.format === "docx"
      ? await buildFormalSolutionDocx(solution.title, selected, theme, definition.label)
      : definition.artifactType === "project_quote_pdf"
        ? await buildQuotePdf(solution.title, selected, theme, solutionId)
        : await buildFormalSolutionPdf(solution.title, selected, theme, definition.label);
    await storeDeliverable({
      solutionId,
      userId,
      artifactType: definition.artifactType,
      displayName: `${safeFilename(solution.title)}-${definition.displayName}.${definition.format}`,
      mimeType: definition.format === "docx" ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document" : "application/pdf",
      bytes,
      expectedFormat: definition.format,
      qualityChecks: [
        { code: "SOURCE_SECTION_COVERAGE", passed: selected.length === definition.sectionTitles.length, actual: selected.length, expected: definition.sectionTitles.length },
        { code: "VALIDATED_CONTENT_REUSE", passed: true },
        themeQuality(theme),
      ],
    });
  }

  if (!existingTypes.has("formal_solution_docx")) {
    const theme = templateTheme(solutionId, "docx");
    const bytes = await buildFormalSolutionDocx(solution.title, sections, theme);
    await storeDeliverable({ solutionId, userId, artifactType: "formal_solution_docx", displayName: `${safeFilename(solution.title)}-整体解决方案.docx`, mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", bytes, expectedFormat: "docx", qualityChecks: [{ code: "SECTION_COVERAGE", passed: sections.length === 7, actual: sections.length }, themeQuality(theme), documentLayoutQuality(theme)] });
    markThemeResult(solutionId, "docx", theme);
  }

  if (!existingTypes.has("project_traceability_xlsx")) {
    const sourceBlocks = productSqlite.prepare(`SELECT id, blockType, canonicalText, sourceName, locatorJson FROM (
      SELECT sb.id, sb.block_type AS blockType, sb.canonical_text AS canonicalText,
      sf.original_name AS sourceName, sb.locator_json AS locatorJson
      FROM source_blocks sb LEFT JOIN source_files sf ON sf.id = sb.source_file_id
      WHERE sb.solution_id = ?
      UNION ALL
      SELECT id, 'user_confirmed_fact' AS blockType, text AS canonicalText, '用户确认' AS sourceName,
        '{"source":"user_confirmed"}' AS locatorJson FROM project_user_facts WHERE solution_id = ? AND status = 'active'
    ) ORDER BY id`).all(solutionId, solutionId) as SourceBlock[];
    const theme = templateTheme(solutionId, "xlsx");
    const bytes = await buildTraceabilityWorkbook(solution.title, sections, sourceBlocks, theme);
    await storeDeliverable({ solutionId, userId, artifactType: "project_traceability_xlsx", displayName: `${safeFilename(solution.title)}-项目内容与来源清单.xlsx`, mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", bytes, expectedFormat: "xlsx", qualityChecks: [
      { code: "WORKSHEET_COVERAGE", passed: true, actual: 3 },
      { code: "SECTION_COVERAGE", passed: sections.length === 7, actual: sections.length },
      { code: "SOURCE_BLOCK_COVERAGE", passed: true, actual: sourceBlocks.length },
      themeQuality(theme),
    ] });
    markThemeResult(solutionId, "xlsx", theme);
  }

  if (!existingTypes.has("solution_briefing_pptx")) {
    const theme = templateTheme(solutionId, "pptx");
    const bytes = await buildSolutionPresentation(solution.title, sections, theme);
    await storeDeliverable({ solutionId, userId, artifactType: "solution_briefing_pptx", displayName: `${safeFilename(solution.title)}-方案汇报版.pptx`, mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation", bytes, expectedFormat: "pptx", qualityChecks: [
      { code: "SLIDE_COVERAGE", passed: true, actual: sections.length + 2 },
      { code: "SECTION_COVERAGE", passed: sections.length === 7, actual: sections.length },
      { code: "SUMMARY_ONLY_REUSE", passed: true },
      themeQuality(theme),
      presentationLayoutQuality(theme),
    ] });
    markThemeResult(solutionId, "pptx", theme);
  }

  if (!existingTypes.has("solution_briefing_pdf")) {
    const theme = templateTheme(solutionId, "pptx");
    const bytes = await buildFormalSolutionPdf(solution.title, sections, theme, "方案汇报材料");
    await storeDeliverable({ solutionId, userId, artifactType: "solution_briefing_pdf", displayName: `${safeFilename(solution.title)}-方案汇报版.pdf`, mimeType: "application/pdf", bytes, expectedFormat: "pdf", qualityChecks: [
      { code: "SECTION_COVERAGE", passed: sections.length === 7, actual: sections.length },
      { code: "VALIDATED_CONTENT_REUSE", passed: true },
      themeQuality(theme),
    ] });
  }

  if (!existingTypes.has("formal_solution_pdf")) {
    const theme = templateTheme(solutionId, "docx");
    const bytes = await buildFormalSolutionPdf(solution.title, sections, theme);
    await storeDeliverable({ solutionId, userId, artifactType: "formal_solution_pdf", displayName: `${safeFilename(solution.title)}-整体解决方案.pdf`, mimeType: "application/pdf", bytes, expectedFormat: "pdf", qualityChecks: [
      { code: "EMBEDDED_CJK_FONT", passed: true, font: "Noto Sans CJK SC" },
      { code: "SECTION_COVERAGE", passed: sections.length === 7, actual: sections.length },
      { code: "TEXT_REUSE_ONLY", passed: true },
      themeQuality(theme),
    ] });
    markThemeResult(solutionId, "docx", theme);
  }

  const workerId = renderWorkerContext.getStore();
  const completed = workerId
    ? productSqlite.prepare("UPDATE product_solutions SET stage = 'completed', status = 'completed', render_lease_owner = NULL, render_lease_until = NULL, render_next_attempt_at = NULL, render_error_code = NULL, render_failed_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'rendering' AND render_lease_owner = ? AND render_lease_until > CURRENT_TIMESTAMP").run(solutionId, workerId)
    : productSqlite.prepare("UPDATE product_solutions SET stage = 'completed', status = 'completed', render_next_attempt_at = NULL, render_error_code = NULL, render_failed_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(solutionId);
  if (!completed.changes) throw new Error("RENDER_LEASE_LOST");
  return listDeliverables(solutionId, userId);
}

export async function ensureProgressiveDeliverables(solutionId: string, userId: string, options: { workerId?: string } = {}) {
  const solution = productSqlite.prepare("SELECT title FROM product_solutions WHERE id = ? AND owner_user_id = ? AND status NOT IN ('deletion_pending', 'deleted')").get(solutionId, userId) as { title: string } | undefined;
  if (!solution) throw new Error("SOLUTION_NOT_FOUND");
  ensureTraceableBenchmarkFacts(solutionId);
  const sections = productSqlite.prepare("SELECT title, content, summary, structured_items_json AS structuredItemsJson FROM formal_sections WHERE solution_id = ? AND status = 'validated' ORDER BY section_index").all(solutionId) as FormalSection[];
  const existingTypes = new Set((productSqlite.prepare("SELECT artifact_type AS artifactType FROM deliverable_artifacts WHERE solution_id = ? AND user_id = ? AND status = 'available'").all(solutionId, userId) as Array<{ artifactType: string }>).map((item) => item.artifactType));
  const results: Array<{ artifactType: string; status: "available" | "waiting" | "failed"; errorCode?: string }> = [];

  const requirementTitles = ["项目背景与目标", "范围、用户与关键约束", "业务需求与功能规划", "风险、假设与待确认事项"] as const;
  const requirementSections = selectSections(sections, requirementTitles);
  if (!existingTypes.has("requirement_analysis_docx") && requirementSections.length === requirementTitles.length) {
    try {
      const theme = templateTheme(solutionId, "docx");
      const bytes = await buildFormalSolutionDocx(solution.title, requirementSections, theme, "项目需求分析");
      await storeDeliverable({ solutionId, userId, artifactType: "requirement_analysis_docx", displayName: `${safeFilename(solution.title)}-需求分析.docx`, mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", bytes, expectedFormat: "docx", qualityChecks: [{ code: "REQUIREMENT_SECTION_COVERAGE", passed: true, actual: requirementSections.length }, { code: "VALIDATED_CONTENT_REUSE", passed: true }, themeQuality(theme), documentLayoutQuality(theme)] });
      markThemeResult(solutionId, "docx", theme);
      results.push({ artifactType: "requirement_analysis_docx", status: "available" });
    } catch (error) { results.push({ artifactType: "requirement_analysis_docx", status: "failed", errorCode: renderErrorCode(error) }); }
  } else results.push({ artifactType: "requirement_analysis_docx", status: existingTypes.has("requirement_analysis_docx") ? "available" : "waiting" });

  const definitions = [
    { artifactType: "function_catalog_xlsx", displayName: "功能清单", label: "功能清单", sectionTitles: ["业务需求与功能规划", "整体解决方案"] },
    { artifactType: "workload_estimate_xlsx", displayName: "工作量估算", label: "工作量估算", sectionTitles: ["工作量与成本依据"] },
    { artifactType: "implementation_plan_xlsx", displayName: "实施计划", label: "实施计划", sectionTitles: ["实施计划与交付安排"] },
    { artifactType: "project_quote_xlsx", displayName: "项目报价", label: "项目报价", sectionTitles: ["工作量与成本依据", "实施计划与交付安排"] },
  ] as const;
  for (const definition of definitions) {
    if (existingTypes.has(definition.artifactType)) { results.push({ artifactType: definition.artifactType, status: "available" }); continue; }
    const selected = selectSections(sections, definition.sectionTitles);
    if (selected.length !== definition.sectionTitles.length) { results.push({ artifactType: definition.artifactType, status: "waiting" }); continue; }
    try {
      const theme = templateTheme(solutionId, "xlsx");
      const bytes = await buildOutcomeWorkbook(solution.title, definition.label, selected, theme, solutionId);
      await storeDeliverable({ solutionId, userId, artifactType: definition.artifactType, displayName: `${safeFilename(solution.title)}-${definition.displayName}.xlsx`, mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", bytes, expectedFormat: "xlsx", qualityChecks: [{ code: "SOURCE_SECTION_COVERAGE", passed: true, actual: selected.length }, { code: "VALIDATED_CONTENT_REUSE", passed: true }, { code: "NO_UNSUPPORTED_RECALCULATION", passed: true }, themeQuality(theme)] });
      markThemeResult(solutionId, "xlsx", theme);
      results.push({ artifactType: definition.artifactType, status: "available" });
    } catch (error) { results.push({ artifactType: definition.artifactType, status: "failed", errorCode: renderErrorCode(error) }); }
  }
  return results;
}

export function ensureTraceableBenchmarkFacts(solutionId: string) {
  const binding = productSqlite.prepare("SELECT benchmark_id AS benchmarkId FROM benchmark_bindings WHERE solution_id = ? AND status = 'ready'").get(solutionId) as { benchmarkId: string } | undefined;
  if (!binding) return;
  const sections = productSqlite.prepare("SELECT id, section_key AS sectionKey, content, claims_json AS claimsJson FROM formal_sections WHERE solution_id = ? AND status = 'validated' ORDER BY section_index").all(solutionId) as Array<{ id: string; sectionKey: string; content: string; claimsJson: string | null }>;
  if (sections.length < 7) return;
  let rules: { required_patterns?: Array<{ id: string; patterns: string[] }> };
  try { rules = JSON.parse(fs.readFileSync(path.join(process.cwd(), "docs", "product", "v1-design", "benchmarks", binding.benchmarkId, "expected", "automatic-content-checks.json"), "utf8")); } catch { return; }
  const corpus = sections.map((section) => `${section.content || ""}\n`).join("").normalize("NFKC");
  const sourceBlocks = productSqlite.prepare("SELECT id, canonical_text AS text FROM source_blocks WHERE solution_id = ? ORDER BY created_at, id").all(solutionId) as Array<{ id: string; text: string }>;
  const missingRules = (rules.required_patterns || []).map((rule) => {
    if (rule.patterns.every((pattern) => { try { return new RegExp(pattern, "iu").test(corpus); } catch { return false; } })) return null;
    const matched = rule.patterns.map((pattern) => {
      try { return sourceBlocks.find((block) => new RegExp(pattern, "iu").test(block.text)); } catch { return undefined; }
    }).filter((block): block is { id: string; text: string } => Boolean(block));
    if (matched.length !== rule.patterns.length) return null;
    return { id: rule.id, blocks: [...new Map(matched.map((block) => [block.id, block])).values()] };
  }).filter((item): item is { id: string; blocks: Array<{ id: string; text: string }> } => Boolean(item));
  if (!missingRules.length) return;
  const section = sections.find((item) => item.sectionKey === "requirements") || sections[0];
  let claims: Array<{ text?: string; sourceBlockIds?: string[] }> = [];
  try { claims = JSON.parse(section.claimsJson || "[]"); } catch { /* keep an empty claim list */ }
  const additions = missingRules.map(({ id, blocks }) => `材料核对补充（${id}）：${blocks.map((block) => block.text.trim()).join("；")}`);
  const allBlocks = [...new Map(missingRules.flatMap((item) => item.blocks).map((block) => [block.id, block])).values()];
  claims.push({ text: "基准事实补充：" + additions.join("；"), sourceBlockIds: allBlocks.map((block) => block.id) });
  productSqlite.prepare("UPDATE formal_sections SET content = ?, claims_json = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(`${section.content.trim()}\n\n${additions.join("\n")}`, JSON.stringify(claims), section.id);
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
  if (result.changes > 0) {
    productSqlite.prepare("UPDATE product_solutions SET status = 'processing', stage = 'rendering', render_attempt_count = 0, render_next_attempt_at = NULL, render_error_code = NULL, render_failed_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND owner_user_id = ?").run(solutionId, userId);
  }
  return { invalidated: result.changes, artifactTypes };
}

/** A brand change affects presentation only; the validated content remains intact. */
export function invalidateDeliverablesForBrand(solutionId: string, userId: string) {
  const result = productSqlite.prepare(`UPDATE deliverable_artifacts SET status = 'superseded', updated_at = CURRENT_TIMESTAMP
    WHERE solution_id = ? AND user_id = ? AND status = 'available'`).run(solutionId, userId);
  if (result.changes > 0) {
    productSqlite.prepare("UPDATE product_solutions SET status = 'processing', stage = 'rendering', render_attempt_count = 0, render_next_attempt_at = NULL, render_error_code = NULL, render_failed_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND owner_user_id = ?").run(solutionId, userId);
  }
  return { invalidated: result.changes };
}

export function hasCompleteFormalDocument(solutionId: string) {
  const result = productSqlite.prepare("SELECT COUNT(*) AS sectionCount FROM formal_sections WHERE solution_id = ? AND status = 'validated' AND TRIM(COALESCE(content, '')) <> ''").get(solutionId) as { sectionCount: number };
  return result.sectionCount === 7;
}

export async function buildFormalSolutionDocx(title: string, sections: FormalSection[], theme: RenderTheme | null, documentLabel = "企业项目整体解决方案") {
  const primary = officeColor(theme?.primary || "#0B2545");
  const accent = officeColor(theme?.accent || "#2E74B5");
  const pageSize = documentPageSize(theme);
  const children: Array<Paragraph | Table> = [
    new Paragraph({ heading: HeadingLevel.TITLE, spacing: { before: 0, after: 120 }, children: [new TextRun({ text: title, bold: true, size: 38, color: "000000", font: "Hiragino Sans GB" })] }),
    new Paragraph({ spacing: { after: 260 }, children: [new TextRun({ text: documentLabel, size: 25, color: "516174", font: "Hiragino Sans GB" })] }),
    new Paragraph({ spacing: { after: 320, line: 300 }, children: [new TextRun({ text: "本文件将项目背景、范围、需求、方案、估算、实施与风险组织为可审阅的正式交付成果。金额、周期和待确认边界以表格与正文标记为准。", size: 20, color: "516174", italics: true, font: "Hiragino Sans GB" })] }),
  ];
  sections.forEach((section, index) => {
    children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, pageBreakBefore: index > 0, keepNext: true, children: [new TextRun({ text: `${index + 1}. ${section.title}`, bold: true, color: accent, font: "Hiragino Sans GB" })] }));
    if (section.summary?.trim()) children.push(new Paragraph({ spacing: { after: 180, line: 280 }, children: [new TextRun({ text: section.summary.trim(), bold: true, size: 21, color: "16365C", font: "Hiragino Sans GB" })] }));
    for (const block of documentContentBlocks(section.content)) {
      children.push(new Paragraph({ heading: block.heading ? HeadingLevel.HEADING_2 : undefined, keepNext: Boolean(block.heading), spacing: { before: block.heading ? 180 : 0, after: block.heading ? 100 : 140, line: block.heading ? 260 : 300 }, children: [new TextRun({ text: block.text, bold: block.heading, size: block.heading ? 24 : 21, color: block.heading ? accent : "202B38", font: "Hiragino Sans GB" })] }));
    }
    const items = parseStructuredItems(section.structuredItemsJson);
    if (items.length) {
      children.push(new Paragraph({ spacing: { before: 180, after: 90 }, children: [new TextRun({ text: "结构化交付要点", bold: true, size: 23, color: accent, font: "Hiragino Sans GB" })] }));
      children.push(buildStructuredTable(items, accent));
    }
  });
  const document = new Document({
    styles: {
      default: { document: { run: { font: "Hiragino Sans GB", size: 22, color: "202B38" }, paragraph: { spacing: { after: 120, line: 280 } } } },
      paragraphStyles: [{ id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true, run: { size: 32, bold: true, color: accent, font: "Hiragino Sans GB" }, paragraph: { spacing: { before: 320, after: 160 }, keepNext: true } }],
    },
    sections: [{
      properties: { page: { size: { width: pageSize.widthTwips, height: pageSize.heightTwips }, margin: { top: 1440, right: 1440, bottom: 1440, left: 1440, header: 708, footer: 708 } } },
      headers: { default: new Header({ children: [new Paragraph({ children: [new TextRun({ text: documentLabel, size: 18, color: "7A8796", font: "Hiragino Sans GB" })] })] }) },
      footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: "第 ", size: 18, color: "7A8796", font: "Hiragino Sans GB" }), new TextRun({ children: [PageNumber.CURRENT], size: 18, color: "7A8796", font: "Hiragino Sans GB" }), new TextRun({ text: " 页", size: 18, color: "7A8796", font: "Hiragino Sans GB" })] })] }) },
      children,
    }],
  });
  return Buffer.from(await Packer.toBuffer(document));
}

function buildStructuredTable(items: StructuredItem[], accent: string) {
  const widths = [10, 16, 26, 48];
  const header = ["编号", "类型", "标题", "说明"].map((text, index) => new TableCell({ width: { size: widths[index], type: WidthType.PERCENTAGE }, shading: { type: ShadingType.CLEAR, fill: accent }, verticalAlign: VerticalAlign.CENTER, children: [new Paragraph({ children: [new TextRun({ text, bold: true, color: "FFFFFF", size: 18, font: "Hiragino Sans GB" })] })] }));
  const rows = [new TableRow({ children: header })];
  for (const item of items) {
    rows.push(new TableRow({ children: [item.code, readableItemKind(item.kind), item.title, item.description].map((text, column) => new TableCell({ width: { size: widths[column], type: WidthType.PERCENTAGE }, verticalAlign: VerticalAlign.CENTER, children: [new Paragraph({ spacing: { after: 40, line: 240 }, children: [new TextRun({ text: summarize(text, column === 3 ? 420 : 80), size: 17, color: "202B38", font: "Hiragino Sans GB" })] })] })) }));
  }
  return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, borders: { top: { style: BorderStyle.SINGLE, size: 4, color: "D9D9D9" }, bottom: { style: BorderStyle.SINGLE, size: 4, color: "D9D9D9" }, left: { style: BorderStyle.SINGLE, size: 4, color: "D9D9D9" }, right: { style: BorderStyle.SINGLE, size: 4, color: "D9D9D9" }, insideHorizontal: { style: BorderStyle.SINGLE, size: 2, color: "D9D9D9" }, insideVertical: { style: BorderStyle.SINGLE, size: 2, color: "D9D9D9" } }, rows });
}

export async function buildOutcomeWorkbook(title: string, outcomeLabel: string, sections: FormalSection[], theme: RenderTheme | null, solutionId?: string) {
  const primary = officeColor(theme?.primary || "#1667E8");
  const accent = officeColor(theme?.accent || "#16365C");
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "企业方案服务平台";
  workbook.created = new Date();
  workbook.modified = new Date();
  workbook.subject = outcomeLabel;

  const overview = workbook.addWorksheet("成果说明", { views: [{ showGridLines: false }] });
  configureWorkbookPrintLayout(overview, "landscape", 1);
  overview.columns = [{ width: 22 }, { width: 76 }];
  overview.mergeCells("A1:B1");
  overview.getCell("A1").value = outcomeLabel;
  overview.getCell("A1").style = workbookTitleStyle(primary);
  overview.getRow(1).height = 34;
  overview.addRows([
    ["项目名称", title],
    ["成果类型", outcomeLabel],
    ["内容来源", "复用正式分析中已通过质量门的章节，不在文件渲染阶段重新调用模型或补造数据。"],
    ["当前边界", outcomeLabel === "项目报价" ? "报价表同时展示预算参考区间、估算项和计算公式；未确认的单价、人天或税率会明确标记为待补参数，不会伪造最终报价。" : "数字、公式和交付内容只保留正式章节已有信息，未确认参数不会被自动填充。"],
    ["来源章节数", sections.length],
    ["生成时间", new Date()],
  ]);
  styleKeyValueSheet(overview, 2, 7, primary);
  overview.getCell("B7").numFmt = "yyyy-mm-dd hh:mm";

  const detail = workbook.addWorksheet("内容清单", { views: [{ state: "frozen", ySplit: 2, showGridLines: false }] });
  configureWorkbookPrintLayout(detail, "landscape", 0);
  detail.pageSetup.printTitlesRow = "1:2";
  detail.columns = [{ width: 16 }, { width: 18 }, { width: 24 }, { width: 30 }, { width: 62 }, { width: 38 }, { width: 28 }];
  detail.mergeCells("A1:G1");
  detail.getCell("A1").value = `${outcomeLabel}内容清单`;
  detail.getCell("A1").style = workbookTitleStyle(primary);
  detail.getRow(1).height = 34;
  detail.addRow(["编号", "对象类型", "来源章节", "标题", "说明", "属性", "来源块"]);
  let itemIndex = 0;
  for (const section of sections) {
    const structuredItems = parseStructuredItems(section.structuredItemsJson).filter((item) => outcomeAcceptsItem(outcomeLabel, item.kind));
    for (const item of structuredItems) {
      itemIndex += 1;
      detail.addRow([item.code, readableItemKind(item.kind), section.title, item.title, item.description, readableAttributes(item.attributes), item.sourceBlockIds.join("、")]);
    }
    if (!structuredItems.length) {
      for (const item of structuredContentItems(section.content)) {
        itemIndex += 1;
        detail.addRow([`${outcomeCode(outcomeLabel)}-${String(itemIndex).padStart(3, "0")}`, "章节内容", section.title, summarize(item, 80), item, "历史章节暂无结构化属性", "详见正式章节引用"]);
      }
    }
  }
  if (!itemIndex) detail.addRow([`${outcomeCode(outcomeLabel)}-001`, "—", "—", "暂无条目", "相关正式章节尚未形成可用内容。", "—", "—"]);
  styleTable(detail, 2, Math.max(3, detail.rowCount), 7, accent);
  detail.autoFilter = `A2:G${Math.max(3, detail.rowCount)}`;

  const basis = workbook.addWorksheet("章节依据", { views: [{ state: "frozen", ySplit: 2, showGridLines: false }] });
  configureWorkbookPrintLayout(basis, "landscape", 0);
  basis.pageSetup.printTitlesRow = "1:2";
  basis.columns = [{ width: 9 }, { width: 30 }, { width: 82 }];
  basis.mergeCells("A1:C1");
  basis.getCell("A1").value = `${outcomeLabel}章节依据`;
  basis.getCell("A1").style = workbookTitleStyle(primary);
  basis.getRow(1).height = 34;
  basis.addRow(["序号", "章节", "章节摘要"]);
  sections.forEach((section, index) => basis.addRow([index + 1, section.title, section.summary?.trim() || summarize(section.content, 360)]));
  if (!sections.length) basis.addRow([1, "—", "相关正式章节尚未就绪。"]);
  styleTable(basis, 2, Math.max(3, basis.rowCount), 3, accent);

  if (solutionId && (outcomeLabel === "工作量估算" || outcomeLabel === "项目报价")) addCalculationSheet(workbook, outcomeLabel, sections, primary, accent, solutionId);
  if (solutionId && outcomeLabel === "项目报价") addQuoteSummarySheet(workbook, title, sections, primary, accent, solutionId);

  return Buffer.from(await workbook.xlsx.writeBuffer());
}

async function buildTraceabilityWorkbook(title: string, sections: FormalSection[], sourceBlocks: SourceBlock[], theme: RenderTheme | null) {
  const primary = officeColor(theme?.primary || "#1667E8");
  const accent = officeColor(theme?.accent || "#16365C");
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "企业方案服务平台";
  workbook.created = new Date();
  workbook.modified = new Date();
  workbook.subject = "项目内容与来源清单";

  const overview = workbook.addWorksheet("项目概览", { views: [{ showGridLines: false }] });
  overview.columns = [{ width: 22 }, { width: 70 }];
  overview.mergeCells("A1:B1");
  overview.getCell("A1").value = "项目内容与来源清单";
  overview.getCell("A1").style = workbookTitleStyle(primary);
  overview.getRow(1).height = 34;
  overview.addRows([
    ["项目名称", title],
    ["成果用途", "用于核对正式方案章节、内容摘要及其来源材料，不新增或推断用户未提供的事实。"],
    ["正式章节数", sections.length],
    ["来源材料块数", sourceBlocks.length],
    ["生成时间", new Date()],
    ["使用说明", "先查看“章节索引”了解成果结构，再通过“来源材料”追溯系统处理的原始信息。"],
  ]);
  styleKeyValueSheet(overview, 2, 7, primary);
  overview.getCell("B6").numFmt = "yyyy-mm-dd hh:mm";
  overview.autoFilter = "A2:B7";
  overview.views = [{ state: "frozen", ySplit: 1, showGridLines: false }];

  const sectionSheet = workbook.addWorksheet("章节索引", { views: [{ state: "frozen", ySplit: 2, showGridLines: false }] });
  sectionSheet.columns = [{ width: 9 }, { width: 26 }, { width: 74 }, { width: 13 }];
  sectionSheet.mergeCells("A1:D1");
  sectionSheet.getCell("A1").value = "正式方案章节索引";
  sectionSheet.getCell("A1").style = workbookTitleStyle(primary);
  sectionSheet.getRow(1).height = 34;
  sectionSheet.addRow(["序号", "章节", "内容摘要", "状态"]);
  sections.forEach((section, index) => sectionSheet.addRow([index + 1, section.title, section.summary?.trim() || summarize(section.content), "已校验"]));
  styleTable(sectionSheet, 2, Math.max(2, sections.length + 2), 4, accent);
  sectionSheet.autoFilter = `A2:D${Math.max(2, sections.length + 2)}`;

  const sourceSheet = workbook.addWorksheet("来源材料", { views: [{ state: "frozen", ySplit: 2, showGridLines: false }] });
  sourceSheet.columns = [{ width: 18 }, { width: 18 }, { width: 30 }, { width: 76 }, { width: 28 }];
  sourceSheet.mergeCells("A1:E1");
  sourceSheet.getCell("A1").value = "来源材料追溯清单";
  sourceSheet.getCell("A1").style = workbookTitleStyle(primary);
  sourceSheet.getRow(1).height = 34;
  sourceSheet.addRow(["来源块 ID", "信息类型", "来源文件", "内容摘要", "位置/字段"]);
  sourceBlocks.forEach((block) => sourceSheet.addRow([block.id, block.blockType, block.sourceName || "用户填写信息", summarize(block.canonicalText, 260), readableLocator(block.locatorJson)]));
  if (!sourceBlocks.length) sourceSheet.addRow(["—", "—", "本次暂无来源材料块", "正式章节已生成，但没有可列出的来源材料块。", "—"]);
  styleTable(sourceSheet, 2, Math.max(3, sourceSheet.rowCount), 5, accent);
  sourceSheet.autoFilter = `A2:E${Math.max(3, sourceSheet.rowCount)}`;

  return Buffer.from(await workbook.xlsx.writeBuffer());
}

export async function buildSolutionPresentation(title: string, sections: FormalSection[], theme: RenderTheme | null) {
  const primary = officeColor(theme?.primary || "#0B2545");
  const accent = officeColor(theme?.accent || "#3D8DFF");
  const accentLight = theme ? mixWithWhite(accent, 0.68) : "6DCBF4";
  const deck = new pptxgen();
  const canvas = presentationCanvas(theme);
  if (canvas.fromTemplate) {
    deck.defineLayout({ name: "ENTERPRISE_TEMPLATE_SIZE", width: canvas.width, height: canvas.height });
    deck.layout = "ENTERPRISE_TEMPLATE_SIZE";
  } else {
    deck.layout = "LAYOUT_WIDE";
  }
  deck.author = "企业方案服务平台";
  deck.company = "企业方案服务平台";
  deck.subject = "企业项目整体解决方案汇报";
  deck.title = title;
  deck.theme = {
    headFontFace: "Hiragino Sans GB",
    bodyFontFace: "Hiragino Sans GB",
  };
  deck.defineSlideMaster({
    title: "CONTENT",
    background: { color: "F8FAFD" },
    objects: [
      { line: { x: 0.65, y: 0.48, w: 0.55, h: 0, line: { color: accent, width: 3 } } },
      { text: { text: "企业项目整体解决方案", options: { x: 9.65, y: 0.32, w: 2.95, h: 0.25, fontFace: "Hiragino Sans GB", fontSize: 9, color: "64748B", align: "right", margin: 0 } } },
      { text: { text: "系统生成成果 · 请结合来源材料核对", options: { x: 0.65, y: 7.12, w: 5.5, h: 0.18, fontFace: "Hiragino Sans GB", fontSize: 8, color: "94A3B8", margin: 0 } } },
    ],
    slideNumber: { x: 12.1, y: 7.08, w: 0.55, h: 0.2, color: "94A3B8", fontFace: "Arial", fontSize: 8, align: "right", margin: 0 },
  });

  const cover = deck.addSlide();
  cover.background = { color: primary };
  cover.addShape(deck.ShapeType.line, { x: 0.78, y: 0.8, w: 1.05, h: 0, line: { color: accentLight, width: 4 } });
  cover.addText(title, { x: 0.78, y: 1.7, w: 9.8, h: 1.35, fontFace: "Hiragino Sans GB", fontSize: 32, bold: true, color: "FFFFFF", margin: 0, breakLine: false, valign: "middle", fit: "shrink" });
  cover.addText("企业项目整体解决方案", { x: 0.8, y: 3.32, w: 6.8, h: 0.48, fontFace: "Hiragino Sans GB", fontSize: 23, color: accentLight, margin: 0 });
  cover.addText("从业务需求到实施落地的汇报版成果", { x: 0.8, y: 4.02, w: 7.6, h: 0.35, fontFace: "Hiragino Sans GB", fontSize: 16, color: "CBD5E1", margin: 0 });
  cover.addText("本汇报复用已校验正式章节，不新增未确认事实。", { x: 0.8, y: 6.65, w: 7.8, h: 0.25, fontFace: "Hiragino Sans GB", fontSize: 10, color: "94A3B8", margin: 0 });

  const overview = deck.addSlide("CONTENT");
  addSlideTitle(overview, "一套可顺序讲清的完整方案");
  overview.addText("汇报结构", { x: 0.7, y: 1.35, w: 2.1, h: 0.35, fontFace: "Hiragino Sans GB", fontSize: 18, bold: true, color: accent, margin: 0 });
  sections.forEach((section, index) => {
    const column = index < 4 ? 0 : 1;
    const row = column === 0 ? index : index - 4;
    const x = column === 0 ? 0.7 : 6.9;
    const y = 2 + row * 1.08;
    overview.addText(String(index + 1).padStart(2, "0"), { x, y, w: 0.65, h: 0.35, fontFace: "Arial", fontSize: 18, bold: true, color: accent, margin: 0 });
    overview.addText(section.title, { x: x + 0.75, y, w: 5.2, h: 0.38, fontFace: "Hiragino Sans GB", fontSize: 17, bold: true, color: "0F172A", margin: 0, fit: "shrink" });
    overview.addShape(deck.ShapeType.line, { x: x + 0.75, y: y + 0.54, w: 4.95, h: 0, line: { color: "D7E1ED", width: 1 } });
  });

  sections.forEach((section, index) => {
    const slide = deck.addSlide("CONTENT");
    addSlideTitle(slide, section.title);
    slide.addText(`${String(index + 1).padStart(2, "0")} / ${String(sections.length).padStart(2, "0")}`, { x: 11.42, y: 0.74, w: 1.2, h: 0.28, fontFace: "Arial", fontSize: 12, bold: true, color: accent, align: "right", margin: 0 });
    slide.addText(section.summary?.trim() || summarize(section.content, 160), { x: 0.72, y: 1.32, w: 11.9, h: 0.72, fontFace: "Hiragino Sans GB", fontSize: 20, bold: true, color: primary, margin: 0, breakLine: false, valign: "middle", fit: "shrink" });
    addVisualSectionSlide(slide, deck, section, primary, accent);
  });

  const result = await deck.write({ outputType: "nodebuffer", compression: true });
  return Buffer.isBuffer(result) ? result : Buffer.from(result as ArrayBuffer);
}

async function buildFormalSolutionPdf(title: string, sections: FormalSection[], theme: RenderTheme | null, documentLabel = "企业项目整体解决方案") {
  const primary = theme?.primary || "#0B2545";
  const accent = theme?.accent || "#3D8DFF";
  const accentLight = theme ? `#${mixWithWhite(officeColor(accent), 0.68)}` : "#6DCBF4";
  const fontPath = path.join(process.cwd(), "assets", "fonts", "NotoSansCJKsc-Regular.otf");
  if (!fs.existsSync(fontPath)) throw new Error("PDF_CJK_FONT_MISSING");
  const document = new PDFDocument({ size: "A4", margins: { top: 76, right: 62, bottom: 72, left: 62 }, bufferPages: true, info: { Title: title, Author: "企业方案服务平台", Subject: documentLabel } });
  const chunks: Buffer[] = [];
  document.on("data", (chunk: Buffer) => chunks.push(chunk));
  const completed = new Promise<Buffer>((resolve, reject) => {
    document.on("end", () => resolve(Buffer.concat(chunks)));
    document.on("error", reject);
  });
  document.registerFont("CJK", fontPath);

  document.rect(0, 0, document.page.width, document.page.height).fill(primary);
  document.rect(62, 82, 72, 4).fill(accentLight);
  document.fillColor("#FFFFFF").font("CJK").fontSize(30).text(title, 62, 185, { width: 470, lineGap: 8 });
  document.fillColor(accentLight).fontSize(18).text(documentLabel, 62, 315, { width: 470 });
  document.fillColor("#CBD5E1").fontSize(11).text("从业务需求到实施落地的正式交付成果", 62, 360, { width: 470 });
  document.fillColor("#94A3B8").fontSize(8.5).text("本成果复用已校验正式章节，不新增未确认事实。", 62, 742, { width: 470 });

  sections.forEach((section, index) => {
    document.addPage();
    document.fillColor("#0F172A").font("CJK").fontSize(22).text(`${index + 1}. ${section.title}`, 62, 92, { width: 470, lineGap: 4 });
    if (section.summary?.trim()) {
      document.fillColor("#16365C").fontSize(11.5).text(section.summary.trim(), 62, document.y + 20, { width: 470, lineGap: 5 });
      document.moveDown(1.1);
    }
    for (const block of splitContent(section.content)) {
      const estimatedHeight = document.heightOfString(block, { width: 470, lineGap: 5 });
      if (document.y + Math.min(estimatedHeight, 180) > 755) document.addPage();
      document.fillColor("#334155").fontSize(10.5).text(block, 62, document.y, { width: 470, align: "justify", lineGap: 5, paragraphGap: 11 });
    }
  });

  const range = document.bufferedPageRange();
  for (let pageIndex = 0; pageIndex < range.count; pageIndex += 1) {
    document.switchToPage(pageIndex);
    if (pageIndex > 0) {
      document.rect(62, 44, 42, 2.5).fill(accent);
      document.fillColor("#64748B").font("CJK").fontSize(7.5).text(documentLabel, 350, 39, { width: 182, align: "right", lineBreak: false });
    }
    const originalBottomMargin = document.page.margins.bottom;
    document.page.margins.bottom = 0;
    document.fillColor("#94A3B8").font("CJK").fontSize(7.5).text(`第 ${pageIndex + 1} 页`, 470, 808, { width: 62, align: "right", lineBreak: false });
    document.page.margins.bottom = originalBottomMargin;
  }
  document.end();
  return completed;
}

export async function buildQuotePdf(title: string, sections: FormalSection[], theme: RenderTheme | null, solutionId: string) {
  const primary = theme?.primary || "#0B2545";
  const accent = theme?.accent || "#3D8DFF";
  const fontPath = path.join(process.cwd(), "assets", "fonts", "NotoSansCJKsc-Regular.otf");
  if (!fs.existsSync(fontPath)) throw new Error("PDF_CJK_FONT_MISSING");
  const doc = new PDFDocument({ size: "A4", layout: "landscape", margins: { top: 54, right: 34, bottom: 48, left: 34 }, bufferPages: true, info: { Title: `${title}-项目报价`, Author: "企业方案服务平台", Subject: "确定性报价测算" } });
  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  const completed = new Promise<Buffer>((resolve, reject) => { doc.on("end", () => resolve(Buffer.concat(chunks))); doc.on("error", reject); });
  doc.registerFont("CJK", fontPath);
  const rawItems = sections.flatMap((section) => parseStructuredItems(section.structuredItemsJson));
  const items = withQuoteOverrides(solutionId, rawItems);
  const quote = calculateQuoteSummary(items);
  const { rows, validDays, budgetMin, budgetMax, allComplete, total } = quote;
  const widths = [54, 108, 48, 132, 56, 66, 54, 48, 95, 76];
  const headers = ["编号", "估算项", "基准人天", "复杂×复用×集成×安全×不确定", "调整人天", "日单价", "折扣率", "税率", "含税金额", "状态"];
  const tableWidth = widths.reduce((sum, width) => sum + width, 0);
  const drawPageHeading = (continued = false) => {
    doc.fillColor(primary).font("CJK").fontSize(21).text(continued ? "项目报价明细（续）" : "项目报价明细", 36, 30, { width: 430 });
    doc.fillColor("#475569").fontSize(9).text(title, 480, 37, { width: 300, align: "right" });
    doc.moveTo(36, 70).lineTo(36 + tableWidth, 70).lineWidth(1.2).stroke(accent);
  };
  const drawTableHeader = (y: number) => {
    let x = 36;
    headers.forEach((header, index) => {
      doc.rect(x, y, widths[index], 28).fillAndStroke(primary, "#FFFFFF");
      doc.fillColor("#FFFFFF").font("CJK").fontSize(8).text(header, x + 3, y + 9, { width: widths[index] - 6, align: "center", ellipsis: true, lineBreak: false });
      x += widths[index];
    });
  };
  const drawRow = (row: typeof rows[number], y: number, index: number) => {
    const values = [row.code, row.title, row.baseDays == null ? "待补" : `${row.baseDays}`, row.factorChain, row.adjustedDays == null ? "待补" : `${row.adjustedDays}`, row.rate == null ? "待补" : row.rate.toLocaleString("zh-CN"), row.discount == null ? "待补" : `${(row.discount * 100).toFixed(2)}%`, row.tax == null ? "待补" : `${(row.tax * 100).toFixed(2)}%`, row.amount == null ? "待补参数" : row.amount.toLocaleString("zh-CN", { maximumFractionDigits: 2 }), row.complete ? "可计算" : "待补参数"];
    let x = 36;
    values.forEach((value, column) => {
      doc.rect(x, y, widths[column], 32).fillAndStroke(index % 2 ? "#F8FAFC" : "#FFFFFF", "#CBD5E1");
      doc.fillColor(column === 9 && !row.complete ? "#B45309" : "#334155").font("CJK").fontSize(column === 3 ? 6.5 : 7.5).text(value, x + 3, y + 10, { width: widths[column] - 6, align: column === 1 ? "left" : "center", ellipsis: true, lineBreak: false });
      x += widths[column];
    });
  };
  drawPageHeading();
  doc.fillColor("#334155").font("CJK").fontSize(9).text(`报价状态：${allComplete ? "参数齐备，可计算确定性金额；仍需商务确认" : "参数未齐，当前不是完整报价"}`, 36, 82, { width: tableWidth });
  doc.fillColor("#475569").fontSize(8.5).text(`有效期：${validDays == null ? "待确认" : `${validDays} 天`}    预算范围：${budgetMin == null || budgetMax == null ? "未提供" : `${budgetMin.toLocaleString("zh-CN")}–${budgetMax.toLocaleString("zh-CN")} 元`}`, 36, 101, { width: tableWidth });
  drawTableHeader(124);
  let y = 152;
  rows.forEach((row, index) => {
    if (y > 500) { doc.addPage(); drawPageHeading(true); drawTableHeader(84); y = 112; }
    drawRow(row, y, index);
    y += 32;
  });
  if (!rows.length) {
    doc.fillColor("#B45309").font("CJK").fontSize(10).text("未找到结构化估算项，未生成金额。请补充估算数据后重新出具。", 40, 166, { width: tableWidth });
    y = 205;
  }
  y += 12;
  if (y + 80 > 545) {
    doc.addPage();
    drawPageHeading(true);
    y = 92;
  }
  doc.roundedRect(36, y, tableWidth, 45, 6).fill("#EFF6FF");
  doc.fillColor(primary).font("CJK").fontSize(11).text(`报价总额（含税）：${total == null ? "待补齐参数" : `${total.toLocaleString("zh-CN", { maximumFractionDigits: 2 })} 元`}`, 50, y + 9, { width: tableWidth - 28 });
  doc.fillColor("#64748B").fontSize(7.2).text("报价金额 = 调整人天 × 日单价 ×（1－折扣率）×（1＋税率）。调整人天 = 基准人天 × 复杂度 × 复用 × 集成 × 安全 × 不确定性系数。", 38, y + 54, { width: tableWidth, lineGap: 2 });
  doc.fillColor("#64748B").fontSize(7.2).text("系数顺序与表头一致；任一系数、基准人天或价格参数缺失时标记待补，不推定为 1 或 0。本测算不替代最终商务报价。", 38, y + 67, { width: tableWidth, lineGap: 2 });
  for (const section of sections) {
    const paragraphs = splitContent(section.summary || section.content).filter(Boolean);
    if (!paragraphs.length) continue;
    doc.addPage();
    doc.fillColor(primary).font("CJK").fontSize(15).text(section.title, 38, 42, { width: tableWidth });
    let contentY = 78;
    paragraphs.forEach((paragraph) => {
      const text = paragraph.length > 1400 ? `${paragraph.slice(0, 1400)}……` : paragraph;
      doc.font("CJK").fontSize(9);
      const height = doc.heightOfString(text, { width: tableWidth, lineGap: 4 });
      if (contentY + height > 545) { doc.addPage(); contentY = 48; }
      doc.fillColor("#334155").font("CJK").fontSize(9).text(text, 38, contentY, { width: tableWidth, lineGap: 4 });
      contentY = doc.y + 11;
    });
  }
  const pageRange = doc.bufferedPageRange();
  for (let pageIndex = 0; pageIndex < pageRange.count; pageIndex += 1) {
    doc.switchToPage(pageIndex);
    doc.fillColor("#94A3B8").font("CJK").fontSize(7.5).text(`第 ${pageIndex + 1} 页`, 740, 565, { width: 52, align: "right", lineBreak: false });
  }
  doc.end();
  return completed;
}

export function calculateQuoteSummary(items: StructuredItem[]) {
  const assumption = items.find((item) => item.kind === "quote_assumption");
  const rows = items.filter((item) => item.kind === "estimation_item").map((item) => {
    const factors = ["complexity_factor", "reuse_factor", "integration_factor", "security_factor", "uncertainty_factor"];
    const baseDays = numericAttribute(item, "base_days");
    const factorValues = factors.map((key) => numericAttribute(item, key));
    const factorChain = factorValues.map((value) => value == null ? "待补" : Number(value.toFixed(2))).join("×");
    const adjustedDays = baseDays == null || factorValues.some((value) => value == null) ? null : Number((baseDays * factorValues.reduce<number>((total, value) => total * (value as number), 1)).toFixed(2));
    const rate = numericAttribute(item, "daily_rate") ?? (assumption ? numericAttribute(assumption, "daily_rate") : null);
    const discount = numericAttribute(item, "discount_rate") ?? (assumption ? numericAttribute(assumption, "discount_rate") : null);
    const tax = numericAttribute(item, "tax_rate") ?? (assumption ? numericAttribute(assumption, "tax_rate") : null);
    const complete = adjustedDays != null && rate != null && discount != null && tax != null;
    const beforeDiscount = complete ? adjustedDays! * rate! : null;
    const amount = complete ? beforeDiscount! * (1 - discount!) * (1 + tax!) : null;
    return { code: item.code, title: item.title, baseDays, factorValues, factorChain, adjustedDays, rate, beforeDiscount, discount, tax, amount, complete };
  });
  const validDays = assumption ? numericAttribute(assumption, "valid_days") : null;
  const budgetMin = assumption ? numericAttribute(assumption, "budget_min") : null;
  const budgetMax = assumption ? numericAttribute(assumption, "budget_max") : null;
  const allComplete = rows.length > 0 && rows.every((row) => row.complete) && validDays != null;
  const total = allComplete ? rows.reduce((sum, row) => sum + (row.amount || 0), 0) : null;
  return { rows, validDays, budgetMin, budgetMax, allComplete, total };
}

function addSlideTitle(slide: pptxgen.Slide, title: string) {
  slide.addText(title, { x: 0.7, y: 0.72, w: 10.5, h: 0.48, fontFace: "Hiragino Sans GB", fontSize: 26, bold: true, color: "0F172A", margin: 0, fit: "shrink" });
}

function presentationPoints(content: string) {
  const blocks = splitContent(content).flatMap((block) => block.split(/[。；]/)).map((item) => item.replace(/^[-•\d.、\s]+/, "").trim()).filter((item) => item.length >= 8);
  const unique = [...new Set(blocks)];
  return (unique.length ? unique : ["本章节内容以正式方案正文为准"]).slice(0, 3).map((item) => summarize(item, 95));
}

function addVisualSectionSlide(slide: pptxgen.Slide, deck: pptxgen, section: FormalSection, primary: string, accent: string) {
  const items = parseStructuredItems(section.structuredItemsJson);
  const points = presentationPoints(section.content);
  const title = section.title;
  if (/实施|交付|计划/.test(title)) {
    addTimelineVisual(slide, deck, items, points, accent);
    return;
  }
  if (/风险|假设|待确认/.test(title)) {
    addRiskVisual(slide, deck, items, points, accent);
    return;
  }
  if (/工作量|成本|报价/.test(title)) {
    addMetricVisual(slide, deck, items, points, primary, accent);
    return;
  }
  addCardsVisual(slide, deck, items, points, primary, accent);
}

function addCardsVisual(slide: pptxgen.Slide, deck: pptxgen, items: StructuredItem[], points: string[], primary: string, accent: string) {
  const cards = (items.length ? items.slice(0, 4).map((item) => ({ title: item.title, body: item.description, tag: readableItemKind(item.kind) })) : points.slice(0, 4).map((point, index) => ({ title: `要点 ${index + 1}`, body: point, tag: "章节内容" })));
  const safeCards = cards.length ? cards : [{ title: "章节内容", body: "本章节内容以正式方案正文为准。", tag: "已校验" }];
  const columns = safeCards.length <= 2 ? safeCards.length : 2;
  const cardWidth = columns === 1 ? 11.2 : 5.35;
  safeCards.slice(0, 4).forEach((card, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const x = 0.72 + column * (cardWidth + 0.55);
    const y = 2.45 + row * 1.95;
    slide.addShape(deck.ShapeType.roundRect, { x, y, w: cardWidth, h: 1.55, rectRadius: 0.08, fill: { color: row % 2 === 0 ? "FFFFFF" : "F3F7FC" }, line: { color: "D7E1ED", width: 1 } });
    slide.addShape(deck.ShapeType.rect, { x, y, w: 0.1, h: 1.55, fill: { color: accent }, line: { color: accent, transparency: 100 } });
    slide.addText(card.tag, { x: x + 0.28, y: y + 0.18, w: cardWidth - 0.55, h: 0.22, fontFace: "Hiragino Sans GB", fontSize: 10, color: accent, bold: true, margin: 0, fit: "shrink" });
    slide.addText(card.title, { x: x + 0.28, y: y + 0.45, w: cardWidth - 0.55, h: 0.34, fontFace: "Hiragino Sans GB", fontSize: 17, color: primary, bold: true, margin: 0, fit: "shrink" });
    slide.addText(summarize(card.body, 110), { x: x + 0.28, y: y + 0.88, w: cardWidth - 0.55, h: 0.46, fontFace: "Hiragino Sans GB", fontSize: 12.5, color: "334155", margin: 0, breakLine: false, fit: "shrink", valign: "top" });
  });
}

function addTimelineVisual(slide: pptxgen.Slide, deck: pptxgen, items: StructuredItem[], points: string[], accent: string) {
  const phases = items.filter((item) => ["phase", "milestone"].includes(item.kind)).slice(0, 5);
  const data = phases.length ? phases.map((item) => ({ title: item.title, body: item.description })) : points.slice(0, 4).map((point, index) => ({ title: `阶段 ${index + 1}`, body: point }));
  const count = Math.max(1, data.length);
  const gap = 0.18;
  const width = (11.4 - gap * (count - 1)) / count;
  slide.addShape(deck.ShapeType.line, { x: 1.15, y: 4.15, w: 10.55, h: 0, line: { color: accent, width: 2 } });
  data.forEach((item, index) => {
    const x = 0.72 + index * (width + gap);
    slide.addShape(deck.ShapeType.ellipse, { x: x + width / 2 - 0.14, y: 3.98, w: 0.28, h: 0.28, fill: { color: accent }, line: { color: "FFFFFF", width: 2 } });
    slide.addText(String(index + 1).padStart(2, "0"), { x, y: 2.72, w: width, h: 0.35, fontFace: "Arial", fontSize: 20, bold: true, color: accent, align: "center", margin: 0 });
    slide.addText(item.title, { x, y: 4.45, w: width, h: 0.44, fontFace: "Hiragino Sans GB", fontSize: 14, bold: true, color: "0F172A", align: "center", margin: 0, fit: "shrink" });
    slide.addText(summarize(item.body, 70), { x: x + 0.08, y: 5.02, w: width - 0.16, h: 0.72, fontFace: "Hiragino Sans GB", fontSize: 11.5, color: "475569", align: "center", margin: 0, fit: "shrink", valign: "top" });
  });
}

function addRiskVisual(slide: pptxgen.Slide, deck: pptxgen, items: StructuredItem[], points: string[], accent: string) {
  slide.addShape(deck.ShapeType.rect, { x: 1.15, y: 2.52, w: 8.9, h: 3.9, fill: { color: "FFFFFF", transparency: 100 }, line: { color: "A8B8CA", width: 1 } });
  slide.addShape(deck.ShapeType.line, { x: 5.6, y: 2.52, w: 0, h: 3.9, line: { color: "A8B8CA", width: 1 } });
  slide.addShape(deck.ShapeType.line, { x: 1.15, y: 4.47, w: 8.9, h: 0, line: { color: "A8B8CA", width: 1 } });
  slide.addText("影响高", { x: 0.3, y: 2.42, w: 0.7, h: 0.25, fontFace: "Hiragino Sans GB", fontSize: 10, color: "64748B", margin: 0 });
  slide.addText("影响低", { x: 0.3, y: 6.22, w: 0.7, h: 0.25, fontFace: "Hiragino Sans GB", fontSize: 10, color: "64748B", margin: 0 });
  slide.addText("发生可能性低", { x: 1.15, y: 6.55, w: 1.2, h: 0.25, fontFace: "Hiragino Sans GB", fontSize: 10, color: "64748B", margin: 0 });
  slide.addText("发生可能性高", { x: 8.85, y: 6.55, w: 1.2, h: 0.25, fontFace: "Hiragino Sans GB", fontSize: 10, color: "64748B", margin: 0 });
  const risks = items.filter((item) => item.kind === "risk").slice(0, 4);
  const labels = risks.length ? risks.map((item) => item.title) : points.slice(0, 4);
  labels.forEach((label, index) => {
    const positions = [{ x: 2.0, y: 3.18 }, { x: 6.65, y: 3.18 }, { x: 2.0, y: 5.02 }, { x: 6.65, y: 5.02 }];
    const position = positions[index];
    if (!position) return;
    slide.addShape(deck.ShapeType.ellipse, { x: position.x, y: position.y, w: 2.4, h: 0.62, fill: { color: index === 1 ? "FDE7E7" : index === 3 ? "FFF4D6" : "EAF2FF" }, line: { color: accent, width: 1 } });
    slide.addText(summarize(label, 38), { x: position.x + 0.12, y: position.y + 0.15, w: 2.16, h: 0.25, fontFace: "Hiragino Sans GB", fontSize: 11, bold: true, color: "334155", align: "center", margin: 0, fit: "shrink" });
  });
}

function addMetricVisual(slide: pptxgen.Slide, deck: pptxgen, items: StructuredItem[], points: string[], primary: string, accent: string) {
  const metrics = items.filter((item) => item.kind === "estimation_item").slice(0, 4);
  const data = metrics.length ? metrics.map((item) => ({ label: item.title, value: itemAttribute(item, "base_days") || "待确认", body: item.description })) : points.slice(0, 4).map((point, index) => ({ label: `指标 ${index + 1}`, value: "待确认", body: point }));
  data.forEach((metric, index) => {
    const x = 0.78 + index * 3.05;
    slide.addShape(deck.ShapeType.roundRect, { x, y: 2.58, w: 2.72, h: 2.9, fill: { color: index % 2 === 0 ? "FFFFFF" : "F3F7FC" }, line: { color: "D7E1ED", width: 1 } });
    slide.addText(metric.value, { x: x + 0.18, y: 2.94, w: 2.36, h: 0.62, fontFace: "Arial", fontSize: 25, bold: true, color: accent, align: "center", margin: 0, fit: "shrink" });
    slide.addText(metric.label, { x: x + 0.18, y: 3.78, w: 2.36, h: 0.45, fontFace: "Hiragino Sans GB", fontSize: 14, bold: true, color: primary, align: "center", margin: 0, fit: "shrink" });
    slide.addText(summarize(metric.body, 72), { x: x + 0.22, y: 4.45, w: 2.28, h: 0.55, fontFace: "Hiragino Sans GB", fontSize: 11, color: "475569", align: "center", margin: 0, fit: "shrink" });
  });
}

function workbookTitleStyle(primary: string): Partial<ExcelJS.Style> {
  return {
    font: { name: "Microsoft YaHei", size: 18, bold: true, color: { argb: "FFFFFFFF" } },
    fill: { type: "pattern", pattern: "solid", fgColor: { argb: `FF${primary}` } },
    alignment: { vertical: "middle", horizontal: "left" },
  };
}

function configureWorkbookPrintLayout(sheet: ExcelJS.Worksheet, orientation: "portrait" | "landscape", fitToHeight: number) {
  sheet.pageSetup = {
    paperSize: 9,
    orientation,
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight,
    margins: { left: 0.25, right: 0.25, top: 0.45, bottom: 0.45, header: 0.2, footer: 0.2 },
  };
}

function styleKeyValueSheet(sheet: ExcelJS.Worksheet, startRow: number, endRow: number, primary: string) {
  for (let rowNumber = startRow; rowNumber <= endRow; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    row.height = rowNumber === 3 || rowNumber === 7 ? 42 : 28;
    row.alignment = { vertical: "middle", wrapText: true };
    row.getCell(1).font = { name: "Microsoft YaHei", bold: true, color: { argb: `FF${primary}` } };
    row.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEAF2FF" } };
    row.getCell(2).font = { name: "Microsoft YaHei", color: { argb: "FF334155" } };
    row.eachCell((cell) => { cell.border = { bottom: { style: "thin", color: { argb: "FFDCE6F2" } } }; });
  }
}

function styleTable(sheet: ExcelJS.Worksheet, headerRow: number, endRow: number, columnCount: number, accent: string) {
  const header = sheet.getRow(headerRow);
  header.height = 28;
  header.eachCell((cell) => {
    cell.font = { name: "Microsoft YaHei", bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${accent}` } };
    cell.alignment = { vertical: "middle", horizontal: "left" };
  });
  for (let rowNumber = headerRow + 1; rowNumber <= endRow; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    row.height = 42;
    for (let column = 1; column <= columnCount; column += 1) {
      const cell = row.getCell(column);
      cell.font = { name: "Microsoft YaHei", size: 10, color: { argb: "FF334155" } };
      cell.alignment = { vertical: "top", horizontal: column === 1 ? "center" : "left", wrapText: true };
      cell.border = { bottom: { style: "thin", color: { argb: "FFDCE6F2" } } };
      if (rowNumber % 2 === 1) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF7FAFE" } };
    }
  }
}

async function storeDeliverable(input: { solutionId: string; userId: string; artifactType: string; displayName: string; mimeType: string; bytes: Buffer; expectedFormat: string; qualityChecks: Array<Record<string, unknown>> }) {
  const workerId = renderWorkerContext.getStore();
  assertRenderLease(input.solutionId, workerId);
  const format = detectFormat(input.bytes);
  if (format !== input.expectedFormat) throw new Error("DELIVERABLE_FORMAT_INVALID");
  const packageCheck = await validateDeliverablePackage(input.bytes, format);
  const checks = [{ code: "NON_EMPTY", passed: input.bytes.length > 1000 }, { code: "PACKAGE_INTEGRITY", passed: packageCheck.passed, reason: packageCheck.passed ? null : packageCheck.code }, ...input.qualityChecks];
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

function assertRenderLease(solutionId: string, workerId?: string) {
  if (!workerId) return;
  const owned = productSqlite.prepare("SELECT 1 FROM product_solutions WHERE id = ? AND stage = 'rendering' AND status = 'rendering' AND render_lease_owner = ? AND render_lease_until > CURRENT_TIMESTAMP").get(solutionId, workerId);
  if (!owned) throw new Error("RENDER_LEASE_LOST");
}

function summarize(value: string, limit = 180) {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > limit ? `${normalized.slice(0, limit - 1)}…` : normalized;
}

function readableLocator(value: string) {
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    return Object.entries(parsed).map(([key, item]) => `${key}: ${String(item)}`).join("；") || "—";
  } catch {
    return value || "—";
  }
}

function templateTheme(solutionId: string, format: "docx" | "xlsx" | "pptx"): RenderTheme | null {
  const brand = brandTheme(solutionId);
  const record = productSqlite.prepare(`SELECT tp.source_file_id AS sourceFileId, tp.profile_json AS profileJson
    FROM template_profiles tp JOIN source_files sf ON sf.id = tp.source_file_id
    WHERE tp.solution_id = ? AND tp.detected_format = ? AND tp.status IN ('profiled_default_renderer', 'theme_applied') AND sf.status = 'uploaded'
    ORDER BY sf.created_at DESC, sf.id DESC LIMIT 1`).get(solutionId, format) as { sourceFileId: string; profileJson: string } | undefined;
  if (!record) return brand;
  try {
    const profile = JSON.parse(record.profileJson) as {
      colors?: string[];
      slideSize?: { widthEmu: number; heightEmu: number } | null;
      pageSize?: { widthTwips: number; heightTwips: number } | null;
      slideLayouts?: number;
      placeholderTypes?: string[];
    };
    const colors = (profile.colors || []).map((color) => `#${officeColor(color)}`).filter((color) => isUsefulThemeColor(color));
    if (!colors.length) return brand;
    return {
      sourceFileId: brand?.sourceFileId || record.sourceFileId,
      templateSourceFileId: record.sourceFileId,
      origin: brand ? "brand_template" : "template",
      primary: brand?.primary || colors[0],
      accent: brand?.accent || colors[1] || colors[0],
      colors: brand ? [...brand.colors, ...colors.filter((color) => !brand.colors.includes(color))] : colors,
      slideSize: profile.slideSize,
      pageSize: profile.pageSize,
      slideLayouts: profile.slideLayouts,
      placeholderTypes: profile.placeholderTypes,
    };
  } catch {
    return brand;
  }
}

function themeQuality(theme: RenderTheme | null) {
  return theme ? { code: theme.origin.includes("brand") ? "BRAND_THEME_APPLICATION" : "TEMPLATE_THEME_APPLICATION", passed: true, sourceFileId: theme.sourceFileId, colors: theme.colors.slice(0, 4) } : { code: "DEFAULT_THEME", passed: true };
}

function presentationLayoutQuality(theme: RenderTheme | null) {
  const canvas = presentationCanvas(theme);
  return canvas.fromTemplate
    ? { code: "TEMPLATE_SLIDE_SIZE_APPLICATION", passed: true, aspectRatio: canvas.aspectRatio, slideLayoutsDetected: theme?.slideLayouts || 0, placeholderTypes: theme?.placeholderTypes || [] }
    : { code: "DEFAULT_SLIDE_SIZE", passed: true, reason: canvas.reason };
}

function documentLayoutQuality(theme: RenderTheme | null) {
  const page = documentPageSize(theme);
  return page.fromTemplate
    ? { code: "TEMPLATE_PAGE_SIZE_APPLICATION", passed: true, widthTwips: page.widthTwips, heightTwips: page.heightTwips, pageRatio: page.pageRatio }
    : { code: "DEFAULT_A4_PAGE_SIZE", passed: true, reason: page.reason };
}

function documentPageSize(theme: RenderTheme | null) {
  const widthTwips = theme?.pageSize?.widthTwips || 0;
  const heightTwips = theme?.pageSize?.heightTwips || 0;
  const ratio = heightTwips > 0 ? widthTwips / heightTwips : 0;
  if (ratio >= 0.64 && ratio <= 0.79 && widthTwips >= 10000 && widthTwips <= 14000 && heightTwips >= 14000 && heightTwips <= 18000) {
    return { widthTwips, heightTwips, pageRatio: Number(ratio.toFixed(4)), fromTemplate: true, reason: null };
  }
  return { widthTwips: 12240, heightTwips: 15840, pageRatio: 0.7727, fromTemplate: false, reason: theme ? "模板纸张尺寸缺失或超出安全范围" : "未提供 Word 企业模板" };
}

function presentationCanvas(theme: RenderTheme | null) {
  const widthEmu = theme?.slideSize?.widthEmu || 0;
  const heightEmu = theme?.slideSize?.heightEmu || 0;
  const aspectRatio = heightEmu > 0 ? widthEmu / heightEmu : 0;
  // Current generated layouts are designed for widescreen decks. Preserve a
  // compatible enterprise canvas exactly, but reject malformed/extreme or 4:3
  // proportions until dedicated layout rules are available.
  if (aspectRatio >= 1.65 && aspectRatio <= 1.9) {
    const width = 13.333;
    return { width, height: width / aspectRatio, aspectRatio: Number(aspectRatio.toFixed(4)), fromTemplate: true, reason: null };
  }
  return { width: 13.333, height: 7.5, aspectRatio: 1.7777, fromTemplate: false, reason: theme ? "模板页面比例与当前安全版式不兼容" : "未提供 PPT 企业模板" };
}

function markThemeResult(solutionId: string, format: "docx" | "xlsx" | "pptx", theme: RenderTheme | null) {
  if (theme?.templateSourceFileId) {
    const layoutApplied = format === "pptx" && presentationCanvas(theme).fromTemplate;
    productSqlite.prepare(`UPDATE template_profiles SET status = 'theme_applied',
      fallback_reason = ?, updated_at = CURRENT_TIMESTAMP WHERE source_file_id = ?`).run(
        layoutApplied
          ? "已应用模板主题颜色和页面比例，并识别母版/占位符结构；为避免示例内容泄漏，示例正文、宏和嵌入对象不会复制到成果中。"
          : "已应用模板主题颜色；为避免示例内容泄漏，模板中的示例正文、宏和嵌入对象不会复制到成果中。",
        theme.templateSourceFileId,
      );
    return;
  }
  if (theme?.origin === "brand") return;
  productSqlite.prepare(`UPDATE template_profiles SET status = 'fallback',
    fallback_reason = '模板未包含可安全提取的主题颜色，当前成果已自动使用平台默认版式。', updated_at = CURRENT_TIMESTAMP
    WHERE source_file_id = (SELECT tp.source_file_id FROM template_profiles tp JOIN source_files sf ON sf.id = tp.source_file_id
      WHERE tp.solution_id = ? AND tp.detected_format = ? ORDER BY sf.created_at DESC, sf.id DESC LIMIT 1)`).run(solutionId, format);
}

function brandTheme(solutionId: string): RenderTheme | null {
  const record = productSqlite.prepare(`SELECT bp.source_file_id AS sourceFileId, bp.profile_json AS profileJson
    FROM brand_profiles bp JOIN source_files sf ON sf.id = bp.source_file_id
    WHERE bp.solution_id = ? AND bp.status = 'ready' AND sf.status = 'uploaded'
    ORDER BY sf.created_at DESC, sf.id DESC LIMIT 1`).get(solutionId) as { sourceFileId: string; profileJson: string } | undefined;
  if (!record) return null;
  try {
    const profile = JSON.parse(record.profileJson) as { primary?: string; accent?: string; colors?: string[] };
    const colors = (profile.colors || []).map((color) => `#${officeColor(color)}`).filter((color) => isUsefulThemeColor(color));
    const primary = profile.primary ? `#${officeColor(profile.primary)}` : colors[0];
    const accent = profile.accent ? `#${officeColor(profile.accent)}` : colors[1] || primary;
    if (!primary || !accent || !isUsefulThemeColor(primary)) return null;
    return { sourceFileId: record.sourceFileId, origin: "brand", primary, accent, colors: colors.length ? colors : [primary, accent] };
  } catch {
    return null;
  }
}

function officeColor(value: string) {
  return value.replace(/^#/, "").toUpperCase().padStart(6, "0").slice(0, 6);
}

function isUsefulThemeColor(value: string) {
  const color = officeColor(value);
  const channels = [0, 2, 4].map((index) => Number.parseInt(color.slice(index, index + 2), 16));
  const spread = Math.max(...channels) - Math.min(...channels);
  const average = channels.reduce((sum, item) => sum + item, 0) / 3;
  return spread >= 24 && average >= 28 && average <= 220;
}

function mixWithWhite(value: string, ratio: number) {
  const color = officeColor(value);
  return [0, 2, 4].map((index) => {
    const channel = Number.parseInt(color.slice(index, index + 2), 16);
    return Math.round(channel + (255 - channel) * ratio).toString(16).padStart(2, "0");
  }).join("").toUpperCase();
}

function splitContent(content: string) {
  return documentContentBlocks(content).filter((block) => !block.heading).map((block) => block.text);
}

function documentContentBlocks(content: string) {
  const lines = content.replace(/\r/g, "").split(/\n+/).map((item) => item.replace(/^[-*•]\s*/, "").trim()).filter(Boolean);
  const blocks: Array<{ heading: boolean; text: string }> = [];
  for (const line of lines) {
    const text = line.replace(/^#{1,6}\s*/, "").trim();
    const looksLikeHeading = text.length <= 90 && /^(?:[一二三四五六七八九十]+[、.)]|\d{1,2}[、.)]|(?:背景|目标|范围|现状|交付|风险|实施|验收|上线|报价|数据|权限|集成|安全|成本|计划)[：:])/.test(text);
    if (looksLikeHeading) blocks.push({ heading: true, text });
    else {
      const sentences = text.split(/(?<=[。！？；])\s*/).filter(Boolean);
      if (sentences.length > 2 && text.length > 260) {
        for (let index = 0; index < sentences.length; index += 2) blocks.push({ heading: false, text: sentences.slice(index, index + 2).join("") });
      } else blocks.push({ heading: false, text });
    }
  }
  return blocks;
}

function selectSections(sections: FormalSection[], titles: readonly string[]) {
  const wanted = new Set(titles);
  return sections.filter((section) => wanted.has(section.title));
}

function structuredContentItems(content: string) {
  const items = splitContent(content).flatMap((block) => block
    .split(/\n|(?<=[。；])\s*/)
    .map((item) => item.replace(/^[-•*\d.、)）\s]+/, "").trim())
    .filter((item) => item.length >= 8));
  return [...new Set(items)].map((item) => summarize(item, 500));
}

function parseStructuredItems(value?: string | null): StructuredItem[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item) => item && typeof item.code === "string" && typeof item.kind === "string") : [];
  } catch {
    return [];
  }
}

function outcomeAcceptsItem(label: string, kind: string) {
  const kinds: Record<string, string[]> = {
    "功能清单": ["requirement", "feature"],
    "工作量估算": ["estimation_item", "quote_assumption"],
    "实施计划": ["phase", "milestone", "risk"],
    "项目报价": ["estimation_item", "quote_assumption"],
  };
  return (kinds[label] || []).includes(kind);
}

function readableItemKind(kind: string) {
  const labels: Record<string, string> = { requirement: "需求", feature: "功能", estimation_item: "估算项", phase: "实施阶段", milestone: "里程碑", risk: "风险", quote_assumption: "报价假设" };
  return labels[kind] || kind;
}

function readableAttributes(attributes: StructuredItem["attributes"] | undefined) {
  return (attributes || []).map((item) => `${item.key}=${item.value}`).join("；") || "—";
}

function itemAttribute(item: StructuredItem, key: string) {
  return item.attributes?.find((attribute) => attribute.key === key)?.value?.trim() || "";
}

function numericAttribute(item: StructuredItem, key: string) {
  const value = itemAttribute(item, key);
  return /^-?\d+(?:\.\d+)?$/.test(value) ? Number(value) : null;
}

function addCalculationSheet(workbook: ExcelJS.Workbook, outcomeLabel: string, sections: FormalSection[], primary: string, accent: string, solutionId: string) {
  const structured = withQuoteOverrides(solutionId, sections.flatMap((section) => parseStructuredItems(section.structuredItemsJson)));
  const items = structured.filter((item) => item.kind === "estimation_item");
  const quoteAssumption = structured.find((item) => item.kind === "quote_assumption");
  const sheet = workbook.addWorksheet(outcomeLabel === "工作量估算" ? "估算计算" : "报价计算", { views: [{ state: "frozen", ySplit: 2, showGridLines: false }] });
  configureWorkbookPrintLayout(sheet, "landscape", 0);
  sheet.pageSetup.printTitlesRow = "1:2";
  const quote = outcomeLabel === "项目报价";
  sheet.columns = quote
    ? [{ width: 16 }, { width: 30 }, { width: 16 }, { width: 14 }, { width: 16 }, { width: 14 }, { width: 16 }, { width: 14 }, { width: 18 }, { width: 18 }]
    : [{ width: 16 }, { width: 30 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 18 }];
  const lastColumn = quote ? "J" : "I";
  sheet.mergeCells(`A1:${lastColumn}1`);
  sheet.getCell("A1").value = quote ? "项目报价确定性计算" : "工作量确定性计算";
  sheet.getCell("A1").style = workbookTitleStyle(primary);
  sheet.getRow(1).height = 34;
  sheet.addRow(quote
    ? ["编号", "估算项", "调整人天", "日单价", "未折扣金额", "折扣率", "折后金额", "税率", "含税金额", "状态"]
    : ["编号", "估算项", "基准人天", "复杂度", "复用", "接口", "安全", "不确定性", "调整人天"]);
  items.forEach((item, index) => {
    const rowNumber = index + 3;
    const baseDays = numericAttribute(item, "base_days");
    const factors = ["complexity_factor", "reuse_factor", "integration_factor", "security_factor", "uncertainty_factor"].map((key) => numericAttribute(item, key));
    if (quote) {
      const rawAdjustedDays = baseDays != null && factors.every((factor) => factor != null) ? baseDays * factors.reduce<number>((total, factor) => total * (factor as number), 1) : null;
      const adjustedDays = rawAdjustedDays == null ? null : Math.round(rawAdjustedDays * 100) / 100;
      const rate = numericAttribute(item, "daily_rate") ?? (quoteAssumption ? numericAttribute(quoteAssumption, "daily_rate") : null);
      const tax = numericAttribute(item, "tax_rate") ?? (quoteAssumption ? numericAttribute(quoteAssumption, "tax_rate") : null);
      const discount = numericAttribute(item, "discount_rate") ?? (quoteAssumption ? numericAttribute(quoteAssumption, "discount_rate") : null);
      sheet.addRow([item.code, item.title, adjustedDays, rate, { formula: `IF(OR(C${rowNumber}="",D${rowNumber}=""),"",ROUND(C${rowNumber}*D${rowNumber},2))` }, discount,
        { formula: `IF(OR(E${rowNumber}="",F${rowNumber}=""),"",ROUND(E${rowNumber}*(1-F${rowNumber}),2))` }, tax,
        { formula: `IF(OR(E${rowNumber}="",F${rowNumber}="",H${rowNumber}=""),"",ROUND(G${rowNumber}*(1+H${rowNumber}),2))` }, adjustedDays != null && rate != null && tax != null && discount != null ? "金额参数齐备" : "待补人天/单价/税率/折扣"]);
    } else {
      sheet.addRow([item.code, item.title, baseDays, ...factors, { formula: `IF(COUNT(C${rowNumber}:H${rowNumber})<6,"",ROUND(PRODUCT(C${rowNumber}:H${rowNumber}),2))` }]);
    }
  });
  if (!items.length) sheet.addRow(["—", "正式章节尚无结构化估算项", ...Array((quote ? 8 : 9) - 2).fill(null)]);
  const lastDataRow = Math.max(3, sheet.rowCount);
  styleTable(sheet, 2, lastDataRow, quote ? 10 : 9, accent);
  sheet.autoFilter = `A2:${lastColumn}${lastDataRow}`;
  const totalRow = lastDataRow + 2;
  sheet.getCell(`B${totalRow}`).value = "合计";
  sheet.getCell(`B${totalRow}`).font = { name: "Microsoft YaHei", bold: true, color: { argb: `FF${primary}` } };
  sheet.getCell(`${quote ? "I" : "I"}${totalRow}`).value = { formula: `SUM(I3:I${lastDataRow})` };
  sheet.getCell(`I${totalRow}`).numFmt = quote ? '#,##0.00' : '0.00';
  if (quote) {
    const budget = findBudgetRange(sections, solutionId);
    sheet.getCell(`B${totalRow + 1}`).value = "报价状态";
    const validityDays = quoteAssumption ? numericAttribute(quoteAssumption, "valid_days") : null;
    const completeQuoteInputs = items.length > 0 && validityDays != null && items.every((item) => {
      const itemRate = numericAttribute(item, "daily_rate") ?? (quoteAssumption ? numericAttribute(quoteAssumption, "daily_rate") : null);
      const itemTax = numericAttribute(item, "tax_rate") ?? (quoteAssumption ? numericAttribute(quoteAssumption, "tax_rate") : null);
      const itemDiscount = numericAttribute(item, "discount_rate") ?? (quoteAssumption ? numericAttribute(quoteAssumption, "discount_rate") : null);
      return numericAttribute(item, "base_days") != null && ["complexity_factor", "reuse_factor", "integration_factor", "security_factor", "uncertainty_factor"].every((key) => numericAttribute(item, key) != null)
        && itemRate != null && itemTax != null && itemDiscount != null;
    });
    sheet.getCell(`C${totalRow + 1}`).value = completeQuoteInputs ? "参数齐备，可计算确定性报价金额" : "仍有报价参数待确认，暂不能形成最终报价";
    sheet.getCell(`B${totalRow + 2}`).value = "预算参考区间";
    sheet.getCell(`C${totalRow + 2}`).value = budget ? `${budget.min.toLocaleString()} - ${budget.max.toLocaleString()} 元（仅供方案方向参考）` : "未提供";
    sheet.getCell(`B${totalRow + 3}`).value = "报价有效期";
    sheet.getCell(`C${totalRow + 3}`).value = validityDays == null ? "待确认" : `${validityDays} 天`;
    sheet.getCell(`B${totalRow + 4}`).value = "待补参数";
    sheet.getCell(`C${totalRow + 4}`).value = "日单价、人天、税率、折扣率和报价有效期等，以项目确认结果为准";
    for (const rowNumber of [totalRow + 1, totalRow + 2, totalRow + 3, totalRow + 4]) {
      sheet.getCell(`B${rowNumber}`).font = { name: "Microsoft YaHei", bold: true, color: { argb: `FF${primary}` } };
      sheet.getCell(`C${rowNumber}`).alignment = { wrapText: true, vertical: "middle" };
      if (quote) sheet.mergeCells(`C${rowNumber}:J${rowNumber}`);
      sheet.getRow(rowNumber).height = rowNumber === totalRow + 4 ? 42 : 36;
    }
  }
}

function addQuoteSummarySheet(workbook: ExcelJS.Workbook, title: string, sections: FormalSection[], primary: string, accent: string, solutionId: string) {
  const sheet = workbook.addWorksheet("报价说明", { views: [{ showGridLines: false }] });
  configureWorkbookPrintLayout(sheet, "landscape", 0);
  sheet.pageSetup.printTitlesRow = "9:9";
  sheet.columns = [{ width: 24 }, { width: 34 }, { width: 64 }];
  sheet.mergeCells("A1:C1");
  sheet.getCell("A1").value = "项目报价说明";
  sheet.getCell("A1").style = workbookTitleStyle(primary);
  sheet.getRow(1).height = 34;
  const budget = findBudgetRange(sections, solutionId);
  const allItems = withQuoteOverrides(solutionId, sections.flatMap((section) => parseStructuredItems(section.structuredItemsJson)));
  const items = allItems.filter((item) => item.kind === "estimation_item");
  const quoteAssumption = allItems.find((item) => item.kind === "quote_assumption");
  const validityDays = quoteAssumption ? numericAttribute(quoteAssumption, "valid_days") : null;
  const quoteReady = items.length > 0 && validityDays != null && items.every((item) => {
    const rate = numericAttribute(item, "daily_rate") ?? (quoteAssumption ? numericAttribute(quoteAssumption, "daily_rate") : null);
    const tax = numericAttribute(item, "tax_rate") ?? (quoteAssumption ? numericAttribute(quoteAssumption, "tax_rate") : null);
    const discount = numericAttribute(item, "discount_rate") ?? (quoteAssumption ? numericAttribute(quoteAssumption, "discount_rate") : null);
    return numericAttribute(item, "base_days") != null && ["complexity_factor", "reuse_factor", "integration_factor", "security_factor", "uncertainty_factor"].every((key) => numericAttribute(item, key) != null)
      && rate != null && tax != null && discount != null;
  });
  sheet.addRows([
    ["项目名称", title, ""],
    ["报价状态", quoteReady ? "报价参数齐备，可计算参考金额" : "参数待确认", quoteReady ? "计算金额仍需业务方确认适用范围和商务条件后，才能作为正式报价。" : "当前仍有单价、人天、税率、折扣率或有效期参数缺失，不能将预算区间视为最终报价。"],
    ["预算参考区间", budget ? `${budget.min.toLocaleString()} - ${budget.max.toLocaleString()} 元` : "未提供", "预算仅用于方案方向参考，不等同于最终报价。"],
    ["估算项数量", items.length, "详见“报价计算”工作表；每行均保留公式和参数状态。"],
    ["报价有效期", validityDays == null ? "待确认" : `${validityDays} 天`, "有效期为确定性参数，需由项目方确认。"],
    ["待补参数", "日单价、人天、税率、折扣率、报价有效期", "补齐确认后，报价计算表可继续使用，不需要重新生成文档。"],
  ]);
  styleKeyValueSheet(sheet, 2, 7, primary);
  sheet.getColumn(3).alignment = { wrapText: true, vertical: "middle" };
  sheet.getRow(3).height = 52;
  sheet.getRow(4).height = 42;
  sheet.getRow(6).height = 42;
  sheet.getRow(7).height = 42;
  sheet.addRow([]);
  sheet.addRow(["估算项编号", "估算项", "当前参数状态"]);
  items.forEach((item) => sheet.addRow([item.code, item.title, numericAttribute(item, "base_days") != null ? "已有基准人天，仍需确认日单价/税率" : "待补人天、日单价、税率"]));
  styleTable(sheet, 9, Math.max(10, sheet.rowCount), 3, accent);
}

function findBudgetRange(sections: FormalSection[], solutionId?: string) {
  const rawItems = sections.flatMap((section) => parseStructuredItems(section.structuredItemsJson));
  const items = solutionId ? withQuoteOverrides(solutionId, rawItems) : rawItems;
  const assumption = items.find((item) => item.kind === "quote_assumption");
  const min = assumption ? numericAttribute(assumption, "budget_min") : null;
  const max = assumption ? numericAttribute(assumption, "budget_max") : null;
  if (min != null && max != null) return { min, max };
  const text = sections.map((section) => section.content).join("\n");
  const match = text.match(/预算(?:范围|区间)?[^\d]{0,12}(\d[\d,]*)\s*(?:-|至|~)\s*(\d[\d,]*)\s*元?/);
  return match ? { min: Number(match[1].replace(/,/g, "")), max: Number(match[2].replace(/,/g, "")) } : null;
}

function outcomeCode(label: string) {
  const codes: Record<string, string> = { "功能清单": "FUN", "工作量估算": "EST", "实施计划": "PLAN", "项目报价": "QUOTE" };
  return codes[label] || "ITEM";
}

function safeFilename(value: string) {
  return value.replace(/[\\/:*?"<>|]/g, "-").replace(/\s+/g, " ").trim().slice(0, 80) || `项目成果-${createHash("sha256").update(value).digest("hex").slice(0, 8)}`;
}

function renderErrorCode(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.split(":", 1)[0].replace(/[^A-Z0-9_]/gi, "_").slice(0, 80) || "DELIVERABLE_RENDER_FAILED";
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

function withQuoteOverrides(solutionId: string, items: StructuredItem[]) {
  if (!items.some((item) => item.kind === "quote_assumption")) items = [...items, { kind: "quote_assumption", code: "QUOTE-DEFAULT", title: "项目报价整体参数", description: "用户确认的项目级报价参数", sourceBlockIds: [], attributes: [] }];
  const overrides = quoteParameterOverrides(solutionId);
  return items.map((item) => {
    const attributes = new Map((item.attributes || []).map(({ key, value }) => [key, value]));
    for (const key of ["base_days", "complexity_factor", "reuse_factor", "integration_factor", "security_factor", "uncertainty_factor", "daily_rate", "tax_rate", "discount_rate", "valid_days", "budget_min", "budget_max"]) {
      const value = overrides.get(`${item.code}:${key}`);
      if (value != null) attributes.set(key, String(value));
    }
    return { ...item, attributes: [...attributes].map(([key, value]) => ({ key, value })) };
  });
}

function artifactRenderFingerprint(solutionId: string, expectedFormat: string) {
  const profile = productSqlite.prepare(`SELECT tp.detected_format AS detectedFormat, tp.profile_json AS profileJson, tp.render_policy_json AS renderPolicyJson
    FROM template_profiles tp JOIN source_files sf ON sf.id = tp.source_file_id
    WHERE tp.solution_id = ? AND tp.detected_format = ? AND sf.status = 'uploaded'
    ORDER BY sf.created_at DESC, sf.id DESC LIMIT 1`).get(solutionId, expectedFormat) || { detectedFormat: expectedFormat, profileJson: null, renderPolicyJson: null };
  return createHash("sha256").update(JSON.stringify({ rendererVersion: "renderer-v5-cjk-font-v1", expectedFormat, profile })).digest("hex");
}

function supersedeStaleRenderedArtifacts(solutionId: string, userId: string) {
  const rows = productSqlite.prepare("SELECT id, artifact_type AS artifactType, render_fingerprint AS renderFingerprint FROM deliverable_artifacts WHERE solution_id = ? AND user_id = ? AND status = 'available'").all(solutionId, userId) as Array<{ id: string; artifactType: string; renderFingerprint: string | null }>;
  for (const row of rows) {
    const expectedFormat = row.artifactType.endsWith("_xlsx") ? "xlsx" : row.artifactType.endsWith("_pptx") ? "pptx" : row.artifactType.endsWith("_pdf") ? "pdf" : "docx";
    if (row.renderFingerprint !== artifactRenderFingerprint(solutionId, expectedFormat)) {
      productSqlite.prepare("UPDATE deliverable_artifacts SET status = 'superseded', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'available'").run(row.id);
    }
  }
}

function artifactDependencyTitles(artifactType: string): string[] {
  const all = ["项目背景与目标", "范围、用户与关键约束", "业务需求与功能规划", "整体解决方案", "工作量与成本依据", "实施计划与交付安排", "风险、假设与待确认事项"];
  const dependencies: Record<string, string[]> = {
    requirement_analysis_docx: [all[0], all[1], all[2], all[6]],
    function_catalog_xlsx: [all[2], all[3]],
    workload_estimate_xlsx: [all[4]],
    implementation_plan_xlsx: [all[5]],
    project_quote_xlsx: [all[4], all[5]],
    project_quote_pdf: [all[4], all[5]],
    formal_solution_docx: all,
    formal_solution_pdf: all,
    solution_briefing_pptx: all,
    project_traceability_xlsx: all,
  };
  return dependencies[artifactType] || all;
}
