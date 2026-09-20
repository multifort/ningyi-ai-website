import { NextRequest, NextResponse } from "next/server";
import { createProductSessionToken, setProductSessionCookie } from "../../../../../lib/product/auth";
import { authenticateProductUser } from "../../../../../lib/product/credentials";
import { clearLoginThrottle, currentLoginThrottle, recordFailedLogin } from "../../../../../lib/product/login-throttle";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const username = typeof body.username === "string" ? body.username : "";
    const password = typeof body.password === "string" ? body.password : "";
    const throttle = currentLoginThrottle(username);
    if (throttle) return throttled(throttle.remainingSeconds);
    const user = await authenticateProductUser(username, password);
    if (!user) {
      const locked = recordFailedLogin(username);
      if (locked) return throttled(locked.remainingSeconds);
      return NextResponse.json({ success: false, error: { code: "INVALID_CREDENTIALS", message: "用户名或密码不正确。", retryable: false } }, { status: 401 });
    }
    clearLoginThrottle(username);
    const token = await createProductSessionToken({ userId: user.id, username: user.username, sessionVersion: user.sessionVersion });
    const response = NextResponse.json({ success: true, data: { user: { id: user.id, username: user.username } } });
    setProductSessionCookie(response, token);
    return response;
  } catch {
    return NextResponse.json({ success: false, error: { code: "INVALID_REQUEST", message: "登录信息无法识别，请重新填写。", retryable: false } }, { status: 400 });
  }
}

function throttled(remainingSeconds: number) {
  return NextResponse.json({ success: false, error: { code: "LOGIN_THROTTLED", message: "登录尝试过多，请稍后再试。", retryable: true } }, { status: 429, headers: { "Retry-After": String(Math.max(1, remainingSeconds)), "Cache-Control": "no-store" } });
}
