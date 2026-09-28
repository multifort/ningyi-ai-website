import { quoteParameterOverrides } from "./quote-parameters";

export type StructuredItem = {
  kind: string;
  code: string;
  title: string;
  description: string;
  sourceBlockIds: string[];
  attributes: Array<{ key: string; value: string }>;
};

export type FormalSection = {
  title: string;
  content: string;
  summary: string | null;
  structuredItemsJson?: string | null;
};

export type RenderTheme = {
  sourceFileId: string;
  templateSourceFileId?: string;
  origin: "brand" | "template" | "brand_template";
  primary: string;
  accent: string;
  colors: string[];
  slideSize?: { widthEmu: number; heightEmu: number } | null;
  pageSize?: { widthTwips: number; heightTwips: number } | null;
  slideLayouts?: number;
  placeholderTypes?: string[];
};

export function officeColor(value: string) {
  return value.replace(/^#/, "").toUpperCase().padStart(6, "0").slice(0, 6);
}

export function summarize(value: string, limit = 180) {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > limit ? `${normalized.slice(0, limit - 1)}…` : normalized;
}

export function readableItemKind(kind: string) {
  const labels: Record<string, string> = { requirement: "需求", feature: "功能", estimation_item: "估算项", phase: "实施阶段", milestone: "里程碑", risk: "风险", quote_assumption: "报价假设" };
  return labels[kind] || kind;
}

export function documentPageSize(theme: RenderTheme | null) {
  const widthTwips = theme?.pageSize?.widthTwips || 0;
  const heightTwips = theme?.pageSize?.heightTwips || 0;
  const ratio = heightTwips > 0 ? widthTwips / heightTwips : 0;
  if (ratio >= 0.64 && ratio <= 0.79 && widthTwips >= 10000 && widthTwips <= 14000 && heightTwips >= 14000 && heightTwips <= 18000) {
    return { widthTwips, heightTwips, pageRatio: Number(ratio.toFixed(4)), fromTemplate: true, reason: null };
  }
  return { widthTwips: 12240, heightTwips: 15840, pageRatio: 0.7727, fromTemplate: false, reason: theme ? "模板纸张尺寸缺失或超出安全范围" : "未提供 Word 企业模板" };
}

export function mixWithWhite(value: string, ratio: number) {
  const color = officeColor(value);
  return [0, 2, 4].map((index) => {
    const channel = Number.parseInt(color.slice(index, index + 2), 16);
    return Math.round(channel + (255 - channel) * ratio).toString(16).padStart(2, "0");
  }).join("").toUpperCase();
}

export function splitContent(content: string) {
  return documentContentBlocks(content).filter((block) => !block.heading).map((block) => block.text);
}

export function documentContentBlocks(content: string) {
  const lines = content.replace(/\r/g, "").split(/\n+/).map((item) => item.replace(/^[-*•]\s*/, "").trim()).filter(Boolean);
  const blocks: Array<{ heading: boolean; text: string }> = [];
  for (const line of lines) {
    const text = line.replace(/^#{1,6}\s*/, "").trim();
    const looksLikeHeading = text.length <= 90 && /^(?:[一二三四五六七八九十]+[、.)]|\d{1,2}[、.)]|(?:背景|目标|范围|现状|交付|风险|实施|验收|上线|报价|数据|权限|集成|安全|成本|计划)[：:])/.test(text);
    if (looksLikeHeading) blocks.push({ heading: true, text });
    else {
      const sentences = text.split(/(?<=[。！？；])\s*/).filter(Boolean);
      if (sentences.length > 2 && text.length > 260) {
        for (let index = 0; index < sentences.length; index += 2) blocks.push({ heading: false, text: sentences.slice(index, index + 2).join("") });
      } else blocks.push({ heading: false, text });
    }
  }
  return blocks;
}

export function parseStructuredItems(value?: string | null): StructuredItem[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item) => item && typeof item.code === "string" && typeof item.kind === "string") : [];
  } catch {
    return [];
  }
}

export function itemAttribute(item: StructuredItem, key: string) {
  return item.attributes?.find((attribute) => attribute.key === key)?.value?.trim() || "";
}

export function numericAttribute(item: StructuredItem, key: string) {
  const value = itemAttribute(item, key);
  return /^-?\d+(?:\.\d+)?$/.test(value) ? Number(value) : null;
}

export function withQuoteOverrides(solutionId: string, items: StructuredItem[]) {
  if (!items.some((item) => item.kind === "quote_assumption")) items = [...items, { kind: "quote_assumption", code: "QUOTE-DEFAULT", title: "项目报价整体参数", description: "用户确认的项目级报价参数", sourceBlockIds: [], attributes: [] }];
  const overrides = quoteParameterOverrides(solutionId);
  return items.map((item) => {
    const attributes = new Map((item.attributes || []).map(({ key, value }) => [key, value]));
    for (const key of ["base_days", "complexity_factor", "reuse_factor", "integration_factor", "security_factor", "uncertainty_factor", "daily_rate", "tax_rate", "discount_rate", "valid_days", "budget_min", "budget_max"]) {
      const value = overrides.get(`${item.code}:${key}`);
      if (value != null) attributes.set(key, String(value));
    }
    return { ...item, attributes: [...attributes].map(([key, value]) => ({ key, value })) };
  });
}
