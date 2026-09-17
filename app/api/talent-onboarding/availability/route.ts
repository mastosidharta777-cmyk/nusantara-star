import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

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

function validDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T00:00:00Z`).getTime());
}

const allowedStatuses = new Set(["available", "tentative", "unavailable", "unknown"]);

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const talentId = url.searchParams.get("talentId") ?? "";
    const token = url.searchParams.get("token") ?? "";
    const from = url.searchParams.get("from") ?? "";
    const to = url.searchParams.get("to") ?? "";

    if (!auth(talentId, token)) return NextResponse.json({ error: "Tautan pendaftaran tidak valid atau sudah kedaluwarsa" }, { status: 401 });
    if (!validDate(from) || !validDate(to) || from > to) return NextResponse.json({ error: "Rentang tanggal tidak valid" }, { status: 400 });

    const supabase = getServerClient();
    const [{ data: rows, error }, { data: talent, error: talentError }] = await Promise.all([
      supabase
        .from("talent_availability")
        .select("event_date,status,notes,updated_at")
        .eq("talent_id", talentId)
        .gte("event_date", from)
        .lte("event_date", to)
        .order("event_date"),
      supabase.from("talents").select("last_calendar_updated_at").eq("id", talentId).maybeSingle(),
    ]);

    if (error) throw new Error(error.message);
    if (talentError) throw new Error(talentError.message);

    return NextResponse.json({ ok: true, availability: rows ?? [], lastCalendarUpdatedAt: talent?.last_calendar_updated_at ?? null });
  } catch (error) {
    return NextResponse.json({ error: "Gagal memuat kalender ketersediaan", detail: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const talentId = typeof body?.talentId === "string" ? body.talentId : "";
    const token = typeof body?.token === "string" ? body.token : "";
    const eventDate = typeof body?.eventDate === "string" ? body.eventDate : "";
    const status = typeof body?.status === "string" ? body.status : "";

    if (!auth(talentId, token)) return NextResponse.json({ error: "Tautan pendaftaran tidak valid atau sudah kedaluwarsa" }, { status: 401 });
    if (!validDate(eventDate)) return NextResponse.json({ error: "Tanggal tidak valid" }, { status: 400 });
    if (!allowedStatuses.has(status)) return NextResponse.json({ error: "Status ketersediaan tidak valid" }, { status: 400 });

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const selected = new Date(`${eventDate}T00:00:00Z`);
    if (selected.getTime() < today.getTime()) return NextResponse.json({ error: "Tanggal yang sudah lewat tidak dapat diubah" }, { status: 400 });

    const supabase = getServerClient();
    const now = new Date().toISOString();

    if (status === "unknown") {
      // "Belum ditandai" clears the explicit override. A future Google sync may mark it tentative again if Google reports busy.
      const { error } = await supabase
        .from("talent_availability")
        .delete()
        .eq("talent_id", talentId)
        .eq("event_date", eventDate);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabase.from("talent_availability").upsert(
        {
          talent_id: talentId,
          event_date: eventDate,
          status,
          notes: "Manual override by talent/manager from onboarding availability calendar",
          updated_at: now,
        },
        { onConflict: "talent_id,event_date" },
      );
      if (error) throw new Error(error.message);
    }

    const { error: talentError } = await supabase.from("talents").update({ last_calendar_updated_at: now, updated_at: now }).eq("id", talentId);
    if (talentError) throw new Error(talentError.message);

    return NextResponse.json({ ok: true, eventDate, status, lastCalendarUpdatedAt: now });
  } catch (error) {
    return NextResponse.json({ error: "Gagal menyimpan status ketersediaan", detail: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
