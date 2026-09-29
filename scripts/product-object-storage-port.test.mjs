import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const typescript = require("typescript");
require.extensions[".ts"] = (module, filename) => {
  const source = require("node:fs").readFileSync(filename, "utf8");
  module._compile(typescript.transpileModule(source, { compilerOptions: { module: typescript.ModuleKind.CommonJS, target: typescript.ScriptTarget.ES2022, esModuleInterop: true }, fileName: filename }).outputText, filename);
};

const { LocalObjectStorage } = require("../lib/product/local-object-storage.ts");
const { privateObjectKey, privateSolutionPrefix } = require("../lib/product/object-storage-port.ts");
const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ningyi-object-storage-port-"));
const storage = new LocalObjectStorage(() => tempDir);
const userId = "90000000-0000-4000-8000-000000000041";
const solutionId = "10000000-0000-4000-8000-000000000041";
const fileId = "70000000-0000-4000-8000-000000000041";
const key = privateObjectKey(userId, solutionId, fileId);

test.after(async () => fs.rm(tempDir, { recursive: true, force: true }));

test("本地对象存储适配器遵守写入、读取、列举、删除行为合同", async () => {
  const bytes = Buffer.from("private-object-contract");
  await storage.put(key, bytes);
  assert.deepEqual(await storage.read(key), bytes);
  assert.equal((await storage.list(privateSolutionPrefix(userId, solutionId))).map((item) => item.key).join(), key);
  assert.equal((await storage.list("private")).map((item) => item.key).join(), key);
  assert.equal(await storage.readiness(), true);
  await storage.delete(key);
  await assert.rejects(storage.read(key), { code: "ENOENT" });
});

test("对象键阻止跨租户路径逃逸且前缀删除限制在方案范围", async () => {
  assert.throws(() => privateObjectKey(userId, solutionId, "../../outside"), /INVALID_PRIVATE_PATH_ID/);
  assert.throws(() => storage.read(`private/${userId}/${solutionId}/../../outside`), /INVALID_STORAGE_KEY/);
  const first = privateObjectKey(userId, solutionId, fileId);
  const otherSolution = "10000000-0000-4000-8000-000000000042";
  const second = privateObjectKey(userId, otherSolution, fileId);
  await storage.put(first, Buffer.from("first"));
  await storage.put(second, Buffer.from("second"));
  await storage.deletePrefix(privateSolutionPrefix(userId, solutionId));
  await assert.rejects(storage.read(first), { code: "ENOENT" });
  assert.equal((await storage.read(second)).toString(), "second");
});

test("写入以临时文件原子替换，不遗留 uploading 对象", async () => {
  await storage.put(key, Buffer.from("v1"));
  await storage.put(key, Buffer.from("v2"));
  assert.equal((await storage.read(key)).toString(), "v2");
  const directory = path.dirname(storage.pathForKey(key));
  assert.deepEqual((await fs.readdir(directory)).filter((name) => name.endsWith(".uploading")), []);
});
