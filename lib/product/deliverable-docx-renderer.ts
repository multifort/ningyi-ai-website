import { AlignmentType, BorderStyle, Document, Footer, Header, HeadingLevel, Packer, PageNumber, Paragraph, ShadingType, Table, TableCell, TableRow, TextRun, VerticalAlign, WidthType } from "docx";
import {
  type FormalSection,
  type RenderTheme,
  type StructuredItem,
  documentContentBlocks,
  documentPageSize,
  officeColor,
  parseStructuredItems,
  readableItemKind,
  summarize,
} from "./deliverable-rendering-shared";

export async function buildFormalSolutionDocx(title: string, sections: FormalSection[], theme: RenderTheme | null, documentLabel = "企业项目整体解决方案") {
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
