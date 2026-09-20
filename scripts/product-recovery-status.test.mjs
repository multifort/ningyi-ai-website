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
const { solutionRecoveryStatus } = require("../lib/product/recovery-status.ts");

test("解析失败会显示自动重试而不是要求用户重新提交", () => {
  const recovery = solutionRecoveryStatus(
    { stage: "quick_understanding" },
    { status: "retry_wait", attemptCount: 1, nextAttemptAt: "2026-09-20 10:00:00", errorCode: "SOURCE_TIMEOUT" },
    null,
    null,
  );
  assert.equal(recovery.state, "retry_wait");
  assert.equal(recovery.stageLabel, "资料解析");
  assert.equal(recovery.nextRetryAt, "2026-09-20T10:00:00Z");
  assert.match(recovery.message, /自动尝试/);
});

test("能力配置等待显示环境恢复，不伪装成用户操作失败", () => {
  const recovery = solutionRecoveryStatus(
    { stage: "media_analysis" },
    null,
    { status: "awaiting_configuration", attemptCount: 0, errorCode: "OCR_NOT_CONFIGURED", nextAttemptAt: null, failedAt: null },
    null,
  );
  assert.equal(recovery.state, "environment_wait");
  assert.equal(recovery.stageLabel, "图片与扫描材料识别");
  assert.match(recovery.headline, /环境正在准备/);
});

test("没有恢复性故障时不生成恢复提示", () => {
  assert.equal(solutionRecoveryStatus({ stage: "completed" }, null, null, null), null);
  assert.equal(solutionRecoveryStatus({ stage: "formal_analysis" }, null, null, { status: "generating", sections: [] }), null);
});
