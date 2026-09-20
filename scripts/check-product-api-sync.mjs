#!/usr/bin/env node
import { readFile, readdir } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const routesRoot = join(repositoryRoot, "app", "api", "product");
const catalogPath = join(
  repositoryRoot,
  "docs",
  "product",
  "v1-design",
  "benchmarks",
  "BM-01",
  "expected",
  "product-api-catalog.json",
);
const supportedMethods = ["GET", "POST", "PUT", "PATCH", "DELETE"];

async function routeFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return routeFiles(path);
    return entry.isFile() && entry.name === "route.ts" ? [path] : [];
  }));
  return files.flat();
}

function normalizeRoutePath(file) {
  const directory = relative(join(repositoryRoot, "app"), dirname(file));
  return `/${directory.split(sep).map((segment) => {
    const match = segment.match(/^\[([^\]]+)\]$/);
    return match ? `:${match[1]}` : segment;
  }).join("/")}`;
}

function endpointKey(method, path) {
  return `${method} ${path.split("?")[0]}`;
}

const files = await routeFiles(routesRoot);
const implemented = new Set();
const parsingErrors = [];

for (const file of files) {
  const source = await readFile(file, "utf8");
  const path = normalizeRoutePath(file);
  const methods = [...source.matchAll(/export\s+async\s+function\s+(GET|POST|PUT|PATCH|DELETE)\s*\(/g)]
    .map((match) => match[1]);
  if (!methods.length) parsingErrors.push(`${relative(repositoryRoot, file)} has no supported exported method`);
  for (const method of methods) implemented.add(endpointKey(method, path));
}

const catalog = JSON.parse(await readFile(catalogPath, "utf8"));
const ids = new Set();
const cataloged = new Set();
const catalogErrors = [];

for (const endpoint of catalog.endpoints ?? []) {
  if (ids.has(endpoint.id)) catalogErrors.push(`duplicate endpoint id: ${endpoint.id}`);
  ids.add(endpoint.id);
  if (!supportedMethods.includes(endpoint.method)) catalogErrors.push(`unsupported method: ${endpoint.method}`);
  if (typeof endpoint.path !== "string" || !endpoint.path.startsWith("/api/product/")) {
    catalogErrors.push(`invalid path for ${endpoint.id}: ${endpoint.path}`);
    continue;
  }
  cataloged.add(endpointKey(endpoint.method, endpoint.path));
}

const missingFromCatalog = [...implemented].filter((key) => !cataloged.has(key)).sort();
const missingFromCode = [...cataloged].filter((key) => !implemented.has(key)).sort();
const errors = [...parsingErrors, ...catalogErrors];
const passed = errors.length === 0 && missingFromCatalog.length === 0 && missingFromCode.length === 0;

console.log(JSON.stringify({
  passed,
  routeFiles: files.length,
  implementedMethodPaths: implemented.size,
  catalogEntries: catalog.endpoints?.length ?? 0,
  catalogMethodPaths: cataloged.size,
  missingFromCatalog,
  missingFromCode,
  errors,
}, null, 2));

process.exit(passed ? 0 : 1);
