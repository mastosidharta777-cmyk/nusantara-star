import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import { verifyAccessToken } from "@/lib/signed-access";

export const runtime = "nodejs";

const INCIDENT_TYPES = new Set([
  "buyer_cancellation",
  "talent_cancellation",
  "postponement",
  "no_show",
  "late_arrival",
  "shortened_performance",
  "technical_failure",
  "payment_dispute",
  "force_majeure",
  "other",
]);

function getServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) throw new Error("Supabase server environment is not configured");
  return createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const bookingId = clean(body?.bookingId);
    const party = body?.party === "buyer" || body?.party === "talent" ? body.party : null;
    const incidentType = clean(body?.incidentType);
    const summary = clean(body?.summary);
    const details = clean(body?.details) || null;
    const token = clean(body?.token);

    if (!bookingId || !party || !INCIDENT_TYPES.has(incidentType) || !summary || !token) {
      return NextResponse.json({ error: "Jenis kejadian dan ringkasan wajib diisi" }, { status: 400 });
    }
    if (summary.length > 300 || (details?.length ?? 0) > 3000) {
      return NextResponse.json({ error: "Ringkasan atau detail terlalu panjang" }, { status: 400 });
    }

    const scope = party === "buyer" ? "buyer_pre_show" : "talent_pre_show";
    if (!verifyAccessToken(token, scope, bookingId)) {
      return NextResponse.json({ error: "Secure link tidak valid atau sudah kedaluwarsa" }, { status: 401 });
    }

    const supabase = getServerClient();
    const { data: booking, error: bookingError } = await supabase
      .from("bookings")
      .select("id,status")
      .eq("id", bookingId)
      .maybeSingle();
    if (bookingError) throw new Error(bookingError.message);
    if (!booking || !["pre_show", "incident"].includes(booking.status)) {
      return NextResponse.json({ error: "Booking tidak berada pada fase operasional aktif" }, { status: 409 });
    }

    const { data, error } = await supabase.rpc("ns_report_incident_v2", {
      p_booking_id: bookingId,
      p_incident_type: incidentType,
      p_summary: summary,
      p_details: details,
      p_reported_by_party: party,
      p_report_source: "signed_link",
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 409 });

    return NextResponse.json(data ?? { ok: true });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error("Party incident report failed", detail);
    return NextResponse.json({ error: "Laporan kejadian gagal disimpan", detail }, { status: 500 });
  }
}
