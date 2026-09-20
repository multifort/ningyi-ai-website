import { SignJWT, jwtVerify } from "jose";
import { NextRequest, NextResponse } from "next/server";
import { productSqlite } from "./db";

export const PRODUCT_SESSION_COOKIE = "ningyi_product_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

export type ProductSession = { userId: string; username: string; sessionVersion: number };

function sessionSecret() {
  const configured = process.env.PRODUCT_SESSION_SECRET;
  if (configured) return new TextEncoder().encode(configured);
  if (process.env.NODE_ENV === "production") {
    throw new Error("PRODUCT_SESSION_SECRET is required in production");
  }
  return new TextEncoder().encode("development-only-product-session-secret-change-me");
}

export async function createProductSessionToken(session: ProductSession) {
  return new SignJWT({ username: session.username, sessionVersion: session.sessionVersion, domain: "product" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(session.userId)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(sessionSecret());
}

export async function readProductSession(request: NextRequest): Promise<ProductSession | null> {
  const token = request.cookies.get(PRODUCT_SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, sessionSecret(), { algorithms: ["HS256"] });
    if (payload.domain !== "product" || !payload.sub || typeof payload.username !== "string" || !Number.isSafeInteger(payload.sessionVersion)) return null;
    const user = productSqlite.prepare("SELECT status, session_version AS sessionVersion FROM product_users WHERE id = ?").get(payload.sub) as { status: string; sessionVersion: number } | undefined;
    if (!user || user.status !== "active" || user.sessionVersion !== payload.sessionVersion) return null;
    return { userId: payload.sub, username: payload.username, sessionVersion: user.sessionVersion };
  } catch {
    return null;
  }
}

export function setProductSessionCookie(response: NextResponse, token: string) {
  response.cookies.set(PRODUCT_SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export function clearProductSessionCookie(response: NextResponse) {
  response.cookies.set(PRODUCT_SESSION_COOKIE, "", { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 0 });
}

export async function requireProductSession(request: NextRequest) {
  const session = await readProductSession(request);
  if (!session) {
    return { response: NextResponse.json({ success: false, error: { code: "AUTH_REQUIRED", message: "请先登录后继续。", retryable: false } }, { status: 401 }) };
  }
  return { session };
}
