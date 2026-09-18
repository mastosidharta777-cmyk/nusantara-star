import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

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
    const action = cleanString(body?.action);
    if (!bookingId || !action) return NextResponse.json({ error: "Invalid Show Advance payload" }, { status: 400 });

    if (process.env.VERCEL_ENV && request.headers.get("x-ns-admin-verified") !== "1") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = getServerClient();

    if (action === "save") {
      const payload = body?.payload && typeof body.payload === "object" && !Array.isArray(body.payload) ? body.payload : null;
      if (!payload) return NextResponse.json({ error: "Show Advance payload is required" }, { status: 400 });

      const { data, error } = await supabase.rpc("ns_save_booking_advance_v1", {
        p_booking_id: bookingId,
        p_payload: payload,
      });
      if (error) return NextResponse.json({ error: error.message }, { status: 409 });
      const row = Array.isArray(data) ? data[0] : data;
      if (!row) return NextResponse.json({ error: "Show Advance could not be saved" }, { status: 409 });
      return NextResponse.json({ ok: true, advance: row });
    }

    if (action === "confirm") {
      const buyerReference = cleanString(body?.buyerConfirmationReference);
      const talentReference = cleanString(body?.talentConfirmationReference);
      if (!buyerReference || !talentReference) {
        return NextResponse.json({ error: "Buyer and talent confirmation references are required" }, { status: 400 });
      }

      const { data, error } = await supabase.rpc("ns_confirm_booking_advance_v1", {
        p_booking_id: bookingId,
        p_buyer_confirmation_reference: buyerReference,
        p_talent_confirmation_reference: talentReference,
      });
      if (error) return NextResponse.json({ error: error.message }, { status: 409 });
      return NextResponse.json(data ?? { ok: true, status: "confirmed" });
    }

    return NextResponse.json({ error: "Unknown Show Advance action" }, { status: 400 });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown error";
    console.error("Show Advance action failed", detail);
    return NextResponse.json({ error: "Show Advance action failed", detail }, { status: 500 });
  }
}
