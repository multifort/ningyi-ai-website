import { createHash } from "crypto";
import { productSqlite } from "./db";

type BlockRow = { id: string; text: string; blockType: string; sourceFileId: string | null; sourceFormat: string | null; displayName: string | null; contentHash: string };
type Fact = { id: string; text: string; topic: string; sourceBlockId: string; sourceBlockIds: string[]; sourceFiles: string[]; sourceFormats: string[] };
export const UNIFIED_KNOWLEDGE_VERSION = "1.2";

const topics: Array<{ id: string; label: string; patterns: RegExp[] }> = [
  { id: "scope", label: "范围与边界", patterns: [/一期|本期|范围|包含|不包含|排除|边界/u] },
  { id: "users", label: "用户与角色", patterns: [/用户|角色|申请人|审批人|管理员|负责人|主管/u] },
  { id: "goals", label: "目标与指标", patterns: [/目标|提升|降低|缩短|完成率|准确率|时长/u] },
  { id: "process", label: "流程与规则", patterns: [/流程|审批|节点|提交|退回|流转|规则/u] },
  { id: "features", label: "功能与产品形态", patterns: [/功能|系统|平台|Web|App|小程序|看板|导出/u] },
  { id: "data", label: "数据与质量", patterns: [/数据|字段|重复|缺失|迁移|同步|格式/u] },
  { id: "integration", label: "集成与接口", patterns: [/集成|接口|对接|身份平台|单点|消息|邮件/u] },
  { id: "security", label: "权限与安全", patterns: [/权限|授权|安全|隐私|审计|隔离/u] },
  { id: "budget", label: "预算与报价", patterns: [/预算|报价|金额|成本|费率/u] },
  { id: "timeline", label: "周期与计划", patterns: [/周期|日期|上线|开始|工期|工作日|里程碑/u] },
];
const negative = /不包含|不包括|不得|不能|不允许|禁止|排除|范围外|暂不|未授权/u;

export function rebuildUnifiedKnowledge(solutionId: string) {
  return productSqlite.transaction(() => buildUnifiedKnowledge(solutionId)).immediate();
}

function buildUnifiedKnowledge(solutionId: string) {
  const sourceBlocks = productSqlite.prepare(`SELECT b.id, b.canonical_text AS text, b.block_type AS blockType, b.source_file_id AS sourceFileId,
      b.source_format AS sourceFormat, f.original_name AS displayName, b.content_hash AS contentHash
    FROM source_blocks b LEFT JOIN source_files f ON f.id = b.source_file_id
    LEFT JOIN media_analysis_tasks m ON m.source_block_id = b.id
    WHERE b.solution_id = ? AND b.canonical_text != '' AND (m.id IS NULL OR m.status = 'completed')
    ORDER BY b.created_at, b.id`).all(solutionId) as BlockRow[];
  const userFacts = (productSqlite.prepare(`SELECT id, text, 'user_confirmed_fact' AS blockType, NULL AS sourceFileId,
      'user_confirmed' AS sourceFormat, '用户确认' AS displayName
    FROM project_user_facts WHERE solution_id = ? AND status = 'active' ORDER BY created_at, id`).all(solutionId) as Array<Omit<BlockRow, "contentHash">>)
    .map((fact) => ({ ...fact, contentHash: createHash("sha256").update(fact.text).digest("hex") }));
  const blocks = [...sourceBlocks, ...userFacts];
  const candidates = blocks.flatMap((block) => splitStatements(block.text).map((text) => ({ block, text }))).slice(0, 800);
  const grouped = new Map<string, { text: string; topic: string; blocks: BlockRow[] }>();
  for (const candidate of candidates) {
    const normalized = normalize(candidate.text);
    if (normalized.length < 6) continue;
    const key = createHash("sha256").update(normalized).digest("hex");
    const existing = grouped.get(key);
    if (existing) { if (!existing.blocks.some((block) => block.id === candidate.block.id)) existing.blocks.push(candidate.block); }
    else grouped.set(key, { text: candidate.text, topic: topicFor(candidate.text), blocks: [candidate.block] });
  }
  const ranked = [...grouped.values()].sort((left, right) => score(right) - score(left) || left.text.localeCompare(right.text, "zh-CN"));
  const facts: Fact[] = ranked.slice(0, 60).map((item, index) => ({
    id: `FACT-${String(index + 1).padStart(3, "0")}`, text: item.text.slice(0, 500), topic: item.topic,
    sourceBlockId: item.blocks[0].id, sourceBlockIds: item.blocks.map((block) => block.id),
    sourceFiles: unique(item.blocks.map((block) => block.displayName).filter(Boolean) as string[]),
    sourceFormats: unique(item.blocks.map((block) => block.sourceFormat).filter(Boolean) as string[]),
  }));
  const conflicts = detectConflicts(facts);
  const topicCounts = Object.fromEntries(topics.map((topic) => [topic.id, facts.filter((fact) => fact.topic === topic.id).length]));
  const formats = unique(blocks.map((block) => block.sourceFormat).filter(Boolean) as string[]);
  const sourceFileCount = new Set(blocks.map((block) => block.sourceFileId).filter(Boolean)).size;
  const inputHash = createHash("sha256").update(JSON.stringify(blocks.map((block) => [block.id, block.contentHash, block.sourceFormat || ""]))).digest("hex");
  const missingTopics = topics.filter((topic) => !topicCounts[topic.id]).map((topic) => ({ id: topic.id, label: topic.label }));
  const knowledge = {
    version: UNIFIED_KNOWLEDGE_VERSION, inputHash, status: conflicts.length ? "review_required" : "ready", generatedAt: new Date().toISOString(),
    stats: { sourceBlockCount: blocks.length, sourceFileCount, factCount: facts.length, conflictCount: conflicts.length, duplicateStatementsMerged: Math.max(0, candidates.length - grouped.size), formats },
    topicCounts, missingTopics, conflicts, facts,
  };
  const summary = `系统已将 ${sourceFileCount || "文字说明"} 份材料中的 ${blocks.length} 个可追溯内容块归并为 ${facts.length} 条统一事实，覆盖 ${formats.length || 1} 类输入格式${conflicts.length ? `，发现 ${conflicts.length} 组需要在方案中明确标注的潜在冲突` : "，暂未发现明确的相反表述"}。`;
  productSqlite.prepare(`INSERT INTO solution_understandings (solution_id, summary, facts_json, knowledge_json, source_block_count, status)
    VALUES (?, ?, ?, ?, ?, 'ready') ON CONFLICT(solution_id) DO UPDATE SET summary = excluded.summary, facts_json = excluded.facts_json,
    knowledge_json = excluded.knowledge_json, source_block_count = excluded.source_block_count, status = 'ready', updated_at = CURRENT_TIMESTAMP`).run(solutionId, summary, JSON.stringify(facts.slice(0, 24)), JSON.stringify(knowledge), blocks.length);
  return { summary, facts, knowledge };
}

export function reconcileUnifiedKnowledge(requestedLimit = 4) {
  const limit = Math.min(20, Math.max(1, Math.floor(requestedLimit)));
  const candidates = productSqlite.prepare(`WITH stale AS (
      SELECT s.id AS solutionId, s.owner_user_id AS ownerUserId, COALESCE(u.updated_at, s.created_at) AS queuedAt
      FROM product_solutions s LEFT JOIN solution_understandings u ON u.solution_id = s.id
      WHERE s.status NOT IN ('deletion_pending','deleted') AND EXISTS (SELECT 1 FROM source_blocks b WHERE b.solution_id = s.id)
        AND (u.solution_id IS NULL OR u.status != 'ready' OR json_valid(u.knowledge_json) = 0
          OR COALESCE(json_extract(u.knowledge_json, '$.version'), '') != ?
          OR u.updated_at < (SELECT MAX(COALESCE(m.updated_at, b.created_at)) FROM source_blocks b LEFT JOIN media_analysis_tasks m ON m.source_block_id = b.id WHERE b.solution_id = s.id))
    ), ranked AS (
      SELECT solutionId, queuedAt, ROW_NUMBER() OVER (PARTITION BY ownerUserId ORDER BY queuedAt, solutionId) AS ownerRank FROM stale
    )
    SELECT solutionId FROM ranked ORDER BY ownerRank, queuedAt, solutionId LIMIT ?`).all(UNIFIED_KNOWLEDGE_VERSION, limit) as Array<{ solutionId: string }>;
  for (const candidate of candidates) rebuildUnifiedKnowledge(candidate.solutionId);
  return { scanned: candidates.length, processed: candidates.length, solutionIds: candidates.map((candidate) => candidate.solutionId) };
}

export function unifiedKnowledgeBacklog() {
  const row = productSqlite.prepare(`SELECT COUNT(*) AS count, MIN(COALESCE(u.updated_at, s.created_at)) AS oldest
    FROM product_solutions s LEFT JOIN solution_understandings u ON u.solution_id = s.id
    WHERE s.status NOT IN ('deletion_pending','deleted') AND EXISTS (SELECT 1 FROM source_blocks b WHERE b.solution_id = s.id)
      AND (u.solution_id IS NULL OR u.status != 'ready' OR json_valid(u.knowledge_json) = 0 OR COALESCE(json_extract(u.knowledge_json, '$.version'), '') != ?
        OR u.updated_at < (SELECT MAX(COALESCE(m.updated_at, b.created_at)) FROM source_blocks b LEFT JOIN media_analysis_tasks m ON m.source_block_id = b.id WHERE b.solution_id = s.id))`).get(UNIFIED_KNOWLEDGE_VERSION) as { count: number; oldest: string | null };
  return { count: Number(row.count || 0), oldest: row.oldest };
}

export function ensureUnifiedKnowledge(solutionId: string) {
  const row = productSqlite.prepare("SELECT knowledge_json AS knowledgeJson, status FROM solution_understandings WHERE solution_id = ?").get(solutionId) as { knowledgeJson: string; status: string } | undefined;
  if (row?.status === "ready") {
    try {
      const knowledge = JSON.parse(row.knowledgeJson || "{}");
      if (knowledge.version === UNIFIED_KNOWLEDGE_VERSION && knowledge.inputHash === currentInputHash(solutionId)) return knowledge;
    } catch { /* Rebuild invalid or legacy snapshots below. */ }
  }
  return rebuildUnifiedKnowledge(solutionId).knowledge;
}

export function unifiedKnowledgeFingerprint(solutionId: string) {
  const row = productSqlite.prepare("SELECT knowledge_json AS knowledgeJson, status FROM solution_understandings WHERE solution_id = ?").get(solutionId) as { knowledgeJson: string; status: string } | undefined;
  try {
    const knowledge = JSON.parse(row?.knowledgeJson || "{}");
    const computedInputHash = currentInputHash(solutionId);
    return { status: row?.status || "missing", version: String(knowledge.version || ""), inputHash: String(knowledge.inputHash || ""), computedInputHash,
      current: row?.status === "ready" && knowledge.version === UNIFIED_KNOWLEDGE_VERSION && knowledge.inputHash === computedInputHash };
  } catch {
    return { status: row?.status || "missing", version: "", inputHash: "", computedInputHash: currentInputHash(solutionId), current: false };
  }
}

export function unifiedKnowledgeContext(solutionId: string) {
  const row = productSqlite.prepare("SELECT knowledge_json AS knowledgeJson, status FROM solution_understandings WHERE solution_id = ?").get(solutionId) as { knowledgeJson: string; status: string } | undefined;
  if (!row?.knowledgeJson || row.status !== "ready") return { text: "", sourceIds: [] as string[], version: "", inputHash: "" };
  try {
    const knowledge = JSON.parse(row.knowledgeJson) as any;
    const selectedFacts = (knowledge.facts || []).slice(0, 12);
    const facts = selectedFacts.map((fact: any) => `${fact.id} [${fact.topic}] ${fact.text} (sources:${(fact.sourceBlockIds || []).join(",")})`).join("\n");
    const conflicts = (knowledge.conflicts || []).map((item: any) => `${item.id} ${item.topicLabel}：${item.statements.map((statement: any) => statement.factId).join(" vs ")}，必须标注为待确认，不得擅自取舍`).join("\n");
    return { text: `统一材料知识快照（所有章节共同依据）：\n${facts || "无"}\n潜在冲突：\n${conflicts || "无"}`.slice(0, 8000), sourceIds: unique(selectedFacts.flatMap((fact: any) => Array.isArray(fact.sourceBlockIds) ? fact.sourceBlockIds : [])) as string[], version: String(knowledge.version || ""), inputHash: String(knowledge.inputHash || "") };
  } catch { return { text: "", sourceIds: [] as string[], version: "", inputHash: "" }; }
}

function detectConflicts(facts: Fact[]) {
  const result: Array<{ id: string; topic: string; topicLabel: string; statements: Array<{ factId: string; text: string; sourceBlockIds: string[] }>; reason: string }> = [];
  for (const topic of topics) {
    const relevant = facts.filter((fact) => fact.topic === topic.id);
    const positive = relevant.filter((fact) => !negative.test(fact.text));
    const negatives = relevant.filter((fact) => negative.test(fact.text));
    for (const no of negatives) {
      const yes = positive.find((candidate) => keywordOverlap(candidate.text, no.text) >= 2 && !candidate.sourceBlockIds.some((id) => no.sourceBlockIds.includes(id)));
      if (!yes) continue;
      result.push({ id: `CONFLICT-${String(result.length + 1).padStart(3, "0")}`, topic: topic.id, topicLabel: topic.label, statements: [yes, no].map((fact) => ({ factId: fact.id, text: fact.text, sourceBlockIds: fact.sourceBlockIds })), reason: "不同来源对同一主题存在肯定与否定表述" });
    }
  }
  return result.slice(0, 20);
}
function splitStatements(text: string) { return text.replace(/\r/g, "\n").split(/[。！？!?；;\n]+/u).map((item) => item.replace(/\s+/g, " ").trim()).filter(Boolean); }
function normalize(text: string) { return text.normalize("NFKC").toLowerCase().replace(/[\s，,。：:（）()\[\]【】"'“”‘’]/gu, ""); }
function topicFor(text: string) { return topics.find((topic) => topic.patterns.some((pattern) => pattern.test(text)))?.id || "other"; }
function score(item: { text: string; topic: string; blocks: BlockRow[] }) { return item.blocks.length * 5 + (item.blocks.some((block) => block.blockType === "user_confirmed_fact") ? 20 : 0) + (item.topic === "other" ? 0 : 4) + Math.min(4, Math.floor(item.text.length / 40)); }
function keywordOverlap(left: string, right: string) {
  const tokens = (value: string) => {
    const cleaned = normalize(value).replace(/不包含|不包括|不得|不能|不允许|禁止|排除|范围外|暂不|未授权|一期|本期|范围|包含|包括/gu, "");
    const chinese = cleaned.replace(/[^\p{Script=Han}]/gu, "");
    const grams = Array.from({ length: Math.max(0, chinese.length - 1) }, (_, index) => chinese.slice(index, index + 2));
    return [...grams, ...(cleaned.match(/[a-z]{3,}/gu) || [])];
  };
  const known = new Set(tokens(left));
  return unique(tokens(right).filter((word) => known.has(word))).length;
}
function unique<T>(values: T[]) { return [...new Set(values)]; }
function currentInputHash(solutionId: string) {
  const blocks = productSqlite.prepare(`SELECT b.id, b.content_hash AS contentHash, b.source_format AS sourceFormat
    FROM source_blocks b LEFT JOIN media_analysis_tasks m ON m.source_block_id = b.id
    WHERE b.solution_id = ? AND b.canonical_text != '' AND (m.id IS NULL OR m.status = 'completed')
    ORDER BY b.created_at, b.id`).all(solutionId) as Array<{ id: string; contentHash: string; sourceFormat: string | null }>;
  const userFacts = productSqlite.prepare("SELECT id, text FROM project_user_facts WHERE solution_id = ? AND status = 'active' ORDER BY created_at, id").all(solutionId) as Array<{ id: string; text: string }>;
  const inputs = [
    ...blocks.map((block) => [block.id, block.contentHash, block.sourceFormat || ""]),
    ...userFacts.map((fact) => [fact.id, createHash("sha256").update(fact.text).digest("hex"), "user_confirmed"]),
  ];
  return createHash("sha256").update(JSON.stringify(inputs)).digest("hex");
}
