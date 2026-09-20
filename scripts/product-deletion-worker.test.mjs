import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const typescript = require("typescript");
const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ningyi-deletion-worker-test-"));
process.env.PRODUCT_DB_PATH = path.join(tempDir, "product.db");
process.env.PRODUCT_PRIVATE_STORAGE_PATH = path.join(tempDir, "private");
require.extensions[".ts"] = (module, filename) => {
  const source = require("node:fs").readFileSync(filename, "utf8");
  module._compile(typescript.transpileModule(source, { compilerOptions: { module: typescript.ModuleKind.CommonJS, target: typescript.ScriptTarget.ES2022, esModuleInterop: true }, fileName: filename }).outputText, filename);
};
const { productSqlite } = require("../lib/product/db.ts");
const { processDeletionBatch } = require("../lib/product/deletion-worker.ts");

const userId = "90000000-0000-4000-8000-000000000001";
const solutionId = "10000000-0000-4000-8000-000000000001";
const sourceFileId = "70000000-0000-4000-8000-000000000001";
const artifactId = "70000000-0000-4000-8000-000000000002";

test.after(async () => {
  productSqlite.close();
  await fs.rm(tempDir, { recursive: true, force: true });
});

test("删除 Worker 清理私有文件和派生数据，并最终保留删除墓碑", async () => {
  productSqlite.prepare("INSERT INTO product_users (id, username, username_normalized, password_hash, status) VALUES (?, ?, ?, ?, 'deletion_pending')").run(userId, "deletion-owner", "deletion-owner", "test");
  productSqlite.prepare("INSERT INTO product_solutions (id, owner_user_id, title, status, stage) VALUES (?, ?, ?, 'deletion_pending', 'deletion_pending')").run(solutionId, userId, "待删除方案");
  const sourceKey = `private/${userId}/${solutionId}/${sourceFileId}`;
  const artifactKey = `private/${userId}/${solutionId}/${artifactId}`;
  productSqlite.prepare("INSERT INTO source_files (id, solution_id, user_id, client_key, category, original_name, size_bytes, storage_key, status) VALUES (?, ?, ?, ?, 'content', 'source.txt', 6, ?, 'deletion_pending')").run(sourceFileId, solutionId, userId, "delete-client-key", sourceKey);
  productSqlite.prepare("INSERT INTO deliverable_artifacts (id, solution_id, user_id, artifact_type, display_name, mime_type, storage_key, size_bytes, sha256, quality_json, status) VALUES (?, ?, ?, 'formal_solution_docx', 'solution.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', ?, 7, 'sha', '{}', 'deletion_pending')").run(artifactId, solutionId, userId, artifactKey);
  productSqlite.prepare("INSERT INTO solution_deletion_runs (id, solution_id, owner_user_id, status, manifest_json) VALUES (?, ?, ?, 'pending', '{}')").run("60000000-0000-4000-8000-000000000001", solutionId, userId);
  productSqlite.prepare("INSERT INTO account_deletion_runs (id, owner_user_id, status) VALUES (?, ?, 'pending')").run("60000000-0000-4000-8000-000000000002", userId);

  const solutionDirectory = path.join(tempDir, "private", userId, solutionId);
  await fs.mkdir(solutionDirectory, { recursive: true });
  await fs.writeFile(path.join(solutionDirectory, sourceFileId), "source");
  await fs.writeFile(path.join(solutionDirectory, artifactId), "artifact");

  const result = await processDeletionBatch();
  assert.equal(result.completed, 1);
  assert.equal(productSqlite.prepare("SELECT status, stage FROM product_solutions WHERE id = ?").get(solutionId).status, "deleted");
  assert.equal(productSqlite.prepare("SELECT COUNT(*) AS count FROM source_files WHERE solution_id = ?").get(solutionId).count, 0);
  assert.equal(productSqlite.prepare("SELECT COUNT(*) AS count FROM deliverable_artifacts WHERE solution_id = ?").get(solutionId).count, 0);
  assert.equal(productSqlite.prepare("SELECT status FROM solution_deletion_runs WHERE solution_id = ?").get(solutionId).status, "completed");
  assert.equal(productSqlite.prepare("SELECT status FROM account_deletion_runs WHERE owner_user_id = ?").get(userId).status, "completed");
  assert.equal(productSqlite.prepare("SELECT status FROM product_users WHERE id = ?").get(userId).status, "deleted");
  await assert.rejects(fs.access(solutionDirectory));
});
