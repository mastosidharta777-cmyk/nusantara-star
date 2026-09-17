import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import { googleCalendarConfigured } from "@/lib/google-calendar";
import {
  CalendarSchemaMissingError,
  calendarsForConnection,
  getTalentCalendarConnection,
  publicCalendar,
  removeGoogleCalendarConnection,
  syncGoogleCalendarAvailability,
} from "@/lib/google-calendar-sync";
import { verifyAccessToken } from "@/lib/signed-access";

export const runtime = "nodejs";

function getServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) throw new Error("Supabase server environment is not configured");
  return createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

function auth(talentId: string, token: string) {
  return Boolean(talentId && verifyAccessToken(token, "talent_onboarding", talentId));
}

function connectionPublic(connection: Awaited<ReturnType<typeof getTalentCalendarConnection>>) {
  if (!connection) return null;
  return {
    calendarId: connection.calendar_id,
    calendarSummary: connection.calendar_summary,
    calendarTimezone: connection.calendar_timezone,
    connectedAt: connection.connected_at,
    lastSyncedAt: connection.last_synced_at,
    lastSyncError: connection.last_sync_error,
  };
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const talentId = url.searchParams.get("talentId") ?? "";
    const token = url.searchParams.get("token") ?? "";
    if (!auth(talentId, token)) return NextResponse.json({ error: "Tautan pendaftaran tidak valid atau sudah kedaluwarsa" }, { status: 401 });

    const configured = googleCalendarConfigured();
    const supabase = getServerClient();
    let connection;
    try {
      connection = await getTalentCalendarConnection(supabase, talentId);
    } catch (cause) {
      if (cause instanceof CalendarSchemaMissingError) {
        return NextResponse.json({ ok: true, configured, schemaReady: false, connected: false, connection: null, calendars: [] });
      }
      throw cause;
    }

    if (!connection) {
      return NextResponse.json({ ok: true, configured, schemaReady: true, connected: false, connection: null, calendars: [] });
    }

    let calendars: ReturnType<typeof publicCalendar>[] = [];
    let liveError: string | null = null;
    if (configured) {
      try {
        calendars = (await calendarsForConnection(connection)).map(publicCalendar);
      } catch (cause) {
        liveError = cause instanceof Error ? cause.message : String(cause);
      }
    }

    return NextResponse.json({
      ok: true,
      configured,
      schemaReady: true,
      connected: true,
      connection: connectionPublic(connection),
      calendars,
      liveError,
    });
  } catch (cause) {
    return NextResponse.json({ error: "Gagal memuat status Google Calendar", detail: cause instanceof Error ? cause.message : String(cause) }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const talentId = typeof body?.talentId === "string" ? body.talentId : "";
    const token = typeof body?.token === "string" ? body.token : "";
    const action = typeof body?.action === "string" ? body.action : "";
    if (!auth(talentId, token)) return NextResponse.json({ error: "Tautan pendaftaran tidak valid atau sudah kedaluwarsa" }, { status: 401 });
    if (!googleCalendarConfigured()) return NextResponse.json({ error: "Google Calendar belum dikonfigurasi oleh Nusantara Star" }, { status: 503 });

    const supabase = getServerClient();
    let connection;
    try {
      connection = await getTalentCalendarConnection(supabase, talentId);
    } catch (cause) {
      if (cause instanceof CalendarSchemaMissingError) return NextResponse.json({ error: "Google Calendar database belum disiapkan" }, { status: 503 });
      throw cause;
    }
    if (!connection) return NextResponse.json({ error: "Google Calendar belum terhubung" }, { status: 409 });

    if (action === "sync") {
      const result = await syncGoogleCalendarAvailability(supabase, connection);
      return NextResponse.json({ ok: true, action, ...result });
    }

    if (action === "select") {
      const calendarId = typeof body?.calendarId === "string" ? body.calendarId : "";
      if (!calendarId) return NextResponse.json({ error: "Pilih kalender terlebih dahulu" }, { status: 400 });
      const calendars = await calendarsForConnection(connection);
      const selected = calendars.find((item) => item.id === calendarId);
      if (!selected) return NextResponse.json({ error: "Kalender tidak ditemukan atau tidak dapat dibaca" }, { status: 400 });

      const now = new Date().toISOString();
      const { data: updatedData, error: updateError } = await supabase
        .from("talent_calendar_connections")
        .update({
          calendar_id: selected.id,
          calendar_summary: selected.summary || "Google Calendar",
          calendar_timezone: selected.timeZone || "Asia/Jakarta",
          last_sync_error: null,
          updated_at: now,
        })
        .eq("id", connection.id)
        .select("id,talent_id,provider,calendar_id,calendar_summary,calendar_timezone,refresh_token_encrypted,scopes,connected_at,last_synced_at,last_sync_error,updated_at")
        .single();
      if (updateError) throw new Error(updateError.message);
      const result = await syncGoogleCalendarAvailability(supabase, updatedData);
      return NextResponse.json({ ok: true, action, selected: publicCalendar(selected), ...result });
    }

    if (action === "disconnect") {
      await removeGoogleCalendarConnection(supabase, connection);
      return NextResponse.json({ ok: true, action });
    }

    return NextResponse.json({ error: "Aksi Google Calendar tidak valid" }, { status: 400 });
  } catch (cause) {
    return NextResponse.json({ error: "Google Calendar belum dapat diperbarui", detail: cause instanceof Error ? cause.message : String(cause) }, { status: 500 });
  }
}
