import { NextResponse } from "next/server";
import { clearProductSessionCookie } from "../../../../../lib/product/auth";

export async function POST() {
  const response = NextResponse.json({ success: true, data: { loggedOut: true } });
  clearProductSessionCookie(response);
  return response;
}
