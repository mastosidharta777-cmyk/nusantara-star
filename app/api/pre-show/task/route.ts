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
    const itemId = cleanString(body?.itemId);
    const party = body?.party === "buyer" || body?.party === "talent" ? body.party : null;
    const response = body?.response === "done" || body?.response === "not_applicable" ? body.response : null;
    const note = cleanString(body?.note) || null;
    const token = cleanString(body?.token);

    if (!bookingId || !itemId || !party || !response || !token) {
      return NextResponse.json({ error: "Invalid pre-show task request" }, { status: 400 });
    }

    const scope = party === "buyer" ? "buyer_pre_show" : "talent_pre_show";
    if (!verifyAccessToken(token, scope, bookingId)) {
      return NextResponse.json({ error: "Secure link is invalid or expired" }, { status: 401 });
    }

    const supabase = getServerClient();
    const { data, error } = await supabase.rpc("ns_set_pre_show_task_party_v1", {
      p_booking_id: bookingId,
      p_item_id: itemId,
      p_party: party,
      p_response: response,
      p_note: note,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 409 });

    return NextResponse.json(data ?? { ok: true });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown error";
    console.error("Pre-show task update failed", detail);
    return NextResponse.json({ error: "Pre-show task update failed", detail }, { status: 500 });
  }
}
