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

const { runAcceptanceFaultProbes } = require("../lib/product/acceptance-fault-probes.ts");

test("五类隔离故障探针都保留失败证据并完成自动恢复", async () => {
  const results = await runAcceptanceFaultProbes();
  assert.deepEqual(results.map((result) => result.faultCode), [
    "MODEL_PROVIDER_FAILURE",
    "WORKER_INTERRUPTION",
    "ARTIFACT_CORRUPTION",
    "DELETION_RACE",
    "CONCURRENT_MATERIAL_CHANGE",
  ]);
  for (const result of results) {
    assert.equal(result.passed, true, `${result.faultCode} should pass`);
    assert.equal(result.evidence.mode, "isolated_runtime");
    assert.ok(result.observedErrorCode);
    assert.ok(result.recoveryAction);
    assert.equal(Object.values(result.evidence.assertions).every(Boolean), true);
  }
});
