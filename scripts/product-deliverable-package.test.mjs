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
const { validatePackageContentVersion } = require("../lib/product/deliverable-package.ts");

test("同一内容版本的成果可以进入同一个交付包", () => {
  assert.deepEqual(validatePackageContentVersion([{ contentVersion: 3 }, { contentVersion: 3 }]), {
    passed: true,
    contentVersion: 3,
    contentVersions: [3],
  });
});

test("不同内容版本的成果不能混入同一个交付包", () => {
  assert.deepEqual(validatePackageContentVersion([{ contentVersion: 2 }, { contentVersion: 3 }]), {
    passed: false,
    contentVersion: 2,
    contentVersions: [2, 3],
  });
});

test("没有成果时不由版本规则重复报错", () => {
  assert.deepEqual(validatePackageContentVersion([]), {
    passed: true,
    contentVersion: null,
    contentVersions: [],
  });
});
