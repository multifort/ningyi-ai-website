import JSZip from "jszip";
import { productSqlite } from "./db";

type TemplateFormat = "docx" | "xlsx" | "pptx";

export async function profileTemplateFile(input: { fileId: string; solutionId: string; userId: string; detectedFormat: string; bytes: Buffer }) {
  const format = input.detectedFormat as TemplateFormat;
  try {
    const zip = await JSZip.loadAsync(input.bytes, { checkCRC32: true });
    const names = Object.keys(zip.files);
    const warnings = await templateWarnings(names, zip);
    const profile = await buildProfile(format, zip, names);
    const renderPolicy = buildRenderPolicy(format, profile);
    const structurallyCompatible = profile.structurallyCompatible === true;
    const status = structurallyCompatible ? "profiled_default_renderer" : "fallback";
    const fallbackReason = structurallyCompatible ? "模板结构已识别；企业模板渲染器尚未接入，当前成果自动使用平台默认版式。" : "模板缺少必要的 Office 结构，当前成果自动使用平台默认版式。";
    saveProfile({ ...input, status, profile, renderPolicy, warnings, fallbackReason });
    return { status, profile, renderPolicy, warnings, fallbackReason };
  } catch {
    const profile = { structurallyCompatible: false, format };
    const warnings = ["模板包无法完整解析，已自动回退平台默认版式。"];
    const fallbackReason = warnings[0];
    const renderPolicy = buildRenderPolicy(format, profile);
    saveProfile({ ...input, status: "fallback", profile, renderPolicy, warnings, fallbackReason });
    return { status: "fallback", profile, renderPolicy, warnings, fallbackReason };
  }
}

async function buildProfile(format: TemplateFormat, zip: JSZip, names: string[]) {
  const themePath = names.find((name) => /(?:word|xl|ppt)\/theme\/theme\d+\.xml$/i.test(name));
  const themeXml = themePath ? await readXml(zip, themePath) : "";
  const colors = uniqueMatches(themeXml, /<a:srgbClr[^>]*\bval="([0-9A-Fa-f]{6})"/g, 8).map((value) => `#${value.toUpperCase()}`);
  const fonts = uniqueMatches(themeXml, /<a:(?:latin|ea|cs)[^>]*\btypeface="([^"]+)"/g, 8).filter(Boolean);
  if (format === "pptx") {
    const presentationXml = await readXml(zip, "ppt/presentation.xml");
    const size = presentationXml.match(/<p:sldSz[^>]*\bcx="(\d+)"[^>]*\bcy="(\d+)"/);
    const layoutNames = names.filter((name) => /^ppt\/slideLayouts\/slideLayout\d+\.xml$/i.test(name));
    const layoutXml = await Promise.all(layoutNames.map((name) => readXml(zip, name)));
    const placeholderTypes = [...new Set(layoutXml.flatMap((value) => uniqueMatches(value, /<p:ph[^>]*\btype="([^"]+)"/g, 30)))];
    const slideSize = size ? { widthEmu: Number(size[1]), heightEmu: Number(size[2]) } : null;
    const aspectRatio = slideSize && slideSize.heightEmu > 0 ? Number((slideSize.widthEmu / slideSize.heightEmu).toFixed(4)) : null;
    return { format, structurallyCompatible: Boolean(presentationXml && names.some((name) => /^ppt\/slideMasters\/slideMaster\d+\.xml$/i.test(name))), colors, fonts, slideSize, aspectRatio, slideMasters: count(names, /^ppt\/slideMasters\/slideMaster\d+\.xml$/i), slideLayouts: layoutNames.length, placeholderTypes, sampleSlides: count(names, /^ppt\/slides\/slide\d+\.xml$/i) };
  }
  if (format === "docx") {
    const documentXml = await readXml(zip, "word/document.xml");
    const section = documentXml.match(/<w:pgSz[^>]*\bw:w="(\d+)"[^>]*\bw:h="(\d+)"/);
    return { format, structurallyCompatible: Boolean(documentXml), colors, fonts, pageSize: section ? { widthTwips: Number(section[1]), heightTwips: Number(section[2]) } : null, headers: count(names, /^word\/header\d+\.xml$/i), footers: count(names, /^word\/footer\d+\.xml$/i), hasStyles: names.includes("word/styles.xml") };
  }
  const workbookXml = await readXml(zip, "xl/workbook.xml");
  const sheets = uniqueMatches(workbookXml, /<sheet[^>]*\bname="([^"]+)"/g, 30);
  return { format, structurallyCompatible: Boolean(workbookXml), colors, fonts, sheets, hasStyles: names.includes("xl/styles.xml"), hasSharedStrings: names.includes("xl/sharedStrings.xml") };
}

async function templateWarnings(names: string[], zip: JSZip) {
  const warnings: string[] = [];
  if (names.some((name) => /vbaProject\.bin$/i.test(name))) warnings.push("检测到宏内容；生成成果不会执行或复制宏。 ");
  if (names.some((name) => /\/embeddings\//i.test(name))) warnings.push("检测到嵌入对象；生成成果不会执行嵌入内容。 ");
  const relationshipNames = names.filter((name) => /\.rels$/i.test(name));
  const relationshipXml = await Promise.all(relationshipNames.map((name) => readXml(zip, name)));
  if (relationshipXml.some((value) => /TargetMode="External"/i.test(value))) warnings.push("检测到外部链接；系统不会自动访问外部地址。 ");
  if (!Object.keys(zip.files).some((name) => /\/theme\/theme\d+\.xml$/i.test(name))) warnings.push("模板没有独立主题文件，品牌颜色和字体可能无法完整识别。 ");
  return warnings.map((item) => item.trim());
}

async function readXml(zip: JSZip, name: string) {
  return zip.file(name)?.async("string") || "";
}

function uniqueMatches(value: string, pattern: RegExp, limit: number) {
  const results: string[] = [];
  for (const match of value.matchAll(pattern)) {
    const item = match[1]?.trim();
    if (item && !results.includes(item)) results.push(item);
    if (results.length >= limit) break;
  }
  return results;
}

function count(names: string[], pattern: RegExp) {
  return names.filter((name) => pattern.test(name)).length;
}

function buildRenderPolicy(format: TemplateFormat, profile: Record<string, unknown>) {
  const colors = Array.isArray(profile.colors) ? profile.colors.filter((item): item is string => typeof item === "string") : [];
  const fonts = Array.isArray(profile.fonts) ? profile.fonts.filter((item): item is string => typeof item === "string") : [];
  const common = {
    format,
    renderer: "platform_native",
    themeColors: colors.length ? "apply" : "default",
    requestedFonts: fonts.slice(0, 4),
    typography: "safe_cjk_fallback",
    excludedContent: ["sample_text", "macros", "external_links", "embedded_objects"],
  };
  if (format === "pptx") {
    const size = profile.slideSize as { widthEmu?: number; heightEmu?: number } | null | undefined;
    const ratio = size?.widthEmu && size?.heightEmu ? size.widthEmu / size.heightEmu : 0;
    return { ...common, slideSize: ratio >= 1.65 && ratio <= 1.9 ? "apply" : "default_wide", aspectRatio: ratio ? Number(ratio.toFixed(4)) : null, masterObjects: "inspect_only", placeholders: "inspect_only" };
  }
  if (format === "docx") {
    const size = profile.pageSize as { widthTwips?: number; heightTwips?: number } | null | undefined;
    const ratio = size?.widthTwips && size?.heightTwips ? size.widthTwips / size.heightTwips : 0;
    const safePortrait = ratio >= 0.64 && ratio <= 0.79;
    return { ...common, pageSize: safePortrait ? "apply" : "default_a4", pageRatio: ratio ? Number(ratio.toFixed(4)) : null, headersFooters: "platform_generated" };
  }
  return { ...common, workbookStructure: "platform_generated", sourceSheetNames: "inspect_only" };
}

function saveProfile(input: { fileId: string; solutionId: string; userId: string; detectedFormat: string; status: string; profile: object; renderPolicy: object; warnings: string[]; fallbackReason: string }) {
  productSqlite.prepare(`INSERT INTO template_profiles
    (source_file_id, solution_id, user_id, detected_format, status, profile_json, warnings_json, render_policy_json, fallback_reason)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(source_file_id) DO UPDATE SET detected_format = excluded.detected_format, status = excluded.status,
    profile_json = excluded.profile_json, warnings_json = excluded.warnings_json, render_policy_json = excluded.render_policy_json,
    fallback_reason = excluded.fallback_reason, updated_at = CURRENT_TIMESTAMP`).run(input.fileId, input.solutionId, input.userId, input.detectedFormat, input.status, JSON.stringify(input.profile), JSON.stringify(input.warnings), JSON.stringify(input.renderPolicy), input.fallbackReason);
}
