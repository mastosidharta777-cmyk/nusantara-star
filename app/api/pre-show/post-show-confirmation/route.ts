import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import { verifyAccessToken } from "@/lib/signed-access";

export const runtime = "nodejs";

const OUTCOMES = new Set(["performed_as_agreed", "performed_with_issue", "not_performed"]);

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
    const token = clean(body?.token);
    const outcome = clean(body?.outcome);
    const note = clean(body?.note) || null;

    if (!bookingId || !party || !token || !OUTCOMES.has(outcome)) {
      return NextResponse.json({ error: "Data konfirmasi hasil show belum lengkap" }, { status: 400 });
    }
    if (outcome !== "performed_as_agreed" && !note) {
      return NextResponse.json({ error: "Catatan wajib diisi jika show tidak berjalan sesuai kesepakatan" }, { status: 400 });
    }
    if ((note?.length ?? 0) > 2000) {
      return NextResponse.json({ error: "Catatan terlalu panjang" }, { status: 400 });
    }

    const scope = party === "buyer" ? "buyer_pre_show" : "talent_pre_show";
    if (!verifyAccessToken(token, scope, bookingId)) {
      return NextResponse.json({ error: "Secure link tidak valid atau sudah kedaluwarsa" }, { status: 401 });
    }

    const supabase = getServerClient();
    const { data, error } = await supabase.rpc("ns_set_post_show_confirmation_v1", {
      p_booking_id: bookingId,
      p_party: party,
      p_outcome: outcome,
      p_note: note,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 409 });

    return NextResponse.json({ ok: true, confirmation: data });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error("Post-show confirmation failed", detail);
    return NextResponse.json({ error: "Konfirmasi hasil show gagal disimpan", detail }, { status: 500 });
  }
}
