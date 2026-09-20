import { inflateSync } from "zlib";
import { productSqlite } from "./db";

type Rgb = { r: number; g: number; b: number };

/**
 * Brand assets are treated as rendering-only input. We inspect image pixels
 * locally and store only a conservative palette; no image body is sent to a
 * model or third-party service.
 */
export async function profileBrandFile(input: { fileId: string; solutionId: string; userId: string; detectedFormat: string; bytes: Buffer }) {
  if (!["png", "jpeg", "webp"].includes(input.detectedFormat)) {
    return save(input, "fallback", {}, "当前品牌文件仅随完整归档包保存；请上传 PNG、JPG 或 WebP Logo 以应用品牌颜色。");
  }
  try {
    const dominant = dominantPngColor(input.bytes);
    if (!dominant) return save(input, "fallback", {}, "当前图片无法安全提取主题色；素材已保存，成果会继续使用企业模板或平台默认主题。");
    const primary = toHex(dominant);
    if (!isUsefulColor(dominant)) return save(input, "fallback", {}, "Logo 的主色过浅、过深或灰度过低，当前成果会继续使用企业模板或平台默认主题。");
    const accent = accentFor(dominant);
    return save(input, "ready", { primary, accent, colors: [primary, accent] }, null);
  } catch {
    return save(input, "fallback", {}, "无法安全读取该品牌图片，当前成果会继续使用企业模板或平台默认主题。");
  }
}

function save(input: { fileId: string; solutionId: string; userId: string; detectedFormat: string }, status: string, profile: object, fallbackReason: string | null) {
  productSqlite.prepare(`INSERT INTO brand_profiles
    (source_file_id, solution_id, user_id, detected_format, status, profile_json, fallback_reason)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(source_file_id) DO UPDATE SET detected_format = excluded.detected_format, status = excluded.status,
      profile_json = excluded.profile_json, fallback_reason = excluded.fallback_reason, updated_at = CURRENT_TIMESTAMP`).run(
    input.fileId, input.solutionId, input.userId, input.detectedFormat, status, JSON.stringify(profile), fallbackReason,
  );
  return { status, profile, fallbackReason };
}

function toHex({ r, g, b }: Rgb) { return `#${[r, g, b].map((value) => Math.round(value).toString(16).padStart(2, "0")).join("").toUpperCase()}`; }
function isUsefulColor({ r, g, b }: Rgb) {
  const maximum = Math.max(r, g, b), minimum = Math.min(r, g, b), average = (r + g + b) / 3;
  return maximum - minimum >= 24 && average >= 28 && average <= 220;
}
function accentFor(color: Rgb) {
  const lightness = (Math.max(color.r, color.g, color.b) + Math.min(color.r, color.g, color.b)) / 510;
  const ratio = lightness > 0.55 ? 0.68 : 0.38;
  return toHex({ r: color.r + (255 - color.r) * ratio, g: color.g + (255 - color.g) * ratio, b: color.b + (255 - color.b) * ratio });
}

/**
 * Minimal, bounded PNG palette reader. It accepts only non-interlaced 8-bit
 * RGB/RGBA files and samples decoded pixels locally; unsupported image formats
 * deliberately fall back rather than relying on a native image dependency.
 */
function dominantPngColor(bytes: Buffer): Rgb | null {
  const signature = "89504e470d0a1a0a";
  if (bytes.subarray(0, 8).toString("hex") !== signature) return null;
  let offset = 8, width = 0, height = 0, bitDepth = 0, colorType = 0;
  const compressed: Buffer[] = [];
  let compressedBytes = 0;
  while (offset + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(offset); offset += 4;
    const type = bytes.subarray(offset, offset + 4).toString("ascii"); offset += 4;
    if (length > 16 * 1024 * 1024 || offset + length + 4 > bytes.length) return null;
    const value = bytes.subarray(offset, offset + length); offset += length + 4;
    if (type === "IHDR") {
      if (value.length !== 13) return null;
      width = value.readUInt32BE(0); height = value.readUInt32BE(4); bitDepth = value[8]; colorType = value[9];
      if (!width || !height || width > 4096 || height > 4096 || bitDepth !== 8 || ![2, 6].includes(colorType) || value[12] !== 0) return null;
    } else if (type === "IDAT") {
      compressedBytes += value.length;
      if (compressedBytes > 32 * 1024 * 1024) return null;
      compressed.push(value);
    }
    else if (type === "IEND") break;
  }
  if (!width || !height || !compressed.length) return null;
  let decoded: Buffer;
  try { decoded = inflateSync(Buffer.concat(compressed), { maxOutputLength: 64 * 1024 * 1024 }); } catch { return null; }
  const channels = colorType === 6 ? 4 : 3, stride = width * channels;
  if (decoded.length !== height * (stride + 1)) return null;
  const previous = Buffer.alloc(stride), current = Buffer.alloc(stride), palette = new Map<string, { color: Rgb; count: number }>();
  for (let y = 0, cursor = 0; y < height; y += 1) {
    const filter = decoded[cursor++];
    for (let x = 0; x < stride; x += 1) {
      const raw = decoded[cursor++], left = x >= channels ? current[x - channels] : 0, up = previous[x], upperLeft = x >= channels ? previous[x - channels] : 0;
      current[x] = unfilter(raw, filter, left, up, upperLeft);
    }
    const step = Math.max(1, Math.floor(width / 96));
    for (let x = 0; x < width; x += step) {
      const index = x * channels;
      if (channels === 4 && current[index + 3] < 128) continue;
      const color = { r: current[index], g: current[index + 1], b: current[index + 2] };
      if (!isUsefulColor(color)) continue;
      const key = `${color.r >> 4}:${color.g >> 4}:${color.b >> 4}`;
      const entry = palette.get(key);
      if (entry) entry.count += 1; else palette.set(key, { color, count: 1 });
    }
    current.copy(previous);
  }
  return [...palette.values()].sort((a, b) => b.count - a.count)[0]?.color || null;
}

function unfilter(value: number, filter: number, left: number, up: number, upperLeft: number) {
  if (filter === 0) return value;
  if (filter === 1) return (value + left) & 0xff;
  if (filter === 2) return (value + up) & 0xff;
  if (filter === 3) return (value + Math.floor((left + up) / 2)) & 0xff;
  if (filter === 4) {
    const p = left + up - upperLeft, pa = Math.abs(p - left), pb = Math.abs(p - up), pc = Math.abs(p - upperLeft);
    return (value + (pa <= pb && pa <= pc ? left : pb <= pc ? up : upperLeft)) & 0xff;
  }
  return value;
}
