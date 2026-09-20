import { NextRequest, NextResponse } from "next/server";
import { readProductSession } from "../../../../../lib/product/auth";

export async function GET(request: NextRequest) {
  const session = await readProductSession(request);
  if (!session) return NextResponse.json({ success: false, error: { code: "AUTH_REQUIRED", message: "当前未登录。", retryable: false } }, { status: 401 });
  return NextResponse.json({ success: true, data: { user: { id: session.userId, username: session.username } } });
}
