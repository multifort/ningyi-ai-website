import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const typescript = require("typescript");
const fsSync = require("node:fs");
const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ningyi-quote-parameters-test-"));
process.env.PRODUCT_DB_PATH = path.join(tempDir, "isolated-product.db");
require.extensions[".ts"] = (module, filename) => {
  const source = fsSync.readFileSync(filename, "utf8");
  module._compile(typescript.transpileModule(source, { compilerOptions: { module: typescript.ModuleKind.CommonJS, target: typescript.ScriptTarget.ES2022, esModuleInterop: true }, fileName: filename }).outputText, filename);
};
const { productSqlite } = require("../lib/product/db.ts");
const params = require("../lib/product/quote-parameters.ts");
const { buildOutcomeWorkbook, buildQuotePdf, calculateQuoteSummary } = require("../lib/product/deliverables.ts");
const userId = "90000000-0000-4000-8000-000000000001";
const solutionId = "10000000-0000-4000-8000-000000000001";

test("quote parameter changes are validated, owner-scoped and invalidate only deterministic affected artifacts", async () => {
  try {
    productSqlite.prepare("INSERT INTO product_users (id, username, username_normalized, password_hash) VALUES (?, 'quote-owner', 'quote-owner', 'test')").run(userId);
    productSqlite.prepare("INSERT INTO product_solutions (id, owner_user_id, title, status, stage) VALUES (?, ?, '报价测试', 'completed', 'completed')").run(solutionId, userId);
    const sections = Array.from({ length: 7 }, (_, index) => ({ title: `章节${index}`, content: "已校验章节正文", items: [] }));
    sections[4].items = [
      { kind: "estimation_item", code: "EST-001", title: "商机管理", description: "", sourceBlockIds: [], attributes: ["base_days=10", "complexity_factor=1.2", "reuse_factor=1", "integration_factor=1", "security_factor=1", "uncertainty_factor=1"].map((entry) => { const [key, value] = entry.split("="); return { key, value }; }) },
    ];
    const insertSection = productSqlite.prepare("INSERT INTO formal_sections (id, solution_id, section_index, section_key, title, status, content, structured_items_json) VALUES (?, ?, ?, ?, ?, 'validated', ?, ?)");
    sections.forEach((section, index) => insertSection.run(`80000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`, solutionId, index, `section_${index}`, section.title, section.content, JSON.stringify(section.items)));
    const insertArtifact = productSqlite.prepare("INSERT INTO deliverable_artifacts (id, solution_id, user_id, artifact_type, display_name, mime_type, storage_key, size_bytes, sha256, quality_json) VALUES (?, ?, ?, ?, ?, 'application/octet-stream', 'key', 1024, 'sha', '{}')");
    insertArtifact.run("70000000-0000-4000-8000-000000000001", solutionId, userId, "project_quote_xlsx", "quote");
    insertArtifact.run("70000000-0000-4000-8000-000000000002", solutionId, userId, "formal_solution_docx", "solution");

    const beforeFingerprint = params.quoteParameterFingerprint(solutionId, true);
    const result = params.updateQuoteParameters(solutionId, userId, [
      { code: "EST-001", key: "base_days", value: 12 }, { code: "QUOTE-DEFAULT", key: "daily_rate", value: 1500 },
      { code: "QUOTE-DEFAULT", key: "tax_rate", value: 0.06 }, { code: "QUOTE-DEFAULT", key: "discount_rate", value: 0.05 }, { code: "QUOTE-DEFAULT", key: "valid_days", value: 30 },
    ]);
    assert.equal(result.renderQueued, true);
    assert.deepEqual(result.invalidatedArtifacts, ["workload_estimate_xlsx", "project_quote_xlsx", "project_quote_pdf"]);
    assert.notEqual(params.quoteParameterFingerprint(solutionId, true), beforeFingerprint);
    assert.equal(productSqlite.prepare("SELECT status FROM deliverable_artifacts WHERE artifact_type = 'project_quote_xlsx'").get().status, "superseded");
    assert.equal(productSqlite.prepare("SELECT status FROM deliverable_artifacts WHERE artifact_type = 'formal_solution_docx'").get().status, "available");
    assert.equal(productSqlite.prepare("SELECT stage FROM product_solutions WHERE id = ?").get(solutionId).stage, "rendering");
    const xlsx = await buildOutcomeWorkbook("报价测试", "项目报价", sections.slice(4, 6).map((section) => ({ title: section.title, content: section.content, summary: section.content, structuredItemsJson: JSON.stringify(section.items) })), null, solutionId);
    const ExcelJS = require("exceljs");
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(xlsx);
    const quoteSheet = workbook.getWorksheet("报价计算");
    assert.ok(Math.abs(quoteSheet.getCell("C3").value - 14.4) < 1e-9);
    assert.equal(quoteSheet.getCell("D3").value, 1500);
    assert.equal(quoteSheet.getCell("F3").value, 0.05);
    assert.match(quoteSheet.getCell("I3").value.formula, /G3\*\(1\+H3\)/);
    assert.equal(workbook.getWorksheet("报价说明").getCell("B6").value, "30 天");
    const pdf = await buildQuotePdf("报价测试", sections.slice(4, 6).map((section) => ({ title: section.title, content: section.content, summary: section.content, structuredItemsJson: JSON.stringify(section.items) })), null, solutionId);
    assert.equal(pdf.subarray(0, 5).toString("ascii"), "%PDF-");
    assert.ok(pdf.length > 3000);
    const structured = [
      { kind: "estimation_item", code: "EST-001", title: "商机管理", description: "", sourceBlockIds: [], attributes: ["base_days=12", "complexity_factor=1.2", "reuse_factor=1", "integration_factor=1", "security_factor=1", "uncertainty_factor=1"].map((entry) => { const [key, value] = entry.split("="); return { key, value }; }) },
      { kind: "quote_assumption", code: "QUOTE-DEFAULT", title: "项目报价整体参数", description: "", sourceBlockIds: [], attributes: ["daily_rate=1500", "tax_rate=0.06", "discount_rate=0.05", "valid_days=30"].map((entry) => { const [key, value] = entry.split("="); return { key, value }; }) },
    ];
    assert.equal(calculateQuoteSummary(structured).total, 21751.2);
    assert.equal(calculateQuoteSummary(structured).rows[0].factorChain, "1.2×1×1×1×1");
    assert.equal(calculateQuoteSummary(structured.map((item) => item.code === "EST-001" ? { ...item, attributes: item.attributes.filter(({ key }) => key !== "security_factor") } : item)).total, null);
    assert.equal(calculateQuoteSummary(structured.map((item) => item.code === "QUOTE-DEFAULT" ? { ...item, attributes: item.attributes.filter(({ key }) => key !== "tax_rate") } : item)).total, null);
    const view = params.listQuoteParameters(solutionId, userId);
    assert.equal(view.find((item) => item.code === "EST-001").parameters.find((item) => item.key === "base_days").value, 12);
    assert.throws(() => params.updateQuoteParameters(solutionId, userId, [{ code: "QUOTE-DEFAULT", key: "tax_rate", value: 1.2 }]), /INVALID_QUOTE_PARAMETER_VALUE/);
    assert.throws(() => params.listQuoteParameters(solutionId, "90000000-0000-4000-8000-000000000099"), /SOLUTION_NOT_FOUND/);
  } finally { productSqlite.close(); }
});

test.after(async () => fs.rm(tempDir, { recursive: true, force: true }));
