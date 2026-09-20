import { NextRequest, NextResponse } from "next/server";
import { createProductSessionToken, setProductSessionCookie } from "../../../../../lib/product/auth";
import { registerProductUser } from "../../../../../lib/product/credentials";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const username = typeof body.username === "string" ? body.username : "";
    const password = typeof body.password === "string" ? body.password : "";
    const user = await registerProductUser(username, password);
    const token = await createProductSessionToken({ userId: user.id, username: user.username, sessionVersion: user.sessionVersion });
    const response = NextResponse.json({ success: true, data: { user: { id: user.id, username: user.username } } }, { status: 201 });
    setProductSessionCookie(response, token);
    return response;
  } catch (error) {
    const code = (error as { code?: string }).code || "REGISTER_FAILED";
    const status = code === "USERNAME_TAKEN" ? 409 : 422;
    const message = code === "USERNAME_TAKEN" ? "这个用户名已被使用，请直接登录或更换用户名。" : code === "PASSWORD_LENGTH_INVALID" ? "密码需要包含 8–72 个字符。" : "用户名需为 3–40 个中文、字母、数字、下划线或短横线。";
    return NextResponse.json({ success: false, error: { code, message, retryable: false } }, { status });
  }
}
