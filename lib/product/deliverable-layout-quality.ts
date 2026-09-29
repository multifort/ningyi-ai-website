import JSZip from "jszip";

export type DeliverableLayoutCheck = {
  code: string;
  passed: boolean;
  actual?: unknown;
  expected?: unknown;
  reason?: string;
};

const officeCjkFonts = ["Hiragino Sans GB", "Microsoft YaHei", "Noto Sans CJK SC"];
type SlideGeometryViolation = { slide: number; reason?: string; x?: number; y?: number; width?: number; height?: number };

export async function validateDeliverableLayout(bytes: Buffer, format: string): Promise<DeliverableLayoutCheck[]> {
  if (format === "pdf") return validatePdfLayout(bytes);
  if (!["docx", "xlsx", "pptx"].includes(format)) {
    return [{ code: "LAYOUT_FORMAT_SUPPORTED", passed: false, actual: format }];
  }
  try {
    const archive = await JSZip.loadAsync(bytes, { checkCRC32: true, createFolders: false });
    if (format === "docx") return validateDocxLayout(archive);
    if (format === "xlsx") return validateXlsxLayout(archive);
    return validatePptxLayout(archive);
  } catch {
    return [{ code: "LAYOUT_PACKAGE_READABLE", passed: false, reason: "无法读取 Office 包结构" }];
  }
}

async function validateDocxLayout(archive: JSZip) {
  const documentXml = await readXml(archive, "word/document.xml");
  const stylesXml = await readXml(archive, "word/styles.xml");
  const pageSizes = [...documentXml.matchAll(/<w:pgSz\b[^>]*\bw:w="(\d+)"[^>]*\bw:h="(\d+)"/g)].map((match) => ({ width: Number(match[1]), height: Number(match[2]) }));
  const safePages = pageSizes.length > 0 && pageSizes.every(({ width, height }) => {
    const ratio = height > 0 ? width / height : 0;
    return ratio >= 0.64 && ratio <= 0.79 && width >= 10000 && width <= 14000 && height >= 14000 && height <= 18000;
  });
  const textCount = [...documentXml.matchAll(/<w:t(?:\s[^>]*)?>[\s\S]*?<\/w:t>/g)].length;
  const declaredFonts = extractFonts(`${documentXml}\n${stylesXml}`);
  return [
    { code: "DOCX_SAFE_PAGE_GEOMETRY", passed: safePages, actual: pageSizes },
    { code: "DOCX_NATIVE_TEXT", passed: textCount > 0, actual: textCount },
    { code: "DOCX_CJK_FONT_DECLARED", passed: declaredFonts.some((font) => officeCjkFonts.includes(font)), actual: declaredFonts },
    { code: "DOCX_NO_ALTCHUNK", passed: !/<w:altChunk\b/.test(documentXml) },
  ];
}

async function validateXlsxLayout(archive: JSZip) {
  const workbookXml = await readXml(archive, "xl/workbook.xml");
  const worksheetNames = Object.keys(archive.files).filter((name) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(name));
  const worksheets = await Promise.all(worksheetNames.map((name) => readXml(archive, name)));
  const sheetCount = [...workbookXml.matchAll(/<sheet\b/g)].length;
  const printableSheets = worksheets.filter((xml) => /<pageSetup\b/.test(xml)).length;
  const frozenSheets = worksheets.filter((xml) => /<pane\b[^>]*(?:state="frozen"|ySplit="[1-9])/i.test(xml)).length;
  const formulaCount = worksheets.reduce((total, xml) => total + [...xml.matchAll(/<f(?:\s[^>]*)?>/g)].length, 0);
  const completeFormulaCount = worksheets.reduce((total, xml) => total + [...xml.matchAll(/<f(?:\s[^>]*)?>[^<]+<\/f>/g)].length, 0);
  const stylesXml = await readXml(archive, "xl/styles.xml");
  const declaredFonts = extractFonts(stylesXml);
  return [
    { code: "XLSX_WORKSHEET_STRUCTURE", passed: sheetCount > 0 && sheetCount === worksheets.length, actual: { sheetCount, worksheetParts: worksheets.length } },
    { code: "XLSX_PRINT_LAYOUT", passed: printableSheets === worksheets.length, actual: printableSheets, expected: worksheets.length },
    { code: "XLSX_NAVIGATION_PANES", passed: worksheets.length === 1 || frozenSheets > 0, actual: frozenSheets },
    { code: "XLSX_FORMULA_STRUCTURE", passed: formulaCount === completeFormulaCount, actual: { formulaCount, completeFormulaCount } },
    { code: "XLSX_CJK_FONT_DECLARED", passed: declaredFonts.some((font) => officeCjkFonts.includes(font)), actual: declaredFonts },
  ];
}

async function validatePptxLayout(archive: JSZip) {
  const presentationXml = await readXml(archive, "ppt/presentation.xml");
  const size = presentationXml.match(/<p:sldSz\b[^>]*\bcx="(\d+)"[^>]*\bcy="(\d+)"/);
  const width = Number(size?.[1] || 0);
  const height = Number(size?.[2] || 0);
  const slideNames = Object.keys(archive.files).filter((name) => /^ppt\/slides\/slide\d+\.xml$/i.test(name));
  const slideXml = await Promise.all(slideNames.map((name) => readXml(archive, name)));
  const geometry = slideXml.flatMap((xml, slideIndex) => inspectSlideGeometry(xml, width, height, slideIndex + 1));
  const nativeTextCount = slideXml.reduce((total, xml) => total + [...xml.matchAll(/<a:t(?:\s[^>]*)?>[\s\S]*?<\/a:t>/g)].length, 0);
  const declaredFonts = extractFonts(slideXml.join("\n"));
  const ratio = height > 0 ? width / height : 0;
  return [
    { code: "PPTX_SAFE_SLIDE_GEOMETRY", passed: ratio >= 1.65 && ratio <= 1.9, actual: { width, height, aspectRatio: ratio ? Number(ratio.toFixed(4)) : null } },
    { code: "PPTX_SHAPES_WITHIN_CANVAS", passed: geometry.length === 0, actual: geometry.slice(0, 12) },
    { code: "PPTX_NATIVE_EDITABLE_TEXT", passed: nativeTextCount > 0, actual: nativeTextCount },
    { code: "PPTX_CJK_FONT_DECLARED", passed: declaredFonts.some((font) => officeCjkFonts.includes(font)), actual: declaredFonts },
  ];
}

function inspectSlideGeometry(xml: string, width: number, height: number, slide: number): SlideGeometryViolation[] {
  if (!width || !height) return [{ slide, reason: "missing_slide_size" }];
  const toleranceX = width * 0.01;
  const toleranceY = height * 0.01;
  const violations: SlideGeometryViolation[] = [];
  for (const match of xml.matchAll(/<a:xfrm\b[^>]*>([\s\S]*?)<\/a:xfrm>/g)) {
    const block = match[1];
    const offset = block.match(/<a:off\b[^>]*\bx="(-?\d+)"[^>]*\by="(-?\d+)"/);
    const extent = block.match(/<a:ext\b[^>]*\bcx="(\d+)"[^>]*\bcy="(\d+)"/);
    if (!offset || !extent) continue;
    const x = Number(offset[1]);
    const y = Number(offset[2]);
    const shapeWidth = Number(extent[1]);
    const shapeHeight = Number(extent[2]);
    if (shapeWidth === 0 && shapeHeight === 0) continue;
    if (x < -toleranceX || y < -toleranceY || x + shapeWidth > width + toleranceX || y + shapeHeight > height + toleranceY) {
      violations.push({ slide, x, y, width: shapeWidth, height: shapeHeight });
    }
  }
  return violations;
}

function validatePdfLayout(bytes: Buffer): DeliverableLayoutCheck[] {
  const source = bytes.toString("latin1");
  const pageCount = [...source.matchAll(/\/Type\s*\/Page\b/g)].length;
  const mediaBoxes = [...source.matchAll(/\/MediaBox\s*\[\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\]/g)].map((match) => ({
    width: Number(match[3]) - Number(match[1]),
    height: Number(match[4]) - Number(match[2]),
  }));
  const safePages = pageCount > 0 && mediaBoxes.length > 0 && mediaBoxes.every(({ width, height }) => width >= 500 && width <= 850 && height >= 500 && height <= 850);
  const embeddedFonts = /\/FontFile(?:2|3)?\b/.test(source);
  return [
    { code: "PDF_PAGE_STRUCTURE", passed: pageCount > 0, actual: pageCount },
    { code: "PDF_SAFE_PAGE_GEOMETRY", passed: safePages, actual: mediaBoxes },
    { code: "PDF_EMBEDDED_FONT", passed: embeddedFonts },
  ];
}

function extractFonts(xml: string) {
  const values = [...xml.matchAll(/(?:typeface|w:(?:ascii|hAnsi|eastAsia)|<name\s+val)="([^"]+)"/g)].map((match) => decodeXml(match[1]).trim()).filter(Boolean);
  return [...new Set(values)];
}

function decodeXml(value: string) {
  return value.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}

async function readXml(archive: JSZip, name: string) {
  return archive.file(name)?.async("string") || "";
}
