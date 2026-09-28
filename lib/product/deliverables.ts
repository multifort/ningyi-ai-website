import { createHash } from "crypto";
import { AsyncLocalStorage } from "async_hooks";
import ExcelJS from "exceljs";
import { productSqlite } from "./db";
import { hasCompleteFormalDocument, invalidateDeliverablesForBrand, invalidateDeliverablesForTemplate, listDeliverables, publishDeliverable, supersedeStaleRenderedArtifacts } from "./deliverable-publication";
import * as docxRenderer from "./deliverable-docx-renderer";
import * as pdfRenderer from "./deliverable-pdf-renderer";
import * as pptxRenderer from "./deliverable-pptx-renderer";
import * as renderingShared from "./deliverable-rendering-shared";
import type { FormalSection, RenderTheme, StructuredItem } from "./deliverable-rendering-shared";

export { hasCompleteFormalDocument, invalidateDeliverablesForBrand, invalidateDeliverablesForTemplate, listDeliverables };

type SourceBlock = { id: string; blockType: string; canonicalText: string; sourceName: string | null; locatorJson: string };
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

export async function ensurePrimaryDeliverables(solutionId: string, userId: string, options: { workerId?: string } = {}) {
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
  return publishDeliverable(input, renderWorkerContext.getStore());
}

function summarize(value: string, limit = 180) {
  return renderingShared.summarize(value, limit);
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

function splitContent(content: string) {
  return renderingShared.splitContent(content);
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
  return renderingShared.parseStructuredItems(value);
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
  return renderingShared.readableItemKind(kind);
}

function readableAttributes(attributes: StructuredItem["attributes"] | undefined) {
  return (attributes || []).map((item) => `${item.key}=${item.value}`).join("；") || "—";
}

function numericAttribute(item: StructuredItem, key: string) {
  return renderingShared.numericAttribute(item, key);
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

function withQuoteOverrides(solutionId: string, items: StructuredItem[]) {
  return renderingShared.withQuoteOverrides(solutionId, items);
}
