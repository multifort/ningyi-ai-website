import ExcelJS from "exceljs";
import {
  type FormalSection,
  type RenderTheme,
  type StructuredItem,
  numericAttribute as sharedNumericAttribute,
  officeColor,
  parseStructuredItems as sharedParseStructuredItems,
  readableItemKind as sharedReadableItemKind,
  splitContent,
  summarize,
  withQuoteOverrides,
} from "./deliverable-rendering-shared";

export type SourceBlock = { id: string; blockType: string; canonicalText: string; sourceName: string | null; locatorJson: string };

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

export async function buildTraceabilityWorkbook(title: string, sections: FormalSection[], sourceBlocks: SourceBlock[], theme: RenderTheme | null) {
  const primary = officeColor(theme?.primary || "#1667E8");
  const accent = officeColor(theme?.accent || "#16365C");
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "企业方案服务平台";
  workbook.created = new Date();
  workbook.modified = new Date();
  workbook.subject = "项目内容与来源清单";

  const overview = workbook.addWorksheet("项目概览", { views: [{ showGridLines: false }] });
  configureWorkbookPrintLayout(overview, "landscape", 1);
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
  configureWorkbookPrintLayout(sectionSheet, "landscape", 0);
  sectionSheet.pageSetup.printTitlesRow = "1:2";
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
  configureWorkbookPrintLayout(sourceSheet, "landscape", 0);
  sourceSheet.pageSetup.printTitlesRow = "1:2";
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


function readableLocator(value: string) {
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    return Object.entries(parsed).map(([key, item]) => `${key}: ${String(item)}`).join("；") || "—";
  } catch {
    return value || "—";
  }
}


function structuredContentItems(content: string) {
  const items = splitContent(content).flatMap((block) => block
    .split(/\n|(?<=[。；])\s*/)
    .map((item) => item.replace(/^[-•*\d.、)）\s]+/, "").trim())
    .filter((item) => item.length >= 8));
  return [...new Set(items)].map((item) => summarize(item, 500));
}

function parseStructuredItems(value?: string | null): StructuredItem[] {
  return sharedParseStructuredItems(value);
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
  return sharedReadableItemKind(kind);
}

function readableAttributes(attributes: StructuredItem["attributes"] | undefined) {
  return (attributes || []).map((item) => `${item.key}=${item.value}`).join("；") || "—";
}

function numericAttribute(item: StructuredItem, key: string) {
  return sharedNumericAttribute(item, key);
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
