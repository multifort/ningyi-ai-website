import { NextRequest, NextResponse } from "next/server";
import { createProductSessionToken, requireProductSession, setProductSessionCookie } from "../../../../../lib/product/auth";
import { changeProductUserPassword } from "../../../../../lib/product/credentials";

export async function POST(request: NextRequest) {
  const auth = await requireProductSession(request);
  if ("response" in auth) return auth.response;
  let body: { currentPassword?: unknown; newPassword?: unknown } = {};
  try { body = await request.json(); } catch { /* handled below */ }
  if (typeof body.currentPassword !== "string" || typeof body.newPassword !== "string") {
    return NextResponse.json({ success: false, error: { code: "INVALID_REQUEST", message: "请输入当前密码和新密码。", retryable: false } }, { status: 422 });
  }
  try {
    const changed = await changeProductUserPassword(auth.session.userId, body.currentPassword, body.newPassword);
    const token = await createProductSessionToken({ userId: auth.session.userId, username: auth.session.username, sessionVersion: changed.sessionVersion });
    const response = NextResponse.json({ success: true, data: { updated: true, otherSessionsRevoked: true } });
    setProductSessionCookie(response, token);
    return response;
  } catch (error) {
    const code = (error as { code?: string }).code || "PASSWORD_UPDATE_FAILED";
    const message = code === "PASSWORD_LENGTH_INVALID" ? "新密码需要包含 8–72 个字符。" : code === "INVALID_CURRENT_PASSWORD" ? "当前密码不正确。" : "密码暂时无法更新，请稍后重试。";
    return NextResponse.json({ success: false, error: { code, message, retryable: code === "PASSWORD_UPDATE_FAILED" } }, { status: code === "INVALID_CURRENT_PASSWORD" ? 403 : 422 });
  }
}
