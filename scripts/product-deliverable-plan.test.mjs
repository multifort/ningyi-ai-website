import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const source = fs.readFileSync(path.join(process.cwd(), "lib", "product", "deliverables.ts"), "utf8");
const publicationSource = fs.readFileSync(path.join(process.cwd(), "lib", "product", "deliverable-publication.ts"), "utf8");
const docxRendererSource = fs.readFileSync(path.join(process.cwd(), "lib", "product", "deliverable-docx-renderer.ts"), "utf8");
const pdfRendererSource = fs.readFileSync(path.join(process.cwd(), "lib", "product", "deliverable-pdf-renderer.ts"), "utf8");
const sharedRenderingSource = fs.readFileSync(path.join(process.cwd(), "lib", "product", "deliverable-rendering-shared.ts"), "utf8");

test("渐进成果与最终渲染复用同一成果定义和生成入口", () => {
  const definitionBlock = source.split("const progressiveDeliverableDefinitions", 2)[1]?.split("export async function ensurePrimaryDeliverables", 1)[0] || "";
  const primaryBlock = source.split("export async function ensurePrimaryDeliverables", 2)[1]?.split("export async function ensureProgressiveDeliverables", 1)[0] || "";
  const progressiveBlock = source.split("export async function ensureProgressiveDeliverables", 2)[1]?.split("export async function buildFormalSolutionDocx", 1)[0] || "";

  for (const artifactType of ["requirement_analysis_docx", "function_catalog_xlsx", "workload_estimate_xlsx", "implementation_plan_xlsx", "project_quote_xlsx"]) {
    assert.match(definitionBlock, new RegExp(`artifactType: \\"${artifactType}\\"`));
  }
  assert.match(primaryBlock, /ensureDeclaredProgressiveDeliverables/u);
  assert.match(progressiveBlock, /ensureDeclaredProgressiveDeliverables/u);
  assert.doesNotMatch(primaryBlock, /const workbookDefinitions/u);
  assert.doesNotMatch(progressiveBlock, /const definitions\s*=\s*\[/u);

  const dependencyBlock = publicationSource.split("const dependencies: Record<string, string[]>", 2)[1]?.split("return dependencies", 1)[0] || "";
  for (const artifactType of ["requirement_analysis_pdf", "function_catalog_docx", "workload_estimate_pdf", "implementation_plan_pdf", "solution_briefing_pdf"]) {
    assert.match(dependencyBlock, new RegExp(`${artifactType}:`), `${artifactType} must not fall back to all-section invalidation`);
  }
});

test("成果发布、版本和失效处理与格式渲染边界分离", () => {
  assert.match(source, /publishDeliverable\(input, renderWorkerContext\.getStore\(\)\)/u);
  assert.doesNotMatch(source, /INSERT OR IGNORE INTO deliverable_artifact_versions/u);
  assert.match(publicationSource, /INSERT OR IGNORE INTO deliverable_artifact_versions/u);
  assert.match(publicationSource, /export function invalidateDeliverablesForTemplate/u);
  assert.match(publicationSource, /export function supersedeStaleRenderedArtifacts/u);
});

test("PDF 渲染与共享内容解析脱离成果编排模块", () => {
  assert.match(source, /pdfRenderer\.buildFormalSolutionPdf/u);
  assert.match(source, /pdfRenderer\.buildQuotePdf/u);
  assert.doesNotMatch(source, /new PDFDocument/u);
  assert.match(pdfRendererSource, /export async function buildFormalSolutionPdf/u);
  assert.match(pdfRendererSource, /export async function buildQuotePdf/u);
  assert.match(sharedRenderingSource, /export function parseStructuredItems/u);
  assert.match(sharedRenderingSource, /export function withQuoteOverrides/u);
});

test("DOCX 渲染脱离成果编排模块并复用共享主题边界", () => {
  assert.match(source, /docxRenderer\.buildFormalSolutionDocx/u);
  assert.doesNotMatch(source, /new Document/u);
  assert.match(docxRendererSource, /export async function buildFormalSolutionDocx/u);
  assert.match(docxRendererSource, /documentPageSize\(theme\)/u);
  assert.match(sharedRenderingSource, /export function documentPageSize/u);
});
