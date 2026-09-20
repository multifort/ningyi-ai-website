import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const typescript = require("typescript");
const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ningyi-storage-maintenance-test-"));
process.env.PRODUCT_DB_PATH = path.join(tempDir, "product.db");
process.env.PRODUCT_PRIVATE_STORAGE_PATH = path.join(tempDir, "private");
process.env.PRODUCT_ORPHAN_GRACE_SECONDS = "60";
require.extensions[".ts"] = (module, filename) => {
  const source = require("node:fs").readFileSync(filename, "utf8");
  module._compile(typescript.transpileModule(source, { compilerOptions: { module: typescript.ModuleKind.CommonJS, target: typescript.ScriptTarget.ES2022, esModuleInterop: true }, fileName: filename }).outputText, filename);
};
const { productSqlite } = require("../lib/product/db.ts");
const { maintainPrivateStorage } = require("../lib/product/storage-maintenance.ts");

const userId = "90000000-0000-4000-8000-000000000001";
const solutionId = "10000000-0000-4000-8000-000000000001";
const referencedFileId = "70000000-0000-4000-8000-000000000001";

test.after(async () => {
  productSqlite.close();
  await fs.rm(tempDir, { recursive: true, force: true });
});

test("存储维护只清理超过宽限期且没有数据库引用的私有文件", async () => {
  productSqlite.prepare("INSERT INTO product_users (id, username, username_normalized, password_hash) VALUES (?, ?, ?, ?)").run(userId, "storage-owner", "storage-owner", "test");
  productSqlite.prepare("INSERT INTO product_solutions (id, owner_user_id, title) VALUES (?, ?, ?)").run(solutionId, userId, "存储维护测试");
  productSqlite.prepare("INSERT INTO source_files (id, solution_id, user_id, client_key, category, original_name, size_bytes, storage_key, status) VALUES (?, ?, ?, ?, 'content', 'referenced.txt', 4, ?, 'uploaded')").run(referencedFileId, solutionId, userId, "client-key", `private/${userId}/${solutionId}/${referencedFileId}`);

  const root = path.join(tempDir, "private");
  const referencedPath = path.join(root, userId, solutionId, referencedFileId);
  const orphanPath = path.join(root, userId, solutionId, "80000000-0000-4000-8000-000000000001");
  const freshPath = path.join(root, userId, solutionId, "80000000-0000-4000-8000-000000000002");
  await fs.mkdir(path.dirname(referencedPath), { recursive: true });
  await fs.writeFile(referencedPath, "keep");
  await fs.writeFile(orphanPath, "remove");
  await fs.writeFile(freshPath, "wait");
  const old = new Date(Date.now() - 120_000);
  await fs.utimes(orphanPath, old, old);

  const audit = await maintainPrivateStorage("audit");
  assert.equal(audit.referencedFiles, 1);
  assert.equal(audit.orphanFiles, 1);
  assert.equal(audit.removedFiles, 0);
  assert.equal(await fs.readFile(orphanPath, "utf8"), "remove");

  const cleanup = await maintainPrivateStorage("cleanup");
  assert.equal(cleanup.removedFiles, 1);
  await assert.rejects(fs.access(orphanPath));
  assert.equal(await fs.readFile(referencedPath, "utf8"), "keep");
  assert.equal(await fs.readFile(freshPath, "utf8"), "wait");
});
