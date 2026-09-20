import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import http from "node:http";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("流水线连续失败达到阈值后 Worker 记录证据、停止心跳并以失败码退出", async (context) => {
  const requests = [];
  const server = http.createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const body = Buffer.concat(chunks).toString("utf8");
    requests.push({ method: request.method, url: request.url, body });
    response.setHeader("content-type", "application/json");
    if (request.method === "GET" && request.url === "/api/product/internal/health?scope=dependencies") {
      response.end(JSON.stringify({ success: true, data: { dependencies: { ready: true } } }));
      return;
    }
    if (request.method === "POST" && request.url?.startsWith("/api/product/internal/pipeline/tick")) {
      response.statusCode = 503;
      response.end(JSON.stringify({ success: false, error: { code: "FORCED_PIPELINE_FAILURE" } }));
      return;
    }
    response.end(JSON.stringify({ success: true, data: { processed: 0, removedFiles: 0 } }));
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  context.after(() => new Promise((resolve) => server.close(resolve)));

  const address = server.address();
  assert.ok(address && typeof address === "object");
  const child = spawn(process.execPath, [path.join(repositoryRoot, "scripts/product-worker.mjs")], {
    cwd: repositoryRoot,
    env: {
      ...process.env,
      PRODUCT_ENV_FILE: path.join(repositoryRoot, ".env.worker-runtime-test"),
      PRODUCT_APP_ORIGIN: `http://127.0.0.1:${address.port}`,
      PRODUCT_WORKER_SECRET: "worker-runtime-test-secret",
      PRODUCT_PIPELINE_POLL_MS: "250",
      PRODUCT_DELETION_POLL_MS: "60000",
      PRODUCT_OPERATIONS_POLL_MS: "3600000",
      PRODUCT_STORAGE_MAINTENANCE_POLL_MS: "86400000",
      PRODUCT_WORKER_HEARTBEAT_MS: "60000",
      PRODUCT_WORKER_FATAL_FAILURE_THRESHOLD: "2",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  context.after(() => { if (child.exitCode === null) child.kill("SIGKILL"); });
  let stdout = "", stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => { stdout += chunk; });
  child.stderr.on("data", (chunk) => { stderr += chunk; });

  const exit = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`WORKER_EXIT_TIMEOUT\nstdout=${stdout}\nstderr=${stderr}\nrequests=${JSON.stringify(requests)}`)), 8000);
    child.once("close", (code, signal) => {
      clearTimeout(timeout);
      resolve({ code, signal });
    });
  });
  assert.deepEqual(exit, { code: 1, signal: null });

  const logs = `${stdout}\n${stderr}`.split("\n").filter(Boolean).map((line) => JSON.parse(line));
  const restart = logs.find((entry) => entry.event === "worker_restart_requested");
  assert.deepEqual({ loop: restart?.loop, errorCode: restart?.errorCode, failures: restart?.consecutiveFailures, threshold: restart?.threshold }, {
    loop: "pipeline", errorCode: "FORCED_PIPELINE_FAILURE", failures: 2, threshold: 2,
  });

  const heartbeats = requests
    .filter((request) => request.method === "POST" && request.url === "/api/product/internal/health")
    .map((request) => JSON.parse(request.body));
  assert.ok(heartbeats.some((heartbeat) => heartbeat.status === "running"));
  const stopped = heartbeats.find((heartbeat) => heartbeat.status === "stopped");
  assert.ok(stopped);
  assert.equal(stopped.loopHealth.pipeline.consecutiveFailures, 2);
});
