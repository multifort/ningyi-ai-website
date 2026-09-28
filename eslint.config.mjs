import path from "node:path";
import { fileURLToPath } from "node:url";
import js from "@eslint/js";
import { FlatCompat } from "@eslint/eslintrc";

const repositoryRoot = path.dirname(fileURLToPath(import.meta.url));
const compat = new FlatCompat({
  baseDirectory: repositoryRoot,
  recommendedConfig: js.configs.recommended,
});

const config = [
  {
    ignores: [
      ".next/**",
      ".venv/**",
      ".uv-cache/**",
      "node_modules/**",
      "coverage/**",
      "data/**",
      "tmp/**",
      "public/**",
      "docs/product/v1-design/benchmarks/**",
    ],
  },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
  {
    files: ["next-env.d.ts"],
    rules: {
      "@typescript-eslint/triple-slash-reference": "off",
    },
  },
  {
    files: ["*.cjs"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
];

export default config;
