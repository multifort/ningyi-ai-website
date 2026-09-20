import { createHash } from "crypto";
import fs from "fs";
import path from "path";

type Requirement = { category: "content" | "template" | "brand"; formats: string[]; label: string };
type Definition = { benchmarkId: string; title: string; projectType: "software" | "agent"; requiredInputs: Requirement[] };

const rows: Array<[string, string, "software" | "agent", Requirement[]]> = [
  ["BM-01", "中型企业 CRM", "software", [content("docx"), content("pdf"), content("xlsx")]],
  ["BM-02", "OA 审批系统", "software", [image(), content("pdf"), content("xlsx")]],
  ["BM-03", "销售移动端", "software", [content("docx", "pdf"), image(), content("xlsx")]],
  ["BM-04", "客户服务小程序", "software", [content("txt"), content("docx"), image()]],
  ["BM-05", "经销商管理平台", "software", [content("pptx"), content("xlsx")]],
  ["BM-06", "采购与供应商协同", "software", [content("pdf"), content("xlsx"), content("txt")]],
  ["BM-07", "售后服务平台", "software", [content("csv"), content("docx"), image()]],
  ["BM-08", "经营数据看板", "software", [content("xlsx"), image(), content("docx", "pdf")]],
  ["BM-09", "会员服务平台", "software", [content("pdf"), content("xlsx"), content("docx")]],
  ["BM-10", "合同管理系统", "software", [content("docx"), content("xlsx"), template("docx")]],
  ["BM-11", "企业门户", "software", [content("xlsx"), image(), content("docx")]],
  ["BM-12", "CRM 与 ERP 集成", "software", [content("pdf"), content("xlsx"), image()]],
  ["BM-13", "旧系统升级改造", "software", [content("xls"), content("doc"), image()]],
  ["BM-14", "私有化部署项目", "software", [content("pdf"), content("xlsx"), image()]],
  ["BM-15", "多格式与企业模板综合项目", "software", [content("docx"), content("pdf"), content("pptx"), content("xlsx"), image(), template("docx"), template("xlsx"), template("pptx"), brand()]],
  ["BM-16", "企业知识服务 Agent", "agent", [content("xlsx"), content("docx"), content("txt", "pdf")]],
  ["BM-17", "文档与方案生成 Agent", "agent", [content("docx", "pdf"), template("pptx"), template("docx")]],
  ["BM-18", "业务流程执行 Agent", "agent", [content("docx", "pdf"), content("xlsx"), content("txt", "json")]],
];

export const benchmarkRegistry: Definition[] = rows.map(([benchmarkId, title, projectType, requiredInputs]) => ({ benchmarkId, title, projectType, requiredInputs }));

export function benchmarkDefinition(id: string) { return benchmarkRegistry.find((item) => item.benchmarkId === id); }
export function benchmarkManifestHash(definition: Definition) {
  const root = path.join(process.cwd(), "docs", "product", "v1-design", "benchmarks", definition.benchmarkId);
  const manifestPath = path.join(root, "manifest.json");
  let bytes: Buffer;
  let manifest: any;
  try {
    bytes = fs.readFileSync(manifestPath);
    manifest = JSON.parse(bytes.toString("utf8"));
  } catch { throw new Error("BENCHMARK_MANIFEST_UNAVAILABLE"); }
  validateBenchmarkManifest(definition, manifest);
  for (const entry of manifest.files) {
    if (typeof entry.path !== "string" || !/^[a-f0-9]{64}$/.test(entry.sha256 || "")) throw new Error("BENCHMARK_MANIFEST_INVALID");
    const absolute = path.resolve(root, entry.path);
    if (!absolute.startsWith(`${root}${path.sep}`)) throw new Error("BENCHMARK_MANIFEST_INVALID");
    let actual: string;
    try { actual = createHash("sha256").update(fs.readFileSync(absolute)).digest("hex"); }
    catch { throw new Error("BENCHMARK_MANIFEST_FILE_MISSING"); }
    if (actual !== entry.sha256) throw new Error("BENCHMARK_MANIFEST_HASH_MISMATCH");
  }
  return createHash("sha256").update(bytes).digest("hex");
}

export function validateBenchmarkManifest(definition: Definition, manifest: any) {
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) throw new Error("BENCHMARK_MANIFEST_INVALID");
  const allowedKeys = new Set(["benchmarkId", "benchmarkVersion", "title", "projectType", "difficulty", "files", "coverageTags", "expectedScale", "timeoutSeconds", "blockingChecks"]);
  if (Object.keys(manifest).some((key) => !allowedKeys.has(key))) throw new Error("BENCHMARK_MANIFEST_INVALID");
  if (manifest.benchmarkId !== definition.benchmarkId || !/^\d+\.\d+$/.test(manifest.benchmarkVersion || "") || typeof manifest.title !== "string" || !manifest.title.trim()) throw new Error("BENCHMARK_MANIFEST_INVALID");
  if (!["software", "integration", "upgrade", "deployment", "ai_agent", "hybrid"].includes(manifest.projectType) || !["L1", "L2", "L3", "L4"].includes(manifest.difficulty)) throw new Error("BENCHMARK_MANIFEST_INVALID");
  if (!Array.isArray(manifest.files) || !manifest.files.length || !uniqueStrings(manifest.files.map((file: any) => file?.path))) throw new Error("BENCHMARK_MANIFEST_INVALID");
  for (const file of manifest.files) {
    if (!file || Object.keys(file).some((key) => !["path", "sha256", "category", "format", "licenseStatus"].includes(key))) throw new Error("BENCHMARK_MANIFEST_INVALID");
    if (typeof file.path !== "string" || !file.path || path.isAbsolute(file.path) || file.path.split(/[\\/]/).includes("..")) throw new Error("BENCHMARK_MANIFEST_INVALID");
    if (!/^[a-f0-9]{64}$/.test(file.sha256 || "") || !["content", "template", "brand"].includes(file.category) || typeof file.format !== "string" || !file.format || !["synthetic", "public_licensed", "approved_anonymized"].includes(file.licenseStatus)) throw new Error("BENCHMARK_MANIFEST_INVALID");
  }
  if (!Array.isArray(manifest.coverageTags) || !uniqueStrings(manifest.coverageTags) || !Array.isArray(manifest.blockingChecks) || !manifest.blockingChecks.length || !uniqueStrings(manifest.blockingChecks)) throw new Error("BENCHMARK_MANIFEST_INVALID");
  if (manifest.timeoutSeconds != null && (!Number.isInteger(manifest.timeoutSeconds) || manifest.timeoutSeconds < 1)) throw new Error("BENCHMARK_MANIFEST_INVALID");
  if (manifest.expectedScale != null) for (const value of Object.values(manifest.expectedScale) as any[]) if (!value || !Number.isInteger(value.min) || !Number.isInteger(value.max) || value.min < 0 || value.max < value.min) throw new Error("BENCHMARK_MANIFEST_INVALID");
  const sourceFiles = manifest.files.filter((file: any) => file.path.startsWith("sources/"));
  const missing = definition.requiredInputs.filter((requirement) => !sourceFiles.some((file: any) => file.category === requirement.category && requirement.formats.includes(file.format)));
  if (missing.length) throw new Error(`BENCHMARK_MANIFEST_INPUTS_INCOMPLETE:${missing.map((item) => `${item.category}/${item.formats.join("|")}`).join(",")}`);
}

function uniqueStrings(values: unknown[]) {
  return values.every((value) => typeof value === "string" && value.length > 0) && new Set(values).size === values.length;
}
function content(...formats: string[]): Requirement { return { category: "content", formats, label: "项目材料" }; }
function template(...formats: string[]): Requirement { return { category: "template", formats, label: "企业模板" }; }
function image(): Requirement { return { category: "content", formats: ["png", "jpeg", "jpg", "webp"], label: "图片材料" }; }
function brand(): Requirement { return { category: "brand", formats: ["png", "jpeg", "jpg", "pdf"], label: "品牌素材" }; }
