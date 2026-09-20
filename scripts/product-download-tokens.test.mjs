import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const typescript = require("typescript");
require.extensions[".ts"] = (module, filename) => {
  const source = fs.readFileSync(filename, "utf8");
  module._compile(typescript.transpileModule(source, { compilerOptions: { module: typescript.ModuleKind.CommonJS, target: typescript.ScriptTarget.ES2022, esModuleInterop: true }, fileName: filename }).outputText, filename);
};
const { issueDownloadToken, verifyDownloadToken } = require("../lib/product/download-tokens.ts");

const scope = {
  userId: "90000000-0000-4000-8000-000000000001",
  solutionId: "10000000-0000-4000-8000-000000000001",
  artifactId: "70000000-0000-4000-8000-000000000001",
};

test("下载令牌绑定用户、方案和成果", () => {
  process.env.PRODUCT_DOWNLOAD_SECRET = "test-download-secret";
  process.env.PRODUCT_DOWNLOAD_TTL_SECONDS = "9999";
  const issued = issueDownloadToken(scope);
  assert.equal(issued.ttlSeconds, 300);
  assert.equal(verifyDownloadToken(issued.token, scope), true);
  assert.equal(verifyDownloadToken(issued.token, { ...scope, userId: "90000000-0000-4000-8000-000000000099" }), false);
  assert.equal(verifyDownloadToken(issued.token, { ...scope, solutionId: "10000000-0000-4000-8000-000000000099" }), false);
  assert.equal(verifyDownloadToken(issued.token, { ...scope, artifactId: "70000000-0000-4000-8000-000000000099" }), false);
});

test("历史版本令牌不能复用到当前成果或其他历史版本", () => {
  const issued = issueDownloadToken({ ...scope, versionId: "80000000-0000-4000-8000-000000000001" });
  assert.equal(verifyDownloadToken(issued.token, { ...scope, versionId: "80000000-0000-4000-8000-000000000001" }), true);
  assert.equal(verifyDownloadToken(issued.token, scope), false);
  assert.equal(verifyDownloadToken(issued.token, { ...scope, versionId: "80000000-0000-4000-8000-000000000002" }), false);
});

test("签名被篡改或令牌格式异常时拒绝访问", () => {
  const issued = issueDownloadToken(scope);
  const [encoded, signature] = issued.token.split(".");
  assert.equal(verifyDownloadToken(`${encoded}.${signature.slice(0, -1)}x`, scope), false);
  assert.equal(verifyDownloadToken(`${issued.token}.extra`, scope), false);
  assert.equal(verifyDownloadToken("not-a-token", scope), false);
});
