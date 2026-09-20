import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const typescript = require("typescript");
const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ningyi-render-takeover-test-"));
process.env.PRODUCT_DB_PATH = path.join(tempDir, "product.db");
process.env.PRODUCT_PRIVATE_STORAGE_PATH = path.join(tempDir, "private");
require.extensions[".ts"] = (module, filename) => {
  const source = require("node:fs").readFileSync(filename, "utf8");
  module._compile(typescript.transpileModule(source, { compilerOptions: { module: typescript.ModuleKind.CommonJS, target: typescript.ScriptTarget.ES2022, esModuleInterop: true }, fileName: filename }).outputText, filename);
};

const { productSqlite } = require("../lib/product/db.ts");
const privateStorage = require("../lib/product/private-storage.ts");
const originalWritePrivateFile = privateStorage.writePrivateFile;
const userId = "90000000-0000-4000-8000-000000000032";
const solutionId = "10000000-0000-4000-8000-000000000032";
let takeoverTriggered = false;
privateStorage.writePrivateFile = async (...args) => {
  const stored = await originalWritePrivateFile(...args);
  if (!takeoverTriggered) {
    takeoverTriggered = true;
    productSqlite.prepare("UPDATE product_solutions SET render_lease_owner = 'render-worker-new', render_lease_until = datetime('now', '+10 minutes') WHERE id = ?").run(solutionId);
  }
  return stored;
};
const { ensurePrimaryDeliverables } = require("../lib/product/deliverables.ts");

test.after(async () => {
  productSqlite.close();
  await fs.rm(tempDir, { recursive: true, force: true });
});

test("旧渲染 Worker 写出的晚到文件不能发布为交付成果", async () => {
  productSqlite.prepare("INSERT INTO product_users (id, username, username_normalized, password_hash) VALUES (?, 'render-takeover', 'render-takeover', 'test')").run(userId);
  productSqlite.prepare(`INSERT INTO product_solutions
    (id, owner_user_id, title, status, stage, render_lease_owner, render_lease_until)
    VALUES (?, ?, '渲染接管方案', 'rendering', 'rendering', 'render-worker-old', datetime('now', '+10 minutes'))`).run(solutionId, userId);
  productSqlite.prepare("INSERT INTO formal_documents (solution_id, status, provider, model) VALUES (?, 'completed', 'openai', 'test-model')").run(solutionId);
  const outline = [
    ["project_overview", "项目背景与目标"],
    ["scope_users", "范围、用户与关键约束"],
    ["requirements", "业务需求与功能规划"],
    ["solution", "整体解决方案"],
    ["workload", "工作量与成本依据"],
    ["implementation", "实施计划与交付安排"],
    ["risks", "风险、假设与待确认事项"],
  ];
  const insertSection = productSqlite.prepare(`INSERT INTO formal_sections
    (id, solution_id, section_index, section_key, title, status, content, summary, claims_json, structured_items_json)
    VALUES (?, ?, ?, ?, ?, 'validated', ?, ?, '[]', '[]')`);
  outline.forEach(([key, title], index) => insertSection.run(
    `73000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    solutionId,
    index,
    key,
    title,
    `${title}的已校验正文。系统依据正式章节生成交付物，并在发布前再次确认渲染租约仍归当前 Worker 所有。`,
    `${title}的已校验摘要。`,
  ));

  await assert.rejects(
    ensurePrimaryDeliverables(solutionId, userId, { workerId: "render-worker-old" }),
    /RENDER_LEASE_LOST/,
  );
  assert.equal(takeoverTriggered, true);
  assert.equal(productSqlite.prepare("SELECT COUNT(*) AS count FROM deliverable_artifacts WHERE solution_id = ?").get(solutionId).count, 0);
  assert.deepEqual(productSqlite.prepare("SELECT status, stage, render_lease_owner AS leaseOwner FROM product_solutions WHERE id = ?").get(solutionId), {
    status: "rendering", stage: "rendering", leaseOwner: "render-worker-new",
  });
});
