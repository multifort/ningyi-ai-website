import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const productRoot = path.join(process.cwd(), "lib", "product");
const generationModules = ["formal-analysis.ts", "formal-worker.ts", "deliverables.ts"];
const forbiddenGenerationMarkers = [
  "benchmark-content-evaluation",
  "key-facts.json",
  "automatic-content-checks.json",
  "benchmarkGuidance",
  "benchmarkCompletenessRepair",
  "ensureTraceableBenchmarkFacts",
  "BENCHMARK_COMPLETENESS_REPAIR",
];

test("正式生成、修复和渲染链路不读取基准 expected 答案", () => {
  for (const filename of generationModules) {
    const source = fs.readFileSync(path.join(productRoot, filename), "utf8");
    for (const marker of forbiddenGenerationMarkers) {
      assert.equal(source.includes(marker), false, `${filename} must not contain ${marker}`);
    }
  }
});

test("基准 expected 内容规则只允许由独立验收模块读取", () => {
  const readers = fs.readdirSync(productRoot)
    .filter((filename) => filename.endsWith(".ts"))
    .filter((filename) => {
      const source = fs.readFileSync(path.join(productRoot, filename), "utf8");
      return source.includes("key-facts.json") || source.includes("automatic-content-checks.json");
    })
    .sort();

  assert.deepEqual(readers, ["benchmark-content-evaluation.ts"]);
});
