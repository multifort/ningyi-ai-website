import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const typescript = require("typescript");
require.extensions[".ts"] = (module, filename) => {
  const source = fs.readFileSync(filename, "utf8");
  module._compile(typescript.transpileModule(source, { compilerOptions: { module: typescript.ModuleKind.CommonJS, target: typescript.ScriptTarget.ES2022, esModuleInterop: true }, fileName: filename }).outputText, filename);
};

const { sanitizeWorkerLoopHealth, workerCapabilityLoopHealthy, workerLoopHealthy } = require("../lib/product/worker-health.ts");

const now = Date.parse("2026-09-20T08:00:00.000Z");
const capabilitiesJson = JSON.stringify(["pipeline", "operations"]);

test("有积压时只有具备能力且最近成功的 Worker 才算健康", () => {
  const recent = [{ capabilitiesJson, healthJson: JSON.stringify({ pipeline: { lastSuccessAt: "2026-09-20T07:59:40.000Z" } }) }];
  assert.equal(workerLoopHealthy(recent, "pipeline", "pipeline", 1, 60, now), true);
  assert.equal(workerLoopHealthy(recent, "deletion", "deletion", 1, 60, now), false);
  assert.equal(workerLoopHealthy([], "pipeline", "pipeline", 0, 60, now), true);
});

test("过期、无效和超前时间戳不能把停滞循环伪装成健康", () => {
  const stale = [{ capabilitiesJson, healthJson: JSON.stringify({ pipeline: { lastSuccessAt: "2026-09-20T07:58:00.000Z" } }) }];
  const future = [{ capabilitiesJson, healthJson: JSON.stringify({ pipeline: { lastSuccessAt: "2026-09-20T08:05:00.000Z" } }) }];
  const invalid = [{ capabilitiesJson, healthJson: "not-json" }];
  assert.equal(workerLoopHealthy(stale, "pipeline", "pipeline", 1, 60, now), false);
  assert.equal(workerLoopHealthy(future, "pipeline", "pipeline", 1, 60, now), false);
  assert.equal(workerLoopHealthy(invalid, "pipeline", "pipeline", 1, 60, now), false);
  assert.equal(workerCapabilityLoopHealthy([], "operations", "operations", 180, now), false);
});

test("心跳入库前清理超前时间、未知循环和异常失败次数", () => {
  const sanitized = sanitizeWorkerLoopHealth({
    pipeline: { lastSuccessAt: "2026-09-20T08:05:00.000Z", lastProgressAt: "2026-09-20T07:59:30.000Z", consecutiveFailures: 10000.8 },
    unknown: { lastSuccessAt: "2026-09-20T08:00:00.000Z", consecutiveFailures: 1 },
  }, now);
  assert.deepEqual(sanitized, {
    pipeline: { lastSuccessAt: null, lastProgressAt: "2026-09-20T07:59:30.000Z", consecutiveFailures: 1000 },
  });
});
