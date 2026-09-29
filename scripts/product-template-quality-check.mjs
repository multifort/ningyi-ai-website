#!/usr/bin/env node

import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

const repoRoot = process.cwd();
const requestedOutput = process.argv[2];
const outputDir = path.resolve(requestedOutput || await fsp.mkdtemp(path.join(os.tmpdir(), "ningyi-template-quality-")));
const renderRoot = path.join(outputDir, "render-back");
const title = "销售运营管理系统建设方案";
await fsp.mkdir(renderRoot, { recursive: true });

run(process.execPath, [path.join(repoRoot, "scripts", "product-template-preview.mjs"), outputDir]);

const soffice = findExecutable("SOFFICE_BIN", "soffice");
const pdftoppm = findExecutable("PDFTOPPM_BIN", "pdftoppm");
const pdfinfo = findExecutable("PDFINFO_BIN", "pdfinfo");
const pdftotext = findExecutable("PDFTOTEXT_BIN", "pdftotext", [
  path.resolve(path.dirname(pdfinfo), "../../native/poppler/poppler/bin/pdftotext"),
  path.resolve(path.dirname(pdfinfo), "../../native/poppler/bin/pdftotext"),
  path.join(path.dirname(pdfinfo), "pdftotext"),
]);

const fontConfigDir = path.join(outputDir, ".fontconfig");
const fontCacheDir = path.join(fontConfigDir, "cache");
const officeProfile = path.join(outputDir, ".office-profile");
await Promise.all([fontCacheDir, officeProfile].map((directory) => fsp.mkdir(directory, { recursive: true })));
const fontConfigPath = path.join(fontConfigDir, "fonts.conf");
await fsp.writeFile(fontConfigPath, fontConfigXml(path.join(repoRoot, "assets", "fonts"), fontCacheDir), "utf8");
const renderEnv = {
  ...process.env,
  XDG_CACHE_HOME: fontCacheDir,
  FONTCONFIG_FILE: fontConfigPath,
};

const definitions = [
  { format: "docx", source: path.join(outputDir, "preview.docx"), expectedText: "项目背景与目标" },
  { format: "xlsx", source: path.join(outputDir, "preview.xlsx"), expectedText: "项目报价", expectedCalculatedText: "20,352.00" },
  { format: "pptx", source: path.join(outputDir, "preview.pptx"), expectedText: "企业项目整体解决方案" },
  { format: "pdf", source: path.join(outputDir, "preview.pdf"), expectedText: "项目背景与目标" },
];
const reports = [];

for (const definition of definitions) {
  const targetDir = path.join(renderRoot, definition.format);
  await fsp.mkdir(targetDir, { recursive: true });
  let pdfPath = definition.source;
  if (definition.format !== "pdf") {
    run(soffice, [
      `-env:UserInstallation=${pathToFileURL(officeProfile).href}`,
      "--headless",
      "--convert-to",
      "pdf",
      "--outdir",
      targetDir,
      definition.source,
    ], renderEnv);
    pdfPath = path.join(targetDir, "preview.pdf");
  }
  if (!fs.existsSync(pdfPath) || fs.statSync(pdfPath).size < 1000) throw new Error(`${definition.format}: PDF_RENDER_FAILED`);

  const info = run(pdfinfo, [pdfPath], renderEnv);
  const pageCount = Number(info.match(/^Pages:\s+(\d+)/m)?.[1] || 0);
  const pageSize = info.match(/^Page size:\s+([\d.]+) x ([\d.]+) pts/m);
  const pageWidth = Number(pageSize?.[1] || 0);
  const pageHeight = Number(pageSize?.[2] || 0);
  const rasterPrefix = path.join(targetDir, "page");
  run(pdftoppm, ["-png", "-r", "120", pdfPath, rasterPrefix], renderEnv);
  const pageFiles = (await fsp.readdir(targetDir)).filter((name) => /^page-\d+\.png$/.test(name)).sort(naturalPageSort);
  const rasterPages = pageFiles.map((name) => inspectPng(path.join(targetDir, name)));
  const textPath = path.join(targetDir, "text.txt");
  run(pdftotext, ["-layout", pdfPath, textPath], renderEnv);
  const text = await fsp.readFile(textPath, "utf8");
  const checks = [
    { code: "PDF_PAGE_COUNT", passed: pageCount > 0 && pageFiles.length === pageCount, actual: { pageCount, rasterPages: pageFiles.length } },
    { code: "PDF_PAGE_SIZE", passed: pageWidth >= 500 && pageHeight >= 500, actual: { pageWidth, pageHeight } },
    { code: "RASTER_PAGE_DIMENSIONS", passed: rasterPages.length > 0 && rasterPages.every((page) => page.width >= 800 && page.height >= 800 && page.bytes >= 5000), actual: rasterPages },
    { code: "RENDERED_TITLE_RECOVERABLE", passed: text.includes(title), actual: title },
    { code: "RENDERED_CONTENT_RECOVERABLE", passed: text.includes(definition.expectedText), actual: definition.expectedText },
    ...(definition.expectedCalculatedText ? [{ code: "XLSX_FORMULA_RECALCULATED", passed: text.includes(definition.expectedCalculatedText), actual: definition.expectedCalculatedText }] : []),
    { code: "NO_TEXT_REPLACEMENT_CHARACTERS", passed: !text.includes("�") },
  ];
  reports.push({ format: definition.format, source: path.basename(definition.source), pdf: path.relative(outputDir, pdfPath), pages: pageFiles.map((name) => path.relative(outputDir, path.join(targetDir, name))), checks });
}

const report = { status: reports.every((item) => item.checks.every((check) => check.passed)) ? "pass" : "fail", outputDir, generatedAt: new Date().toISOString(), reports };
await fsp.writeFile(path.join(outputDir, "template-quality-report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
const summary = { status: report.status, outputDir: requestedOutput || null, formats: reports.map((item) => ({ format: item.format, pages: item.pages.length, checks: item.checks.length })) };
process.stdout.write(`${JSON.stringify(summary)}\n`);
if (report.status !== "pass") process.exitCode = 1;
else if (!requestedOutput) await fsp.rm(outputDir, { recursive: true, force: true });

function run(command, args, env = process.env) {
  const result = spawnSync(command, args, { cwd: repoRoot, env, encoding: "utf8", maxBuffer: 10 * 1024 * 1024 });
  if (result.error || result.status !== 0) {
    throw new Error(`${path.basename(command)} failed (${result.status ?? "spawn"}): ${(result.stderr || result.stdout || result.error?.message || "unknown error").trim()}`);
  }
  return `${result.stdout || ""}${result.stderr || ""}`;
}

function findExecutable(envName, name, candidates = []) {
  const configured = process.env[envName];
  if (configured && isExecutable(configured)) return configured;
  const found = spawnSync("/usr/bin/which", [name], { encoding: "utf8" });
  const fromPath = found.status === 0 ? found.stdout.trim() : "";
  for (const candidate of [fromPath, ...candidates]) if (candidate && isExecutable(candidate)) return candidate;
  throw new Error(`${name.toUpperCase()}_NOT_AVAILABLE`);
}

function isExecutable(value) {
  try {
    fs.accessSync(value, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function fontConfigXml(fontDir, cacheDir) {
  const escape = (value) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `<?xml version="1.0"?>
<!DOCTYPE fontconfig SYSTEM "fonts.dtd">
<fontconfig>
  <dir>${escape(fontDir)}</dir>
  <cachedir>${escape(cacheDir)}</cachedir>
  <alias><family>Hiragino Sans GB</family><prefer><family>Noto Sans CJK SC</family></prefer></alias>
  <alias><family>Microsoft YaHei</family><prefer><family>Noto Sans CJK SC</family></prefer></alias>
</fontconfig>\n`;
}

function inspectPng(filename) {
  const bytes = fs.readFileSync(filename);
  const signature = bytes.subarray(0, 8).toString("hex");
  if (signature !== "89504e470d0a1a0a" || bytes.subarray(12, 16).toString("ascii") !== "IHDR") {
    return { file: path.basename(filename), width: 0, height: 0, bytes: bytes.length };
  }
  return { file: path.basename(filename), width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20), bytes: bytes.length };
}

function naturalPageSort(left, right) {
  return Number(left.match(/\d+/)?.[0] || 0) - Number(right.match(/\d+/)?.[0] || 0);
}
