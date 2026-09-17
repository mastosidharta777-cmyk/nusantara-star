import { NextRequest, NextResponse } from "next/server";

import {
  buildGoogleAuthorizationUrl,
  createGoogleOAuthState,
  googleCalendarConfigured,
} from "@/lib/google-calendar";
import { verifyAccessToken } from "@/lib/signed-access";

export const runtime = "nodejs";

const COOKIE_NAME = "ns_google_calendar_oauth";

export async function GET(request: NextRequest) {
  try {
    const talentId = request.nextUrl.searchParams.get("talentId") ?? "";
    const token = request.nextUrl.searchParams.get("token") ?? "";
    if (!talentId || !verifyAccessToken(token, "talent_onboarding", talentId)) {
      return NextResponse.json({ error: "Tautan pendaftaran tidak valid atau sudah kedaluwarsa" }, { status: 401 });
    }
    if (!googleCalendarConfigured()) {
      return NextResponse.json({ error: "Google Calendar belum dikonfigurasi oleh Nusantara Star" }, { status: 503 });
    }

    const { state, nonce } = createGoogleOAuthState(talentId);
    const authUrl = buildGoogleAuthorizationUrl({
      origin: request.nextUrl.origin,
      talentId,
      state,
    });
    const response = NextResponse.redirect(authUrl);
    response.cookies.set({
      name: COOKIE_NAME,
      value: Buffer.from(JSON.stringify({ talentId, token, nonce })).toString("base64url"),
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/api/talent-onboarding/google-calendar",
      maxAge: 10 * 60,
    });
    return response;
  } catch (cause) {
    return NextResponse.json({
      error: "Tidak dapat memulai koneksi Google Calendar",
      detail: cause instanceof Error ? cause.message : String(cause),
    }, { status: 500 });
  }
}
