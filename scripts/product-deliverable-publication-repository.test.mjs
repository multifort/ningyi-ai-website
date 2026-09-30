import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const typescript = require("typescript");
const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ningyi-publication-repository-"));
process.env.PRODUCT_DB_PATH = path.join(tempDir, "product.db");
require.extensions[".ts"] = (module, filename) => {
  const source = require("node:fs").readFileSync(filename, "utf8");
  module._compile(typescript.transpileModule(source, { compilerOptions: { module: typescript.ModuleKind.CommonJS, target: typescript.ScriptTarget.ES2022, esModuleInterop: true }, fileName: filename }).outputText, filename);
};

const { productSqlite } = require("../lib/product/db.ts");
const { SqliteDeliverablePublicationRepository } = require("../lib/product/sqlite-deliverable-publication-repository.ts");
const repository = new SqliteDeliverablePublicationRepository();
const userId = "90000000-0000-4000-8000-000000000071";
const solutionId = "10000000-0000-4000-8000-000000000071";
const oldArtifactId = "70000000-0000-4000-8000-000000000071";
const newArtifactId = "70000000-0000-4000-8000-000000000072";
const templateFileId = "60000000-0000-4000-8000-000000000071";

test.before(() => {
  productSqlite.prepare("INSERT INTO product_users (id, username, username_normalized, password_hash) VALUES (?, 'publication-owner', 'publication-owner', 'test')").run(userId);
  productSqlite.prepare("INSERT INTO product_solutions (id, owner_user_id, title, status, stage, render_lease_owner, render_lease_until) VALUES (?, ?, '发布仓储测试', 'rendering', 'rendering', 'render-worker', datetime('now', '+10 minutes'))").run(solutionId, userId);
  productSqlite.prepare("INSERT INTO source_files (id, solution_id, user_id, client_key, category, original_name, detected_format, size_bytes, storage_key, status) VALUES (?, ?, ?, 'template-docx', 'template', 'template.docx', 'docx', 100, ?, 'uploaded')").run(templateFileId, solutionId, userId, `private/${userId}/${solutionId}/${templateFileId}`);
  productSqlite.prepare("INSERT INTO deliverable_artifacts (id, solution_id, user_id, artifact_type, display_name, mime_type, storage_key, size_bytes, sha256, quality_json, content_fingerprint, render_fingerprint, content_version, render_version, status) VALUES (?, ?, ?, 'formal_solution_docx', '旧版.docx', 'application/docx', ?, 100, 'old-sha', '{}', 'content-v1', 'render-v1', 1, 1, 'available')").run(oldArtifactId, solutionId, userId, `private/${userId}/${solutionId}/${oldArtifactId}`);
});

test.after(async () => {
  productSqlite.close();
  await fs.rm(tempDir, { recursive: true, force: true });
});

test("成果发布在同一事务中归档旧版本并替换当前版本", async () => {
  const existing = await repository.findExisting(solutionId, "formal_solution_docx");
  await repository.publish({
    artifactId: newArtifactId,
    solutionId,
    userId,
    artifactType: "formal_solution_docx",
    displayName: "新版.docx",
    mimeType: "application/docx",
    storageKey: `private/${userId}/${solutionId}/${newArtifactId}`,
    sizeBytes: 120,
    sha256: "new-sha",
    qualityJson: '{"status":"pass"}',
    contentFingerprint: "content-v2",
    renderFingerprint: "render-v2",
    contentVersion: 2,
    renderVersion: 1,
    existing,
  }, "render-worker");
  assert.deepEqual(productSqlite.prepare("SELECT id, content_version AS contentVersion, render_version AS renderVersion FROM deliverable_artifacts WHERE solution_id = ?").get(solutionId), { id: newArtifactId, contentVersion: 2, renderVersion: 1 });
  assert.deepEqual(productSqlite.prepare("SELECT artifact_id AS artifactId, content_version AS contentVersion, render_version AS renderVersion FROM deliverable_artifact_versions WHERE solution_id = ?").get(solutionId), { artifactId: oldArtifactId, contentVersion: 1, renderVersion: 1 });
});

test("失去渲染租约后不能重新发布成果", async () => {
  await assert.rejects(repository.restoreAvailable(newArtifactId, userId, solutionId, "stale-worker"), /RENDER_LEASE_LOST/);
});

test("移除模板时原子更新源文件、成果状态、渲染队列和项目事件", async () => {
  assert.equal(await repository.removePresentationSource({
    sourceFileId: templateFileId,
    solutionId,
    userId,
    artifactTypes: ["formal_solution_docx"],
    eventType: "template_removed",
    eventSummary: "移除了一份企业模板",
  }), true);
  assert.deepEqual(productSqlite.prepare("SELECT status, storage_key AS storageKey FROM source_files WHERE id = ?").get(templateFileId), { status: "removed", storageKey: null });
  assert.deepEqual(productSqlite.prepare("SELECT status FROM deliverable_artifacts WHERE id = ?").get(newArtifactId), { status: "superseded" });
  assert.deepEqual(productSqlite.prepare("SELECT status, stage FROM product_solutions WHERE id = ?").get(solutionId), { status: "processing", stage: "rendering" });
  assert.deepEqual(productSqlite.prepare("SELECT event_type AS eventType, summary FROM product_project_events WHERE solution_id = ?").get(solutionId), { eventType: "template_removed", summary: "移除了一份企业模板" });
  assert.equal(await repository.removePresentationSource({
    sourceFileId: templateFileId,
    solutionId,
    userId,
    artifactTypes: ["formal_solution_docx"],
    eventType: "template_removed",
    eventSummary: "移除了一份企业模板",
  }), false);
  assert.deepEqual(productSqlite.prepare("SELECT COUNT(*) AS eventCount FROM product_project_events WHERE solution_id = ?").get(solutionId), { eventCount: 1 });
});
