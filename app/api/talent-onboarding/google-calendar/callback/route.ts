import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

import {
  encryptGoogleRefreshToken,
  exchangeGoogleAuthorizationCode,
  listGoogleCalendars,
  verifyGoogleOAuthState,
} from "@/lib/google-calendar";
import {
  CalendarSchemaMissingError,
  getTalentCalendarConnection,
  syncGoogleCalendarAvailability,
  type TalentCalendarConnection,
} from "@/lib/google-calendar-sync";
import { verifyAccessToken } from "@/lib/signed-access";

export const runtime = "nodejs";

const COOKIE_NAME = "ns_google_calendar_oauth";
type OAuthCookie = { talentId: string; token: string; nonce: string };

function getServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) throw new Error("Supabase server environment is not configured");
  return createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

function readCookie(request: NextRequest): OAuthCookie | null {
  const raw = request.cookies.get(COOKIE_NAME)?.value;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as Partial<OAuthCookie>;
    if (typeof parsed.talentId !== "string" || typeof parsed.token !== "string" || typeof parsed.nonce !== "string") return null;
    if (!parsed.talentId || !parsed.token || !parsed.nonce) return null;
    return { talentId: parsed.talentId, token: parsed.token, nonce: parsed.nonce };
  } catch {
    return null;
  }
}

function onboardingRedirect(request: NextRequest, talentId: string, token: string, result: string) {
  const target = new URL(`/talent-onboarding/${encodeURIComponent(talentId)}`, request.nextUrl.origin);
  target.searchParams.set("token", token);
  target.searchParams.set("calendar", result);
  const response = NextResponse.redirect(target);
  response.cookies.set({
    name: COOKIE_NAME,
    value: "",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/talent-onboarding/google-calendar",
    maxAge: 0,
  });
  return response;
}

export async function GET(request: NextRequest) {
  const cookie = readCookie(request);
  const state = verifyGoogleOAuthState(request.nextUrl.searchParams.get("state"));

  if (!cookie || !state || cookie.talentId !== state.talentId || cookie.nonce !== state.nonce) {
    return NextResponse.json({ error: "Sesi koneksi Google Calendar tidak valid atau sudah kedaluwarsa" }, { status: 400 });
  }
  if (!verifyAccessToken(cookie.token, "talent_onboarding", cookie.talentId)) {
    return NextResponse.json({ error: "Tautan pendaftaran tidak valid atau sudah kedaluwarsa" }, { status: 401 });
  }

  if (request.nextUrl.searchParams.get("error")) {
    return onboardingRedirect(request, cookie.talentId, cookie.token, "cancelled");
  }

  const code = request.nextUrl.searchParams.get("code");
  if (!code) return onboardingRedirect(request, cookie.talentId, cookie.token, "error");

  try {
    const supabase = getServerClient();
    let existing: TalentCalendarConnection | null = null;
    try {
      existing = await getTalentCalendarConnection(supabase, cookie.talentId);
    } catch (cause) {
      if (cause instanceof CalendarSchemaMissingError) {
        return onboardingRedirect(request, cookie.talentId, cookie.token, "setup_required");
      }
      throw cause;
    }

    const oauthToken = await exchangeGoogleAuthorizationCode(code, request.nextUrl.origin);
    const calendars = await listGoogleCalendars(oauthToken.access_token!);
    if (!calendars.length) throw new Error("Tidak ada Google Calendar yang dapat dibaca");

    const selected = calendars.find((item) => item.id === existing?.calendar_id)
      ?? calendars.find((item) => item.primary)
      ?? calendars.find((item) => item.selected)
      ?? calendars[0];

    const refreshTokenEncrypted = oauthToken.refresh_token
      ? encryptGoogleRefreshToken(oauthToken.refresh_token)
      : existing?.refresh_token_encrypted;
    if (!refreshTokenEncrypted) throw new Error("Google tidak memberikan refresh token. Hubungkan ulang dan izinkan akses kalender.");

    const now = new Date().toISOString();
    const scopes = oauthToken.scope?.split(/\s+/).filter(Boolean) ?? [];
    const { data: connectionData, error: connectionError } = await supabase
      .from("talent_calendar_connections")
      .upsert({
        talent_id: cookie.talentId,
        provider: "google",
        calendar_id: selected.id,
        calendar_summary: selected.summary || "Google Calendar",
        calendar_timezone: selected.timeZone || "Asia/Jakarta",
        refresh_token_encrypted: refreshTokenEncrypted,
        scopes,
        connected_at: now,
        last_sync_error: null,
        updated_at: now,
      }, { onConflict: "talent_id,provider" })
      .select("id,talent_id,provider,calendar_id,calendar_summary,calendar_timezone,refresh_token_encrypted,scopes,connected_at,last_synced_at,last_sync_error,updated_at")
      .single();
    if (connectionError) throw new Error(connectionError.message);

    await syncGoogleCalendarAvailability(supabase, connectionData as TalentCalendarConnection);
    return onboardingRedirect(request, cookie.talentId, cookie.token, "connected");
  } catch (cause) {
    console.error("Google Calendar callback failed", cause);
    return onboardingRedirect(request, cookie.talentId, cookie.token, "error");
  }
}
