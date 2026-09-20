import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const typescript = require("typescript");
const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ningyi-operations-health-test-"));
process.env.PRODUCT_DB_PATH = path.join(tempDir, "product.db");
process.env.PRODUCT_PRIVATE_STORAGE_PATH = path.join(tempDir, "private");
process.env.PRODUCT_OPERATIONS_HEALTH_STALE_SECONDS = "120";
process.env.PRODUCT_STORAGE_HEALTH_STALE_SECONDS = "3600";
require.extensions[".ts"] = (module, filename) => {
  const source = require("node:fs").readFileSync(filename, "utf8");
  module._compile(typescript.transpileModule(source, { compilerOptions: { module: typescript.ModuleKind.CommonJS, target: typescript.ScriptTarget.ES2022, esModuleInterop: true }, fileName: filename }).outputText, filename);
};

const { productSqlite } = require("../lib/product/db.ts");
const { createOperationsSnapshot } = require("../lib/product/operations.ts");
const workerId = "50000000-0000-4000-8000-000000000001";
const capabilities = JSON.stringify(["pipeline", "deletion", "operations", "storage_maintenance"]);

test.after(async () => {
  productSqlite.close();
  await fs.rm(tempDir, { recursive: true, force: true });
});

test("运行快照识别 operations 循环停滞并请求重启 Worker", () => {
  const recent = new Date().toISOString();
  const stale = new Date(Date.now() - 10 * 60_000).toISOString();
  const health = JSON.stringify({
    pipeline: { lastSuccessAt: recent },
    deletion: { lastSuccessAt: recent },
    operations: { lastSuccessAt: stale },
    storage_maintenance: { lastSuccessAt: recent },
  });
  productSqlite.prepare(`INSERT INTO worker_heartbeats
    (worker_id, status, capabilities_json, health_json, started_at, last_seen_at)
    VALUES (?, 'running', ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`).run(workerId, capabilities, health);

  const snapshot = createOperationsSnapshot();
  assert.equal(snapshot.workerHealth.operationsLoopHealthy, false);
  assert.ok(snapshot.alerts.some((alert) => alert.code === "OPERATIONS_LOOP_STALLED" && alert.automaticAction === "restart_worker_pool"));
});

test("operations 恢复后运行快照继续识别 storage 循环停滞", () => {
  const recent = new Date().toISOString();
  const stale = new Date(Date.now() - 2 * 60 * 60_000).toISOString();
  const health = JSON.stringify({
    pipeline: { lastSuccessAt: recent },
    deletion: { lastSuccessAt: recent },
    operations: { lastSuccessAt: recent },
    storage_maintenance: { lastSuccessAt: stale },
  });
  productSqlite.prepare("UPDATE worker_heartbeats SET health_json = ?, last_seen_at = CURRENT_TIMESTAMP WHERE worker_id = ?").run(health, workerId);

  const snapshot = createOperationsSnapshot();
  assert.equal(snapshot.workerHealth.operationsLoopHealthy, true);
  assert.equal(snapshot.workerHealth.storageLoopHealthy, false);
  assert.ok(snapshot.alerts.some((alert) => alert.code === "STORAGE_LOOP_STALLED" && alert.automaticAction === "restart_worker_pool"));
});
