import type { SupabaseClient } from "@supabase/supabase-js";

import {
  GOOGLE_AVAILABILITY_NOTE_PREFIX,
  busyIntervalsToDates,
  decryptGoogleRefreshToken,
  defaultGoogleSyncWindow,
  getGoogleFreeBusy,
  listGoogleCalendars,
  refreshGoogleAccessToken,
  type GoogleCalendarListItem,
} from "@/lib/google-calendar";

export type TalentCalendarConnection = {
  id: string;
  talent_id: string;
  provider: "google";
  calendar_id: string;
  calendar_summary: string | null;
  calendar_timezone: string | null;
  refresh_token_encrypted: string;
  scopes: string[] | null;
  connected_at: string;
  last_synced_at: string | null;
  last_sync_error: string | null;
  updated_at: string;
};

type AvailabilityRow = {
  event_date: string;
  status: string;
  notes: string | null;
};

export class CalendarSchemaMissingError extends Error {
  constructor() {
    super("Google Calendar database schema is not installed");
    this.name = "CalendarSchemaMissingError";
  }
}

function schemaMissing(error: { code?: string; message?: string } | null) {
  return error?.code === "42P01" || Boolean(error?.message?.includes("talent_calendar_connections"));
}

export async function getTalentCalendarConnection(supabase: SupabaseClient, talentId: string) {
  const { data, error } = await supabase
    .from("talent_calendar_connections")
    .select("id,talent_id,provider,calendar_id,calendar_summary,calendar_timezone,refresh_token_encrypted,scopes,connected_at,last_synced_at,last_sync_error,updated_at")
    .eq("talent_id", talentId)
    .eq("provider", "google")
    .maybeSingle();

  if (schemaMissing(error)) throw new CalendarSchemaMissingError();
  if (error) throw new Error(error.message);
  return data as TalentCalendarConnection | null;
}

export async function accessTokenForConnection(connection: TalentCalendarConnection) {
  const refreshToken = decryptGoogleRefreshToken(connection.refresh_token_encrypted);
  const token = await refreshGoogleAccessToken(refreshToken);
  if (!token.access_token) throw new Error("Google access token tidak tersedia");
  return token.access_token;
}

export async function calendarsForConnection(connection: TalentCalendarConnection) {
  const accessToken = await accessTokenForConnection(connection);
  return listGoogleCalendars(accessToken);
}

export function publicCalendar(item: GoogleCalendarListItem) {
  return {
    id: item.id,
    summary: item.summary || "Google Calendar",
    primary: Boolean(item.primary),
    selected: Boolean(item.selected),
    timeZone: item.timeZone || null,
  };
}

export async function syncGoogleCalendarAvailability(supabase: SupabaseClient, connection: TalentCalendarConnection) {
  const now = new Date().toISOString();
  try {
    const accessToken = await accessTokenForConnection(connection);
    const window = defaultGoogleSyncWindow();
    const timezone = connection.calendar_timezone || "Asia/Jakarta";
    const intervals = await getGoogleFreeBusy({
      accessToken,
      calendarId: connection.calendar_id,
      timeMin: window.timeMin,
      timeMax: window.timeMax,
      timeZone: timezone,
    });
    const busyDates = busyIntervalsToDates(intervals, timezone);
    const busySet = new Set(busyDates);

    const { data: existingData, error: existingError } = await supabase
      .from("talent_availability")
      .select("event_date,status,notes")
      .eq("talent_id", connection.talent_id)
      .gte("event_date", window.fromDate)
      .lte("event_date", window.toDate);
    if (existingError) throw new Error(existingError.message);

    const existing = (existingData ?? []) as AvailabilityRow[];
    const existingByDate = new Map(existing.map((row) => [row.event_date, row]));
    const isGoogleOwned = (row: AvailabilityRow) => row.notes?.startsWith(GOOGLE_AVAILABILITY_NOTE_PREFIX) === true;

    // Manual rows always win. Google busy creates/updates only Google-owned or empty dates.
    const upserts = busyDates
      .filter((date) => {
        const row = existingByDate.get(date);
        return !row || isGoogleOwned(row);
      })
      .map((eventDate) => ({
        talent_id: connection.talent_id,
        event_date: eventDate,
        status: "tentative",
        notes: `${GOOGLE_AVAILABILITY_NOTE_PREFIX} • calendar:${connection.calendar_id}`,
        updated_at: now,
      }));

    if (upserts.length) {
      const { error: upsertError } = await supabase
        .from("talent_availability")
        .upsert(upserts, { onConflict: "talent_id,event_date" });
      if (upsertError) throw new Error(upsertError.message);
    }

    // Remove only stale rows that were previously imported by Google; never touch manual rows.
    const staleGoogleDates = existing
      .filter((row) => isGoogleOwned(row) && !busySet.has(row.event_date))
      .map((row) => row.event_date);
    if (staleGoogleDates.length) {
      const { error: deleteError } = await supabase
        .from("talent_availability")
        .delete()
        .eq("talent_id", connection.talent_id)
        .in("event_date", staleGoogleDates)
        .like("notes", `${GOOGLE_AVAILABILITY_NOTE_PREFIX}%`);
      if (deleteError) throw new Error(deleteError.message);
    }

    const [{ error: connectionError }, { error: talentError }] = await Promise.all([
      supabase
        .from("talent_calendar_connections")
        .update({ last_synced_at: now, last_sync_error: null, updated_at: now })
        .eq("id", connection.id),
      supabase
        .from("talents")
        .update({ last_calendar_updated_at: now, updated_at: now })
        .eq("id", connection.talent_id),
    ]);
    if (connectionError) throw new Error(connectionError.message);
    if (talentError) throw new Error(talentError.message);

    return {
      lastSyncedAt: now,
      busyDatesImported: upserts.length,
      staleDatesRemoved: staleGoogleDates.length,
      manualOverridesPreserved: busyDates.filter((date) => {
        const row = existingByDate.get(date);
        return Boolean(row && !isGoogleOwned(row));
      }).length,
    };
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    await supabase
      .from("talent_calendar_connections")
      .update({ last_sync_error: message.slice(0, 1000), updated_at: now })
      .eq("id", connection.id)
      .then(() => undefined, () => undefined);
    throw cause;
  }
}

export async function removeGoogleCalendarConnection(supabase: SupabaseClient, connection: TalentCalendarConnection) {
  const now = new Date().toISOString();
  const { error: availabilityError } = await supabase
    .from("talent_availability")
    .delete()
    .eq("talent_id", connection.talent_id)
    .like("notes", `${GOOGLE_AVAILABILITY_NOTE_PREFIX}%`);
  if (availabilityError) throw new Error(availabilityError.message);

  const { error: connectionError } = await supabase
    .from("talent_calendar_connections")
    .delete()
    .eq("id", connection.id);
  if (connectionError) throw new Error(connectionError.message);

  const { error: talentError } = await supabase
    .from("talents")
    .update({ last_calendar_updated_at: now, updated_at: now })
    .eq("id", connection.talent_id);
  if (talentError) throw new Error(talentError.message);
}
