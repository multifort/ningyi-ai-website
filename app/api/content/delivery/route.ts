import { NextRequest, NextResponse } from "next/server";
import { sqlite } from "../../../../lib/db";
import { defaultDeliveryContent, type DeliveryContent } from "../../../../lib/delivery-content";
import { requireAuth } from "../../../../lib/middleware";

function ensureTable() {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS delivery_content (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      content_json TEXT NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

export async function GET() {
  try {
    ensureTable();
    const row = sqlite.prepare("SELECT content_json FROM delivery_content WHERE id = 1").get() as { content_json?: string } | undefined;
    const content = row?.content_json ? JSON.parse(row.content_json) : defaultDeliveryContent;
    return NextResponse.json({ success: true, data: content });
  } catch (error) {
    console.error("获取交付流程内容失败:", error);
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
    if ("status" in authResult) return authResult;
    ensureTable();
    const content = (await request.json()) as DeliveryContent;
    if (!content?.demo || !content?.architecture) return NextResponse.json({ error: "内容格式错误" }, { status: 400 });
    sqlite.prepare(`
      INSERT INTO delivery_content (id, content_json, updated_at) VALUES (1, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(id) DO UPDATE SET content_json = excluded.content_json, updated_at = CURRENT_TIMESTAMP
    `).run(JSON.stringify(content));
    return NextResponse.json({ success: true, message: "交付流程内容已保存" });
  } catch (error) {
    console.error("保存交付流程内容失败:", error);
    return NextResponse.json({ error: "保存失败" }, { status: 500 });
  }
}
