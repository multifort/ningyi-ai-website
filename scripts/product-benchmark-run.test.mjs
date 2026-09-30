import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const script = path.join(repositoryRoot, "scripts", "product-benchmark-run.mjs");
const missingEnvFile = path.join(repositoryRoot, ".env.benchmark-run-test-missing");

test("基准运行器可在不调用服务的情况下校验 BM-01 清单", () => {
  const result = run(["--benchmark", "BM-01"]);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), {
    status: "validated",
    benchmarkId: "BM-01",
    manifestFiles: 22,
    uploadFiles: 5,
    next: "PRODUCT_BENCHMARK_USERNAME=... PRODUCT_BENCHMARK_PASSWORD=... PRODUCT_WORKER_SECRET=... node scripts/product-benchmark-run.mjs --benchmark BM-01 --execute",
  });
});

test("基准运行器在无效模型时区时失败关闭，且不会进入 HTTP 链路", () => {
  const result = run(["--benchmark", "BM-01", "--execute"], {
    PRODUCT_BENCHMARK_EXECUTE: "1",
    PRODUCT_BENCHMARK_USERNAME: "benchmark-window-test",
    PRODUCT_BENCHMARK_PASSWORD: "benchmark-window-password",
    PRODUCT_WORKER_SECRET: "benchmark-window-worker-secret",
    PRODUCT_MODEL_EXECUTION_WINDOW_ENABLED: "true",
    PRODUCT_MODEL_EXECUTION_TIMEZONE: "Invalid/Timezone",
  });
  assert.equal(result.status, 1, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), {
    status: "failed",
    code: "MODEL_EXECUTION_WINDOW_CLOSED",
    allowed: false,
    timezone: "Invalid/Timezone",
    localHour: null,
    startHour: 0,
    endHour: 6,
    reason: "invalid_timezone",
  });
});

function run(args, overrides = {}) {
  return spawnSync(process.execPath, [script, ...args], {
    cwd: repositoryRoot,
    env: { ...process.env, PRODUCT_ENV_FILE: missingEnvFile, ...overrides },
    encoding: "utf8",
  });
}
