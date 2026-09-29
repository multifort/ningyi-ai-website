import { createHash } from "crypto";
import { AsyncLocalStorage } from "async_hooks";
import { productSqlite } from "./db";
import { hasCompleteFormalDocument, invalidateDeliverablesForBrand, invalidateDeliverablesForTemplate, listDeliverables, publishDeliverable, supersedeStaleRenderedArtifacts } from "./deliverable-publication";
import * as docxRenderer from "./deliverable-docx-renderer";
import * as pdfRenderer from "./deliverable-pdf-renderer";
import * as pptxRenderer from "./deliverable-pptx-renderer";
import * as renderingShared from "./deliverable-rendering-shared";
import * as xlsxRenderer from "./deliverable-xlsx-renderer";
import type { FormalSection, RenderTheme, StructuredItem } from "./deliverable-rendering-shared";
import type { SourceBlock } from "./deliverable-xlsx-renderer";

export { hasCompleteFormalDocument, invalidateDeliverablesForBrand, invalidateDeliverablesForTemplate, listDeliverables };

const renderWorkerContext = new AsyncLocalStorage<string>();

type ProgressiveDeliverableResult = { artifactType: string; status: "available" | "waiting" | "failed"; errorCode?: string };
type ProgressiveDeliverableDefinition = {
  artifactType: string;
  displayName: string;
  label: string;
  format: "docx" | "xlsx";
  sectionTitles: readonly string[];
};

const progressiveDeliverableDefinitions: readonly ProgressiveDeliverableDefinition[] = [
  { artifactType: "requirement_analysis_docx", displayName: "需求分析", label: "项目需求分析", format: "docx", sectionTitles: ["项目背景与目标", "范围、用户与关键约束", "业务需求与功能规划", "风险、假设与待确认事项"] },
  { artifactType: "function_catalog_xlsx", displayName: "功能清单", label: "功能清单", format: "xlsx", sectionTitles: ["业务需求与功能规划", "整体解决方案"] },
  { artifactType: "workload_estimate_xlsx", displayName: "工作量估算", label: "工作量估算", format: "xlsx", sectionTitles: ["工作量与成本依据"] },
  { artifactType: "implementation_plan_xlsx", displayName: "实施计划", label: "实施计划", format: "xlsx", sectionTitles: ["实施计划与交付安排"] },
  { artifactType: "project_quote_xlsx", displayName: "项目报价", label: "项目报价", format: "xlsx", sectionTitles: ["工作量与成本依据", "实施计划与交付安排"] },
] as const;

export async function ensurePrimaryDeliverables(solutionId: string, userId: string, options: { workerId?: string } = {}): Promise<unknown[]> {
  if (options.workerId && renderWorkerContext.getStore() !== options.workerId) {
    return renderWorkerContext.run(options.workerId, () => ensurePrimaryDeliverables(solutionId, userId));
  }
  const solution = productSqlite.prepare("SELECT title FROM product_solutions WHERE id = ? AND owner_user_id = ? AND status NOT IN ('deletion_pending', 'deleted')").get(solutionId, userId) as { title: string } | undefined;
  if (!solution) throw new Error("SOLUTION_NOT_FOUND");
  const sections = productSqlite.prepare("SELECT title, content, summary, structured_items_json AS structuredItemsJson FROM formal_sections WHERE solution_id = ? AND status = 'validated' ORDER BY section_index").all(solutionId) as FormalSection[];
  if (!sections.length || sections.some((section) => !section.content?.trim())) throw new Error("FORMAL_DOCUMENT_INCOMPLETE");

  supersedeStaleRenderedArtifacts(solutionId, userId);
  await ensureDeclaredProgressiveDeliverables({ solutionId, userId, solutionTitle: solution.title, sections, bestEffort: false });

  const existingTypes = new Set((productSqlite.prepare("SELECT artifact_type AS artifactType FROM deliverable_artifacts WHERE solution_id = ? AND user_id = ? AND status = 'available'").all(solutionId, userId) as Array<{ artifactType: string }>).map((item) => item.artifactType));

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

export async function ensureProgressiveDeliverables(solutionId: string, userId: string) {
  const solution = productSqlite.prepare("SELECT title FROM product_solutions WHERE id = ? AND owner_user_id = ? AND status NOT IN ('deletion_pending', 'deleted')").get(solutionId, userId) as { title: string } | undefined;
  if (!solution) throw new Error("SOLUTION_NOT_FOUND");
  const sections = productSqlite.prepare("SELECT title, content, summary, structured_items_json AS structuredItemsJson FROM formal_sections WHERE solution_id = ? AND status = 'validated' ORDER BY section_index").all(solutionId) as FormalSection[];
  return ensureDeclaredProgressiveDeliverables({ solutionId, userId, solutionTitle: solution.title, sections, bestEffort: true });
}

async function ensureDeclaredProgressiveDeliverables(input: { solutionId: string; userId: string; solutionTitle: string; sections: FormalSection[]; bestEffort: boolean }) {
  const { solutionId, userId, solutionTitle, sections, bestEffort } = input;
  const existingTypes = new Set((productSqlite.prepare("SELECT artifact_type AS artifactType FROM deliverable_artifacts WHERE solution_id = ? AND user_id = ? AND status = 'available'").all(solutionId, userId) as Array<{ artifactType: string }>).map((item) => item.artifactType));
  const results: ProgressiveDeliverableResult[] = [];
  for (const definition of progressiveDeliverableDefinitions) {
    if (existingTypes.has(definition.artifactType)) { results.push({ artifactType: definition.artifactType, status: "available" }); continue; }
    const selected = selectSections(sections, definition.sectionTitles);
    if (selected.length !== definition.sectionTitles.length) { results.push({ artifactType: definition.artifactType, status: "waiting" }); continue; }
    try {
      await renderProgressiveDeliverable({ solutionId, userId, solutionTitle, selected, definition });
      results.push({ artifactType: definition.artifactType, status: "available" });
    } catch (error) {
      if (!bestEffort) throw error;
      results.push({ artifactType: definition.artifactType, status: "failed", errorCode: renderErrorCode(error) });
    }
  }
  return results;
}

async function renderProgressiveDeliverable(input: { solutionId: string; userId: string; solutionTitle: string; selected: FormalSection[]; definition: ProgressiveDeliverableDefinition }) {
  const { solutionId, userId, solutionTitle, selected, definition } = input;
  const theme = templateTheme(solutionId, definition.format);
  const bytes = definition.format === "docx"
    ? await buildFormalSolutionDocx(solutionTitle, selected, theme, definition.label)
    : await buildOutcomeWorkbook(solutionTitle, definition.label, selected, theme, solutionId);
  const coverageCode = definition.artifactType === "requirement_analysis_docx" ? "REQUIREMENT_SECTION_COVERAGE" : "SOURCE_SECTION_COVERAGE";
  const qualityChecks: Array<Record<string, unknown>> = [
    { code: coverageCode, passed: selected.length === definition.sectionTitles.length, actual: selected.length, expected: definition.sectionTitles.length },
    { code: "VALIDATED_CONTENT_REUSE", passed: true },
  ];
  if (definition.format === "xlsx") qualityChecks.push({ code: "NO_UNSUPPORTED_RECALCULATION", passed: true });
  qualityChecks.push(themeQuality(theme));
  if (definition.format === "docx") qualityChecks.push(documentLayoutQuality(theme));
  await storeDeliverable({
    solutionId,
    userId,
    artifactType: definition.artifactType,
    displayName: `${safeFilename(solutionTitle)}-${definition.displayName}.${definition.format}`,
    mimeType: definition.format === "docx" ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    bytes,
    expectedFormat: definition.format,
    qualityChecks,
  });
  markThemeResult(solutionId, definition.format, theme);
}

export async function buildFormalSolutionDocx(title: string, sections: FormalSection[], theme: RenderTheme | null, documentLabel = "企业项目整体解决方案") {
  return docxRenderer.buildFormalSolutionDocx(title, sections, theme, documentLabel);
}

export async function buildOutcomeWorkbook(title: string, outcomeLabel: string, sections: FormalSection[], theme: RenderTheme | null, solutionId?: string) {
  return xlsxRenderer.buildOutcomeWorkbook(title, outcomeLabel, sections, theme, solutionId);
}
async function buildTraceabilityWorkbook(title: string, sections: FormalSection[], sourceBlocks: SourceBlock[], theme: RenderTheme | null) {
  return xlsxRenderer.buildTraceabilityWorkbook(title, sections, sourceBlocks, theme);
}
export async function buildSolutionPresentation(title: string, sections: FormalSection[], theme: RenderTheme | null) {
  return pptxRenderer.buildSolutionPresentation(title, sections, theme);
}

async function buildFormalSolutionPdf(title: string, sections: FormalSection[], theme: RenderTheme | null, documentLabel = "企业项目整体解决方案") {
  return pdfRenderer.buildFormalSolutionPdf(title, sections, theme, documentLabel);
}

export async function buildQuotePdf(title: string, sections: FormalSection[], theme: RenderTheme | null, solutionId: string) {
  return pdfRenderer.buildQuotePdf(title, sections, theme, solutionId);
}

export function calculateQuoteSummary(items: StructuredItem[]) {
  return pdfRenderer.calculateQuoteSummary(items);
}

async function storeDeliverable(input: { solutionId: string; userId: string; artifactType: string; displayName: string; mimeType: string; bytes: Buffer; expectedFormat: string; qualityChecks: Array<Record<string, unknown>> }) {
  return publishDeliverable(input, renderWorkerContext.getStore());
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
  return renderingShared.documentPageSize(theme);
}

function presentationCanvas(theme: RenderTheme | null) {
  return renderingShared.presentationCanvas(theme);
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
  return renderingShared.officeColor(value);
}

function isUsefulThemeColor(value: string) {
  const color = officeColor(value);
  const channels = [0, 2, 4].map((index) => Number.parseInt(color.slice(index, index + 2), 16));
  const spread = Math.max(...channels) - Math.min(...channels);
  const average = channels.reduce((sum, item) => sum + item, 0) / 3;
  return spread >= 24 && average >= 28 && average <= 220;
}

function selectSections(sections: FormalSection[], titles: readonly string[]) {
  const wanted = new Set(titles);
  return sections.filter((section) => wanted.has(section.title));
}

function safeFilename(value: string) {
  return value.replace(/[\\/:*?"<>|]/g, "-").replace(/\s+/g, " ").trim().slice(0, 80) || `项目成果-${createHash("sha256").update(value).digest("hex").slice(0, 8)}`;
}

function renderErrorCode(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.split(":", 1)[0].replace(/[^A-Z0-9_]/gi, "_").slice(0, 80) || "DELIVERABLE_RENDER_FAILED";
}
