import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const typescript = require("typescript");
require.extensions[".ts"] = (module, filename) => {
  const source = fs.readFileSync(filename, "utf8");
  module._compile(typescript.transpileModule(source, { compilerOptions: { module: typescript.ModuleKind.CommonJS, target: typescript.ScriptTarget.ES2022, esModuleInterop: true }, fileName: filename }).outputText, filename);
};

const { benchmarkDefinition, benchmarkManifestHash } = require("../lib/product/benchmark-registry.ts");
const root = path.join(process.cwd(), "docs", "product", "v1-design", "benchmarks");

test("所有实体基准包同时满足哈希锁定和注册表输入覆盖", () => {
  const ids = fs.readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^BM-(0[1-9]|1[0-8])$/.test(entry.name))
    .map((entry) => entry.name)
    .sort();
  assert.ok(ids.length >= 13);
  for (const id of ids) {
    const definition = benchmarkDefinition(id);
    assert.ok(definition, `${id} must be registered`);
    let hash;
    assert.doesNotThrow(() => { hash = benchmarkManifestHash(definition); }, `${id} must satisfy its registered input contract`);
    assert.match(hash, /^[a-f0-9]{64}$/, `${id} must have a valid locked manifest`);
  }
});
