import { NextResponse } from "next/server";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  const cookieOptions = {
    httpOnly: true,
    secure: Boolean(process.env.VERCEL_ENV),
    sameSite: "lax" as const,
    path: "/",
    maxAge: 0,
  };
  response.cookies.set("ns_admin_access", "", cookieOptions);
  response.cookies.set("ns_admin_refresh", "", cookieOptions);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
