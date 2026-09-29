#!/usr/bin/env node

import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const toolDir = path.dirname(fileURLToPath(import.meta.url));
const buildDir = path.join(root, ".build");
const sources = path.join(root, "sources");
const templates = path.join(root, "templates");
const brand = path.join(root, "brand");
const runtimeModules = process.env.BM15_RUNTIME_NODE_MODULES;
const runtimePython = process.env.BM15_RUNTIME_PYTHON || "python3";
const presentationSkill = process.env.BM15_PRESENTATION_SKILL;
const fixedDate = new Date("2026-09-29T00:00:00.000Z");
if (!runtimeModules || !presentationSkill) throw new Error("BM15_RUNTIME_NODE_MODULES and BM15_PRESENTATION_SKILL are required");
process.env.RUNTIME_NODE_MODULES = runtimeModules;

await fsp.mkdir(buildDir, { recursive: true });
await Promise.all([sources, templates, brand].map((directory) => fsp.mkdir(directory, { recursive: true })));
const nodeModulesLink = path.join(toolDir, "node_modules");
try {
  await fsp.symlink(runtimeModules, nodeModulesLink, "dir");
} catch (error) {
  if (error.code !== "EEXIST") throw error;
}

try {
  run(runtimePython, [path.join(toolDir, "generate-documents.py")]);
  const { SpreadsheetFile, Workbook, Presentation, PresentationFile } = await import("@oai/artifact-tool");
  const JSZip = (await import("jszip")).default;
  await buildMetricsWorkbook({ Workbook, SpreadsheetFile, JSZip });
  await buildWorkbookTemplate({ Workbook, SpreadsheetFile, JSZip });
  await buildPresentations({ Presentation, PresentationFile, JSZip });
  await fsp.copyFile(path.resolve(process.cwd(), "public/images/product-results-login-v2.png"), path.join(sources, "current-workspace.png"));
  await writeManifest();
} finally {
  for (const sidecar of [
    path.join(sources, "project-metrics.xlsx.inspect.ndjson"),
    path.join(templates, "enterprise-template.xlsx.inspect.ndjson"),
  ]) await fsp.rm(sidecar, { force: true });
  await fsp.rm(nodeModulesLink, { force: true });
  await fsp.rm(buildDir, { recursive: true, force: true });
}

async function buildMetricsWorkbook({ Workbook, SpreadsheetFile, JSZip }) {
  const workbook = Workbook.create();
  const summary = workbook.worksheets.add("项目总览");
  const roles = workbook.worksheets.add("角色工作量");
  const milestones = workbook.worksheets.add("里程碑");
  for (const sheet of [summary, roles, milestones]) sheet.showGridLines = false;
  summary.getRange("A2:D2").merge(); summary.getRange("A2").values = [["项目工作量与报价基线"]];
  summary.getRange("A4:B11").values = [["指标","数值"],["注册用户",260],["基准工作量（人天）",324],["风险储备率",0.12],["税率",0.06],["角色未税小计",519600],["含风险未税金额",581952],["含税总额",616869.12]];
  summary.getRange("B9").formulas = [["=SUM('角色工作量'!D2:D6)"]];
  summary.getRange("B10").formulas = [["=B9*(1+B7)"]];
  summary.getRange("B11").formulas = [["=B10*(1+B8)"]];
  roles.getRange("A1:D6").values = [["角色","人天","日单价（元）","小计（元）"],["产品经理",48,1800,null],["架构师",42,2200,null],["后端工程师",96,1600,null],["前端工程师",72,1500,null],["测试工程师",66,1200,null]];
  roles.getRange("D2").formulas = [["=B2*C2"]]; roles.getRange("D2:D6").fillDown();
  milestones.getRange("A1:D6").values = [["里程碑","计划日期","退出条件","状态"],["需求基线",new Date("2027-12-05"),"关键需求和来源确认","计划"],["方案评审",new Date("2028-01-15"),"架构与工作量通过评审","计划"],["开发完成",new Date("2028-04-05"),"阻断缺陷为零","计划"],["试运行",new Date("2028-05-05"),"连续运行和恢复演练通过","计划"],["正式上线",new Date("2028-05-31"),"验收和回退方案签字","计划"]];
  formatWorkbook(workbook);
  summary.getRange("A2:D2").format.fill = "#FFFFFF";
  summary.getRange("A2:D2").format.font = { name: "Noto Sans CJK SC", size: 16, bold: true, color: "#17365D" };
  summary.getRange("A4:B4").format.fill = "#17365D";
  summary.getRange("A4:B4").format.font = { name: "Noto Sans CJK SC", size: 10, bold: true, color: "#FFFFFF" };
  summary.getRange("B7:B8").format.numberFormat = "0%";
  summary.getRange("B9:B11").format.numberFormat = "#,##0.00";
  summary.getRange("A1:A20").format.columnWidth = 28;
  summary.getRange("B1:B20").format.columnWidth = 22;
  roles.getRange("B2:B6").format.numberFormat = "#,##0"; roles.getRange("C2:D6").format.numberFormat = "#,##0.00";
  roles.getRange("A1:A20").format.columnWidth = 24;
  roles.getRange("B1:B20").format.columnWidth = 12;
  roles.getRange("C1:D20").format.columnWidth = 18;
  milestones.getRange("B2:B6").format.numberFormat = "yyyy-mm-dd";
  milestones.getRange("A1:A20").format.columnWidth = 18;
  milestones.getRange("B1:B20").format.columnWidth = 16;
  milestones.getRange("C1:C20").format.columnWidth = 42;
  milestones.getRange("D1:D20").format.columnWidth = 12;
  summary.freezePanes.freezeRows(3); roles.freezePanes.freezeRows(1); milestones.freezePanes.freezeRows(1);
  workbook.recalculate();
  const check = await workbook.inspect({ kind: "table", sheetId: "项目总览", range: "A2:D11", include: "values,formulas", tableMaxRows: 12, tableMaxCols: 6, maxChars: 5000 });
  if (!check.ndjson.includes("616869.12")) throw new Error("BM15 workbook total did not recalculate");
  await saveWorkbook(workbook, SpreadsheetFile, JSZip, path.join(sources, "project-metrics.xlsx"), "metrics");
}

async function buildWorkbookTemplate({ Workbook, SpreadsheetFile, JSZip }) {
  const workbook = Workbook.create();
  const cover = workbook.worksheets.add("封面");
  const table = workbook.worksheets.add("示例表");
  cover.showGridLines = false; table.showGridLines = false;
  cover.getRange("B3:E4").merge(); cover.getRange("B3").values = [["企业项目成果模板"]];
  cover.getRange("B6:E6").merge(); cover.getRange("B6").values = [["客户名称  项目名称  版本日期"]];
  cover.getRange("B10:E10").merge(); cover.getRange("B10").values = [["TEMPLATE-ONLY 999999 仅用于样式展示，不得复制到正式成果"]];
  table.getRange("A1:D4").values = [["示例编号","示例名称","示例金额","说明"],["TMP-001","占位需求",999999,"禁止进入正式成果"],["TMP-002","占位功能",888888,"禁止进入正式成果"],["TMP-003","占位报价",777777,"禁止进入正式成果"]];
  formatWorkbook(workbook);
  cover.getRange("B3:E4").format.fill = "#FFFFFF";
  cover.getRange("B3:E4").format.font = { name: "Noto Sans CJK SC", size: 16, bold: true, color: "#17365D" };
  cover.getRange("B3:E10").format.horizontalAlignment = "center";
  cover.getRange("B1:E20").format.columnWidth = 16;
  table.getRange("C2:C4").format.numberFormat = "#,##0";
  table.getRange("A1:A20").format.columnWidth = 18;
  table.getRange("B1:B20").format.columnWidth = 24;
  table.getRange("C1:C20").format.columnWidth = 18;
  table.getRange("D1:D20").format.columnWidth = 28;
  workbook.recalculate();
  await saveWorkbook(workbook, SpreadsheetFile, JSZip, path.join(templates, "enterprise-template.xlsx"), "template");
}

function formatWorkbook(workbook) {
  for (const sheet of workbook.worksheets.items) {
    const used = sheet.getUsedRange();
    if (!used) continue;
    used.format.font = { name: "Noto Sans CJK SC", size: 10, color: "#243B53" };
    used.format.verticalAlignment = "center";
    used.format.wrapText = true;
    used.format.autofitColumns(); used.format.autofitRows();
    const firstRow = used.getRow(0);
    firstRow.format.fill = "#17365D";
    firstRow.format.font = { name: "Noto Sans CJK SC", size: 10, bold: true, color: "#FFFFFF" };
    firstRow.format.horizontalAlignment = "center";
    used.format.borders = { preset: "all", style: "thin", color: "#D9D9D9" };
  }
}

async function saveWorkbook(workbook, SpreadsheetFile, JSZip, output, label) {
  const previewSheet = workbook.worksheets.getItemAt(0).name;
  const preview = await workbook.render({ sheetName: previewSheet, autoCrop: "all", scale: 1, format: "png" });
  await fsp.writeFile(path.join(buildDir, `${label}.png`), new Uint8Array(await preview.arrayBuffer()));
  const errors = await workbook.inspect({ kind: "match", searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A|#NUM!|#NULL!|#SPILL!|#CALC!", options: { useRegex: true, maxResults: 100 }, maxChars: 3000 });
  if (/"address"/.test(errors.ndjson)) throw new Error(`${label} contains formula errors`);
  const file = await SpreadsheetFile.exportXlsx(workbook);
  await file.save(output);
  await normalizeOffice(output, JSZip, "xl/theme/theme1.xml");
}

async function buildPresentations({ Presentation, PresentationFile, JSZip }) {
  const current = Presentation.create({ slideSize: { width: 1280, height: 720 } });
  addCover(current, "项目交付协同平台现状", "版本分散、数据不一致和模板污染需要统一治理");
  addTextSlide(current, "当前协作问题", ["需求在 Word 和会议纪要中重复维护", "工作量和报价表使用不同版本的角色单价", "历史演示材料仍写 AWS S3，与私有 MinIO 目标冲突", "客户交付包曾混入内部成本列"]);
  addFlowSlide(current);
  addMetricSlide(current);
  addTextSlide(current, "首期范围", ["统一材料解析和来源追溯", "同一项目模型生成七类成果", "模板只提供颜色、字体和页面尺寸", "私有 PostgreSQL 与私有 MinIO"]);
  addTextSlide(current, "明确排除", ["不建设通用 CRM 或财务核算", "不复制模板示例正文、宏或外部链接", "不使用 AWS S3 或公共 Bucket", "不提供人工代写交付"]);
  await savePresentation(current, PresentationFile, JSZip, path.join(sources, "current-process.pptx"), 6, "current");

  const template = Presentation.create({ slideSize: { width: 1280, height: 720 } });
  addCover(template, "企业方案标题", "客户名称  项目名称  版本日期");
  addTextSlide(template, "章节标题", ["这里是模板示例正文，不属于任何项目事实", "TEMPLATE-ONLY 999999", "正式成果不得复制本页示例文字"]);
  addMetricSlide(template, true);
  await savePresentation(template, PresentationFile, JSZip, path.join(templates, "enterprise-template.pptx"), 3, "template");
}

function addCover(presentation, title, subtitle) {
  const slide = presentation.slides.add(); slide.background.fill = "#F4F8FB";
  addText(slide, title, 86, 190, 1108, 90, 48, "#17365D", true);
  addText(slide, subtitle, 90, 300, 1080, 55, 22, "#486581", false);
  addText(slide, "明澜科技  2026", 90, 610, 400, 30, 15, "#627D98", false);
}

function addTextSlide(presentation, title, lines) {
  const slide = presentation.slides.add(); slide.background.fill = "#FFFFFF";
  addTitle(slide, title);
  lines.forEach((line, index) => { addText(slide, String(index + 1).padStart(2, "0"), 90, 165 + index * 105, 65, 45, 22, "#1F7A8C", true); addText(slide, line, 180, 158 + index * 105, 950, 60, 24, "#243B53", false); });
}

function addFlowSlide(presentation) {
  const slide = presentation.slides.add(); slide.background.fill = "#FFFFFF"; addTitle(slide, "目标业务链路");
  const labels = ["项目材料", "统一知识", "项目模型", "七类成果", "成果包"];
  labels.forEach((label, index) => {
    const left = 60 + index * 240;
    const shape = slide.shapes.add({ geometry: "roundRect", position: { left, top: 280, width: 190, height: 95 }, fill: index % 2 ? "#EAF3F7" : "#17365D", line: { fill: "#17365D", width: 2 } });
    shape.text = label; shape.text.style = { typeface: "Noto Sans CJK SC", fontSize: 23, bold: true, color: index % 2 ? "#17365D" : "#FFFFFF", autoFit: "shrinkText" };
    if (index < labels.length - 1) addText(slide, "›", left + 196, 294, 38, 50, 34, "#1F7A8C", true);
  });
}

function addMetricSlide(presentation, templateOnly = false) {
  const slide = presentation.slides.add(); slide.background.fill = "#FFFFFF"; addTitle(slide, templateOnly ? "关键数字版式" : "工作量与报价基线");
  const metrics = templateOnly ? [["999999","模板占位金额"],["88%","模板占位比例"],["12","模板占位周期"]] : [["324","基准人天"],["12%","风险储备"],["616,869.12","含税总额（元）"]];
  metrics.forEach(([value, label], index) => { const left = 85 + index * 395; addText(slide, value, left, 235, 330, 90, 45, index === 1 ? "#1F7A8C" : "#17365D", true); addText(slide, label, left, 340, 330, 45, 20, "#486581", false); });
  addText(slide, templateOnly ? "TEMPLATE-ONLY  本页数字不得进入正式成果" : "角色未税小计 519,600 元，含风险未税金额 581,952 元，税率 6%", 85, 500, 1110, 50, 20, "#243B53", false);
}

function addTitle(slide, title) { addText(slide, title, 72, 52, 1136, 66, 34, "#17365D", true); const line = slide.shapes.add({ geometry: "rect", position: { left: 72, top: 126, width: 110, height: 6 }, fill: "#1F7A8C", line: { fill: "none", width: 0 } }); return line; }
function addText(slide, value, left, top, width, height, size, color, bold) { const shape = slide.shapes.add({ geometry: "textbox", position: { left, top, width, height }, fill: "none", line: { fill: "none", width: 0 } }); shape.text = value; shape.text.style = { typeface: "Noto Sans CJK SC", fontSize: size, bold, color, autoFit: "shrinkText" }; return shape; }

async function savePresentation(presentation, PresentationFile, JSZip, output, slideCount, label) {
  const staging = path.join(buildDir, label); await fsp.mkdir(staging, { recursive: true });
  const candidatePath = path.join(staging, "candidate.pptx");
  await (await PresentationFile.exportPptx(presentation)).save(candidatePath);
  const { finalizePresentation } = await import(pathToFileURL(path.join(presentationSkill, "container_tools/artifact_tool_utils.mjs")).href);
  await fsp.rm(output, { force: true });
  await finalizePresentation({
    explicitTotalSlideCount: slideCount, requiredNativeTableOwnerSlides: [], requiredNativeChartOwnerSlides: [],
    workspaceDir: root, candidatePath, finalPath: output, pythonExecutable: runtimePython,
    integrityValidatorPath: path.join(presentationSkill, "container_tools/inspect_presentation_package_integrity.py"),
    layoutValidatorPath: path.join(presentationSkill, "container_tools/inspect_presentation_layout_geometry.py"),
    layoutArgs: ["--expected-slide-size-emu", "12192000,6858000", "--validate-heading-fit"],
    fontPolicy: { basis: "design", families: ["Noto Sans CJK SC"] }, verifyArtifactToolImport: true,
    receiptPath: path.join(staging, "validation.json"),
  });
  await normalizeOffice(output, JSZip, "ppt/theme/theme1.xml");
}

async function normalizeOffice(output, JSZip, themePath) {
  const archive = await JSZip.loadAsync(await fsp.readFile(output));
  const core = archive.file("docProps/core.xml");
  if (core) {
    let xml = await core.async("string");
    xml = xml.replace(/<dcterms:created[^>]*>.*?<\/dcterms:created>/g, '<dcterms:created xsi:type="dcterms:W3CDTF">2026-09-29T00:00:00Z</dcterms:created>').replace(/<dcterms:modified[^>]*>.*?<\/dcterms:modified>/g, '<dcterms:modified xsi:type="dcterms:W3CDTF">2026-09-29T00:00:00Z</dcterms:modified>');
    archive.file("docProps/core.xml", xml);
  }
  const theme = archive.file(themePath);
  if (theme) {
    let xml = await theme.async("string");
    xml = xml
      .replace(/(<a:accent1>[\s\S]*?<a:srgbClr\s+val=")[0-9A-F]{6}/i, (_match, prefix) => `${prefix}17365D`)
      .replace(/(<a:accent2>[\s\S]*?<a:srgbClr\s+val=")[0-9A-F]{6}/i, (_match, prefix) => `${prefix}1F7A8C`)
      .replace(/(<a:accent3>[\s\S]*?<a:srgbClr\s+val=")[0-9A-F]{6}/i, (_match, prefix) => `${prefix}EAF3F7`)
      .replace(/(<a:(?:latin|ea|cs)\b[^>]*\btypeface=")[^"]*/gi, (_match, prefix) => `${prefix}Noto Sans CJK SC`);
    archive.file(themePath, xml);
  }
  await normalizeRelationshipIds(archive);
  for (const [name, entry] of Object.entries(archive.files)) {
    if (entry.dir || !name.endsWith(".xml")) continue;
    let xml = await entry.async("string");
    let creationIndex = 0;
    xml = xml.replace(/(<a16:creationId\s+id=")\{[^"}]+\}("[^>]*\/?>)/g, (_match, prefix, suffix) => {
      creationIndex += 1;
      return `${prefix}{00000000-0000-4000-8000-${String(creationIndex).padStart(12, "0")}}${suffix}`;
    });
    let slideIndex = 0;
    xml = xml.replace(/(<p14:creationId\s+val=")\d+("[^>]*\/?>)/g, (_match, prefix, suffix) => {
      slideIndex += 1;
      return `${prefix}${100000000 + slideIndex}${suffix}`;
    });
    archive.file(name, xml);
  }
  for (const entry of Object.values(archive.files)) entry.date = fixedDate;
  await fsp.writeFile(output, await archive.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 6 }, platform: "DOS" }));
}

async function normalizeRelationshipIds(archive) {
  const relationshipPaths = Object.keys(archive.files).filter((name) => name.endsWith(".rels")).sort();
  for (const relationshipPath of relationshipPaths) {
    const relationshipEntry = archive.file(relationshipPath);
    if (!relationshipEntry) continue;
    let relationships = await relationshipEntry.async("string");
    const ids = [...relationships.matchAll(/\bId="([^"]+)"/g)].map((match) => match[1]);
    const ownerPath = relationshipPath === "_rels/.rels"
      ? null
      : path.posix.join(path.posix.dirname(path.posix.dirname(relationshipPath)), path.posix.basename(relationshipPath, ".rels"));
    const ownerEntry = ownerPath ? archive.file(ownerPath) : null;
    let owner = ownerEntry ? await ownerEntry.async("string") : null;
    ids.forEach((id, index) => {
      const normalized = `rId${index + 1}`;
      relationships = relationships.split(id).join(normalized);
      if (owner !== null) owner = owner.split(id).join(normalized);
    });
    archive.file(relationshipPath, relationships);
    if (ownerPath && owner !== null) archive.file(ownerPath, owner);
  }
}

async function writeManifest() {
  const entries = [
    ...["automatic-content-checks.json","deterministic-values.json","expected-relations.json","key-facts.json","prohibited-claims.json","scoring-rubric.json"].map((name) => [`expected/${name}`,"content","json"]),
    ["intake.json","content","json"], ["sources/platform-requirements.docx","content","docx"], ["sources/solution-reference.pdf","content","pdf"], ["sources/current-process.pptx","content","pptx"], ["sources/project-metrics.xlsx","content","xlsx"], ["sources/current-workspace.png","content","png"],
    ["templates/enterprise-template.docx","template","docx"], ["templates/enterprise-template.xlsx","template","xlsx"], ["templates/enterprise-template.pptx","template","pptx"], ["brand/brand-guidelines.pdf","brand","pdf"],
  ];
  const files = await Promise.all(entries.map(async ([relative, category, format]) => ({ path: relative, sha256: createHash("sha256").update(await fsp.readFile(path.join(root, relative))).digest("hex"), category, format, licenseStatus: "synthetic" })));
  const manifest = { benchmarkId: "BM-15", benchmarkVersion: "1.0", title: "多格式与企业模板综合项目", projectType: "hybrid", difficulty: "L4",
    coverageTags: ["all_supported_formats","enterprise_templates","brand_profile","long_document","deterministic_pricing","cross_deliverable_consistency","deliverable_package"],
    expectedScale: { requirements: { min: 24, max: 60 }, features: { min: 20, max: 52 }, solutionCharacters: { min: 22000, max: 50000 }, slideCount: { min: 14, max: 28 } }, timeoutSeconds: 3000,
    blockingChecks: ["all_manifest_hashes_match","all_input_formats_parsed","three_template_profiles_compatible","template_sample_content_excluded","brand_policy_applied","deterministic_amounts_consistent","seven_deliverables_and_packages_valid","all_formal_claims_have_source_refs"], files };
  await fsp.writeFile(path.join(root, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}

function run(command, args) { const result = spawnSync(command, args, { cwd: process.cwd(), encoding: "utf8", maxBuffer: 10 * 1024 * 1024 }); if (result.error || result.status !== 0) throw new Error(result.stderr || result.stdout || result.error?.message || "command failed"); }
