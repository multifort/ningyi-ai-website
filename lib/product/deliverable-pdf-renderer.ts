import fs from "fs";
import path from "path";
import PDFDocument from "pdfkit";
import {
  type FormalSection,
  type RenderTheme,
  type StructuredItem,
  mixWithWhite,
  numericAttribute,
  officeColor,
  parseStructuredItems,
  splitContent,
  withQuoteOverrides,
} from "./deliverable-rendering-shared";

export async function buildFormalSolutionPdf(title: string, sections: FormalSection[], theme: RenderTheme | null, documentLabel = "企业项目整体解决方案") {
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
