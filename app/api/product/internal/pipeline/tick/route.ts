import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { processFormalBatch } from "../../../../../../lib/product/formal-worker";
import { processMediaBatch } from "../../../../../../lib/product/media-analysis";
import { processSourceBatch } from "../../../../../../lib/product/process-solution";
import { reconcileUnifiedKnowledge } from "../../../../../../lib/product/unified-knowledge";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const configured = process.env.PRODUCT_WORKER_SECRET || "", supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
  const expectedBytes = Buffer.from(configured), suppliedBytes = Buffer.from(supplied);
  if (!configured || expectedBytes.length !== suppliedBytes.length || !timingSafeEqual(expectedBytes, suppliedBytes)) return NextResponse.json({ success: false, error: { code: "WORKER_UNAUTHORIZED", message: "调度凭证无效。", retryable: false } }, { status: 401 });
  const started = Date.now();
  try {
    const stages = ["source", "media", "formal"] as const;
    const settled = await Promise.allSettled([
      Promise.resolve().then(() => processSourceBatch(Number(request.nextUrl.searchParams.get("sourceLimit") || process.env.PRODUCT_SOURCE_BATCH_CONCURRENCY || 2))),
      Promise.resolve().then(() => processMediaBatch(Number(request.nextUrl.searchParams.get("mediaLimit") || process.env.PRODUCT_MEDIA_BATCH_CONCURRENCY || 4))),
      Promise.resolve().then(() => processFormalBatch(Number(request.nextUrl.searchParams.get("formalLimit") || process.env.PRODUCT_FORMAL_BATCH_CONCURRENCY || 4))),
    ]);
    const data: Record<string, unknown> = { elapsedMs: Date.now() - started };
    const errors: Array<{ stage: string; code: string }> = [];
    settled.forEach((result, index) => {
      const stage = stages[index];
      if (result.status === "fulfilled") data[stage] = result.value;
      else {
        data[stage] = { processed: 0, failed: true };
        errors.push({ stage, code: "PIPELINE_STAGE_FAILED" });
      }
    });
    const knowledge = reconcileUnifiedKnowledge(Number(request.nextUrl.searchParams.get("knowledgeLimit") || process.env.PRODUCT_KNOWLEDGE_RECONCILE_BATCH || 4));
    data.knowledge = knowledge;
    if (errors.length === stages.length) return NextResponse.json({ success: false, error: { code: "PIPELINE_ALL_STAGES_FAILED", message: "流水线各阶段均暂时不可用。", retryable: true }, data: { ...data, degraded: true, errors } }, { status: 503 });
    return NextResponse.json({ success: true, data: { ...data, degraded: errors.length > 0, errors } });
  } catch {
    return NextResponse.json({ success: false, error: { code: "PIPELINE_TICK_FAILED", message: "统一流水线调度失败。", retryable: true } }, { status: 500 });
  }
}
