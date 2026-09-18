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

function cleanString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const bookingId = cleanString(body?.bookingId);
    const party = body?.party === "buyer" || body?.party === "talent" ? body.party : null;
    const action = cleanString(body?.action);
    const token = cleanString(body?.token);

    if (!bookingId || !party || !action || !token) {
      return NextResponse.json({ error: "Invalid Show Advance request" }, { status: 400 });
    }

    const scope = party === "buyer" ? "buyer_advance" : "talent_advance";
    if (!verifyAccessToken(token, scope, bookingId)) {
      return NextResponse.json({ error: "Secure link is invalid or expired" }, { status: 401 });
    }

    const supabase = getServerClient();

    if (action === "save") {
      const payload = body?.payload && typeof body.payload === "object" && !Array.isArray(body.payload) ? body.payload : null;
      if (!payload) return NextResponse.json({ error: "Show Advance payload is required" }, { status: 400 });

      const { data, error } = await supabase.rpc("ns_save_booking_advance_party_v2", {
        p_booking_id: bookingId,
        p_party: party,
        p_payload: payload,
      });
      if (error) return NextResponse.json({ error: error.message }, { status: 409 });
      const row = Array.isArray(data) ? data[0] : data;
      if (!row) return NextResponse.json({ error: "Show Advance could not be saved" }, { status: 409 });
      return NextResponse.json({ ok: true, advance: row, revisionNo: row.revision_no });
    }

    if (action === "confirm") {
      const { data, error } = await supabase.rpc("ns_confirm_booking_advance_party_v2", {
        p_booking_id: bookingId,
        p_party: party,
      });
      if (error) return NextResponse.json({ error: error.message }, { status: 409 });
      return NextResponse.json(data ?? { ok: true });
    }

    return NextResponse.json({ error: "Unknown Show Advance action" }, { status: 400 });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown error";
    console.error("Collaborative Show Advance action failed", detail);
    return NextResponse.json({ error: "Show Advance action failed", detail }, { status: 500 });
  }
}
