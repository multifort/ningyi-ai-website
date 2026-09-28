import pptxgen from "pptxgenjs";
import {
  type FormalSection,
  type RenderTheme,
  type StructuredItem,
  itemAttribute,
  mixWithWhite,
  officeColor,
  parseStructuredItems,
  presentationCanvas,
  readableItemKind,
  splitContent,
  summarize,
} from "./deliverable-rendering-shared";

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
  deck.theme = { headFontFace: "Hiragino Sans GB", bodyFontFace: "Hiragino Sans GB" };
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
  if (/实施|交付|计划/.test(title)) return addTimelineVisual(slide, deck, items, points, accent);
  if (/风险|假设|待确认/.test(title)) return addRiskVisual(slide, deck, items, points, accent);
  if (/工作量|成本|报价/.test(title)) return addMetricVisual(slide, deck, items, points, primary, accent);
  addCardsVisual(slide, deck, items, points, primary, accent);
}

function addCardsVisual(slide: pptxgen.Slide, deck: pptxgen, items: StructuredItem[], points: string[], primary: string, accent: string) {
  const cards = items.length ? items.slice(0, 4).map((item) => ({ title: item.title, body: item.description, tag: readableItemKind(item.kind) })) : points.slice(0, 4).map((point, index) => ({ title: `要点 ${index + 1}`, body: point, tag: "章节内容" }));
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
