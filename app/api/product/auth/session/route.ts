import { NextRequest, NextResponse } from "next/server";
import { readProductSession } from "../../../../../lib/product/auth";

export async function GET(request: NextRequest) {
  const session = await readProductSession(request);
  if (!session) return NextResponse.json({ success: true, data: { user: null } });
  return NextResponse.json({ success: true, data: { user: { id: session.userId, username: session.username } } });
}
