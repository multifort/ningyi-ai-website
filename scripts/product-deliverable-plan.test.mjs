import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const source = fs.readFileSync(path.join(process.cwd(), "lib", "product", "deliverables.ts"), "utf8");

test("渐进成果与最终渲染复用同一成果定义和生成入口", () => {
  const definitionBlock = source.split("const progressiveDeliverableDefinitions", 2)[1]?.split("export async function ensurePrimaryDeliverables", 1)[0] || "";
  const primaryBlock = source.split("export async function ensurePrimaryDeliverables", 2)[1]?.split("export async function ensureProgressiveDeliverables", 1)[0] || "";
  const progressiveBlock = source.split("export async function ensureProgressiveDeliverables", 2)[1]?.split("export function listDeliverables", 1)[0] || "";

  for (const artifactType of ["requirement_analysis_docx", "function_catalog_xlsx", "workload_estimate_xlsx", "implementation_plan_xlsx", "project_quote_xlsx"]) {
    assert.match(definitionBlock, new RegExp(`artifactType: \\"${artifactType}\\"`));
  }
  assert.match(primaryBlock, /ensureDeclaredProgressiveDeliverables/u);
  assert.match(progressiveBlock, /ensureDeclaredProgressiveDeliverables/u);
  assert.doesNotMatch(primaryBlock, /const workbookDefinitions/u);
  assert.doesNotMatch(progressiveBlock, /const definitions\s*=\s*\[/u);

  const dependencyBlock = source.split("const dependencies: Record<string, string[]>", 2)[1]?.split("return dependencies", 1)[0] || "";
  for (const artifactType of ["requirement_analysis_pdf", "function_catalog_docx", "workload_estimate_pdf", "implementation_plan_pdf", "solution_briefing_pdf"]) {
    assert.match(dependencyBlock, new RegExp(`${artifactType}:`), `${artifactType} must not fall back to all-section invalidation`);
  }
});
