#!/usr/bin/env node

// Generates disposable, deterministic samples from the production renderers.
// This checks default layout only; the sample wording is not a style reference.
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const typescript = require("typescript");
require.extensions[".ts"] = (module, filename) => {
  const source = require("node:fs").readFileSync(filename, "utf8");
  const compiled = typescript.transpileModule(source, {
    compilerOptions: { module: typescript.ModuleKind.CommonJS, target: typescript.ScriptTarget.ES2022, esModuleInterop: true },
    fileName: filename,
  }).outputText;
  module._compile(compiled, filename);
};

const outputDir = path.resolve(process.argv[2] || await fs.mkdtemp(path.join(os.tmpdir(), "ningyi-template-preview-")));
await fs.mkdir(outputDir, { recursive: true });
process.env.PRODUCT_DB_PATH = path.join(outputDir, "preview-only.db");
process.env.PRODUCT_PRIVATE_STORAGE_PATH = path.join(outputDir, "private-preview-only");

const { buildFormalSolutionDocx, buildOutcomeWorkbook, buildSolutionPresentation } = require("../lib/product/deliverables.ts");
const title = "销售运营管理系统建设方案";
const structuredItems = [
  { kind: "feature", code: "FUN-001", title: "客户与商机管理", description: "统一记录客户信息、商机阶段和跟进过程。", sourceBlockIds: ["source-001"], attributes: [] },
  { kind: "estimation_item", code: "EST-001", title: "客户与商机模块", description: "实现客户档案、商机阶段维护和跟进记录。", sourceBlockIds: ["source-001"], attributes: [{ key: "base_days", value: "12" }, { key: "complexity_factor", value: "1" }, { key: "reuse_factor", value: "1" }, { key: "integration_factor", value: "1" }, { key: "security_factor", value: "1" }, { key: "uncertainty_factor", value: "1" }, { key: "daily_rate", value: "1600" }, { key: "tax_rate", value: "0.06" }, { key: "role", value: "开发" }] },
  { kind: "phase", code: "PHASE-001", title: "需求确认与原型", description: "完成流程确认、字段清单和主要页面原型。", sourceBlockIds: ["source-001"], attributes: [] },
  { kind: "risk", code: "RISK-001", title: "历史客户数据质量", description: "重复记录或字段缺失可能影响首次导入，需要提前抽样核对。", sourceBlockIds: ["source-001"], attributes: [] },
  { kind: "quote_assumption", code: "QUOTE-001", title: "报价计算参数", description: "税率、折扣和报价有效期需在商务确认后锁定。", sourceBlockIds: [], attributes: [{ key: "currency", value: "CNY" }, { key: "tax_rate", value: "0.06" }, { key: "discount_rate", value: "0" }, { key: "valid_days", value: "30" }] },
];
const paragraphs = [
  "销售人员分别使用多个表格记录客户、商机和跟进情况。管理人员需要定期汇总数据，无法及时查看销售进展。",
  "一期建设范围包括客户档案、联系人、商机阶段、跟进记录和基础统计。财务核算继续使用现有系统，不纳入本项目。",
  "系统采用浏览器访问，按销售人员、销售主管和系统管理员划分权限。客户数据按组织范围控制查看和导出。",
  "项目报价以已确认的功能范围和估算人天为依据。税率、折扣及第三方费用需要在签约前确认。",
];
const sectionSpecs = [
  ["项目背景与目标", "统一客户和商机记录，减少重复汇总工作。", "背景：\n" + paragraphs[0] + "\n目标：\n形成统一的客户视图，并让管理人员能够按阶段查看商机进度。"],
  ["范围、用户与关键约束", "明确一期范围和角色权限。", "范围：\n" + paragraphs[1] + "\n用户：\n" + paragraphs[2]],
  ["业务需求与功能规划", "围绕客户维护、商机跟进和阶段统计组织功能。", "功能：\n销售人员可以新增客户和联系人，记录每次商机沟通，并更新预计金额和阶段。\n系统按权限展示客户和商机记录。\n" + paragraphs[0]],
  ["整体解决方案", "采用分阶段交付方式，先完成核心业务模块。", "方案：\n系统提供客户、联系人、商机和跟进记录等模块。\n管理人员可以查看团队商机分布和阶段变化。\n数据：\n首批导入前需确认客户字段和去重规则。"],
  ["工作量与成本依据", "估算依据为一个客户与商机模块。", "估算：\n初步估算 12 人天，按每日 1600 元作为演示参数。最终人天和单价需双方确认。\n" + paragraphs[3]],
  ["实施计划与交付安排", "先确认需求，再开发、验证并上线。", "实施：\n需求确认与原型阶段完成流程梳理和字段确认。\n开发阶段完成客户与商机模块。\n验收：\n业务人员按客户创建、跟进记录和阶段变更流程完成验收。"],
  ["风险、假设与待确认事项", "数据质量和报价参数需要在实施前核实。", "风险：\n历史客户数据可能存在重复和缺失字段。\n假设：\n客户数据由项目方提供，并允许按约定字段进行导入。\n待确认：\n需要确认税率、折扣、第三方费用及报价有效期。"],
];
const sections = sectionSpecs.map(([sectionTitle, summary, content], index) => ({
  title: sectionTitle,
  summary,
  content,
  structuredItemsJson: JSON.stringify(index === 4 ? [structuredItems[1], structuredItems[4]] : index === 5 ? [structuredItems[2], structuredItems[3]] : index === 2 ? [structuredItems[0]] : []),
}));

const outputs = [
  ["preview.docx", await buildFormalSolutionDocx(title, sections, null)],
  ["preview.xlsx", await buildOutcomeWorkbook(title, "项目报价", sections, null)],
  ["preview.pptx", await buildSolutionPresentation(title, sections, null)],
];
for (const [filename, bytes] of outputs) await fs.writeFile(path.join(outputDir, filename), bytes);
process.stdout.write(`${JSON.stringify({ outputDir, outputs: outputs.map(([filename, bytes]) => ({ filename, bytes: bytes.length })) })}\n`);
