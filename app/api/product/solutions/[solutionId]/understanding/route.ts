import { NextRequest, NextResponse } from "next/server";
import { requireProductSession } from "../../../../../../lib/product/auth";
import { productSqlite } from "../../../../../../lib/product/db";

export async function GET(request: NextRequest, context: { params: Promise<{ solutionId: string }> }) {
  const auth = await requireProductSession(request);
  if ("response" in auth) return auth.response;
  const { solutionId } = await context.params;
  const understanding = productSqlite.prepare(`SELECT u.summary, u.facts_json AS factsJson, u.knowledge_json AS knowledgeJson, u.source_block_count AS sourceBlockCount, u.status,
      a.analysis_json AS analysisJson, a.origin AS analysisOrigin, a.model AS analysisModel, a.input_tokens AS inputTokens, a.output_tokens AS outputTokens
    FROM solution_understandings u JOIN product_solutions s ON s.id = u.solution_id
    LEFT JOIN free_analyses a ON a.solution_id = u.solution_id AND a.status = 'ready'
    WHERE u.solution_id = ? AND s.owner_user_id = ? AND s.status NOT IN ('deletion_pending', 'deleted')`).get(solutionId, auth.session.userId) as { summary: string; factsJson: string; sourceBlockCount: number; status: string } | undefined;
  if (!understanding) return NextResponse.json({ success: false, error: { code: "UNDERSTANDING_NOT_READY", message: "初步理解仍在形成。", retryable: true } }, { status: 404 });
  const row = understanding as any;
  const userFacts = productSqlite.prepare("SELECT id, text, status, created_at AS createdAt FROM project_user_facts WHERE solution_id = ? AND user_id = ? AND status = 'active' ORDER BY created_at, id").all(solutionId, auth.session.userId);
  const sourceBlocks = productSqlite.prepare(`SELECT b.id, b.block_type AS blockType, b.source_format AS sourceFormat,
      b.canonical_text AS text, b.locator_json AS locatorJson, f.original_name AS sourceName
    FROM source_blocks b LEFT JOIN source_files f ON f.id = b.source_file_id
    WHERE b.solution_id = ? AND b.canonical_text != ''
    ORDER BY b.created_at, b.id LIMIT 120`).all(solutionId).map((block: any) => ({
      id: block.id,
      blockType: block.blockType,
      sourceFormat: block.sourceFormat,
      sourceName: block.sourceName || "项目原始说明",
      text: String(block.text).replace(/\s+/g, " ").trim().slice(0, 900),
      locator: readableLocator(block.locatorJson),
    }));
  return NextResponse.json({ success: true, data: { summary: row.summary, facts: JSON.parse(row.factsJson), knowledge: parseKnowledge(row.knowledgeJson), sourceBlockCount: row.sourceBlockCount, sourceBlocks, status: row.status, userFacts, freeAnalysis: row.analysisJson ? JSON.parse(row.analysisJson) : null, analysisOrigin: row.analysisOrigin, analysisModel: row.analysisModel, usage: { inputTokens: row.inputTokens, outputTokens: row.outputTokens } } });
}

function parseKnowledge(value: string | null) { try { return JSON.parse(value || "{}"); } catch { return {}; } }
function readableLocator(value: string) {
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    return Object.entries(parsed).slice(0, 8).map(([key, item]) => `${key}：${typeof item === "string" || typeof item === "number" || typeof item === "boolean" ? String(item).slice(0, 160) : "已记录"}`).join("；") || "已记录来源位置";
  } catch {
    return "已记录来源位置";
  }
}
