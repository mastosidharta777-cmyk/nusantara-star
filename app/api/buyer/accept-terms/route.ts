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

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const bookingId = typeof body?.bookingId === "string" ? body.bookingId : "";
    const accessToken = typeof body?.accessToken === "string" ? body.accessToken : "";
    if (!bookingId || !verifyAccessToken(accessToken, "buyer_terms", bookingId)) return NextResponse.json({ error: "Link persetujuan tidak valid atau sudah kedaluwarsa" }, { status: 401 });

    const supabase = getServerClient();
    const { data, error } = await supabase.rpc("ns_accept_buyer_terms_v1", { p_booking_id: bookingId });
    if (error) return NextResponse.json({ error: error.message }, { status: 409 });
    return NextResponse.json({ ok: true, acceptance: data });
  } catch (error) {
    return NextResponse.json({ error: "Persetujuan tidak dapat disimpan", detail: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
