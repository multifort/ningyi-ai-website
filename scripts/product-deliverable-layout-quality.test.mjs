import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createRequire } from "node:module";

process.env.PRODUCT_DB_PATH = path.join(os.tmpdir(), `ningyi-layout-quality-${process.pid}.db`);
process.env.PRODUCT_PRIVATE_STORAGE_PATH = path.join(os.tmpdir(), `ningyi-layout-quality-storage-${process.pid}`);

const require = createRequire(import.meta.url);
const typescript = require("typescript");
require.extensions[".ts"] = (module, filename) => {
  const source = fs.readFileSync(filename, "utf8");
  module._compile(typescript.transpileModule(source, { compilerOptions: { module: typescript.ModuleKind.CommonJS, target: typescript.ScriptTarget.ES2022, esModuleInterop: true }, fileName: filename }).outputText, filename);
};

const { validateDeliverableLayout } = require("../lib/product/deliverable-layout-quality.ts");
const { analyzeTemplateBytes } = require("../lib/product/template-profile.ts");
const { buildFormalSolutionDocx } = require("../lib/product/deliverable-docx-renderer.ts");
const { buildFormalSolutionPdf } = require("../lib/product/deliverable-pdf-renderer.ts");
const { buildSolutionPresentation } = require("../lib/product/deliverable-pptx-renderer.ts");
const { buildOutcomeWorkbook } = require("../lib/product/deliverable-xlsx-renderer.ts");

const sections = [{
  title: "项目背景与目标",
  summary: "统一业务记录并形成可审阅的交付成果。",
  content: "背景：\n现有信息分散在多个文件中。\n目标：\n形成统一、可追溯的项目方案。",
  structuredItemsJson: "[]",
}];

test("四类生产渲染器均通过发布前布局结构质量门", async () => {
  const outputs = [
    ["docx", await buildFormalSolutionDocx("布局质量回归", sections, null)],
    ["xlsx", await buildOutcomeWorkbook("布局质量回归", "项目报价", sections, null, "preview-solution")],
    ["pptx", await buildSolutionPresentation("布局质量回归", sections, null)],
    ["pdf", await buildFormalSolutionPdf("布局质量回归", sections, null)],
  ];
  for (const [format, bytes] of outputs) {
    const checks = await validateDeliverableLayout(bytes, format);
    assert.ok(checks.length > 0, `${format} should expose layout checks`);
    assert.deepEqual(checks.filter((check) => !check.passed), [], `${format}: ${JSON.stringify(checks)}`);
  }
});

test("PPTX 画布外对象会阻止发布", async () => {
  const JSZip = require("jszip");
  const bytes = await buildSolutionPresentation("布局质量回归", sections, null);
  const archive = await JSZip.loadAsync(bytes);
  const slide = archive.file("ppt/slides/slide1.xml");
  assert.ok(slide);
  const xml = await slide.async("string");
  archive.file("ppt/slides/slide1.xml", xml.replace('<a:off x="713232" y="731520"/>', '<a:off x="999999999" y="0"/>'));
  const changed = await archive.generateAsync({ type: "nodebuffer" });
  const checks = await validateDeliverableLayout(changed, "pptx");
  assert.equal(checks.find((check) => check.code === "PPTX_SHAPES_WITHIN_CANVAS")?.passed, false);
});

test("受支持的 Office 模板样本识别率为 100% 且损坏模板明确回退", async () => {
  const samples = [
    ["docx", await buildFormalSolutionDocx("模板识别回归", sections, null)],
    ["xlsx", await buildOutcomeWorkbook("模板识别回归", "功能清单", sections, null)],
    ["pptx", await buildSolutionPresentation("模板识别回归", sections, null)],
  ];
  const results = await Promise.all(samples.map(([detectedFormat, bytes]) => analyzeTemplateBytes({ detectedFormat, bytes })));
  assert.equal(results.filter((result) => result.profile.structurallyCompatible).length / results.length, 1);
  assert.ok(results.every((result) => result.status === "profiled_default_renderer"));
  assert.ok(results.every((result) => result.fallbackReason.includes("主题颜色") || result.fallbackReason.includes("兼容页面尺寸")));
  const fallback = await analyzeTemplateBytes({ detectedFormat: "docx", bytes: Buffer.from("not-an-office-package") });
  assert.equal(fallback.status, "fallback");
  assert.match(fallback.fallbackReason, /无法完整解析/u);
});

test("BM-15 三类企业模板仅形成安全样式配置", async () => {
  const templateRoot = path.join(process.cwd(), "docs", "product", "v1-design", "benchmarks", "BM-15", "templates");
  const samples = ["docx", "xlsx", "pptx"].map((detectedFormat) => ({
    detectedFormat,
    bytes: fs.readFileSync(path.join(templateRoot, `enterprise-template.${detectedFormat}`)),
  }));
  const results = await Promise.all(samples.map((sample) => analyzeTemplateBytes(sample)));
  assert.ok(results.every((result) => result.status === "profiled_default_renderer"));
  assert.ok(results.every((result) => result.profile.structurallyCompatible === true));
  assert.ok(results.every((result) => result.profile.colors.includes("#17365D") && result.profile.colors.includes("#1F7A8C")));
  assert.ok(results.every((result) => result.profile.fonts.includes("Noto Sans CJK SC")));
  assert.ok(results.every((result) => result.renderPolicy.themeColors === "apply"));
  assert.ok(results.every((result) => result.renderPolicy.excludedContent.includes("sample_text")));
});
