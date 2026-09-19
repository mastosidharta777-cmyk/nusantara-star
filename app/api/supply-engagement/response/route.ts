import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import { verifyAccessToken } from "@/lib/signed-access";

export const runtime = "nodejs";

function getServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase server environment is not configured");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function auth(body: any) {
  const engagementId = typeof body?.engagementId === "string" ? body.engagementId : "";
  const token = typeof body?.token === "string" ? body.token : "";
  return { engagementId, ok: Boolean(engagementId && verifyAccessToken(token, "supply_engagement", engagementId)) };
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const { engagementId, ok } = auth(body);
    if (!ok) return NextResponse.json({ error: "Tautan Work Order tidak valid atau sudah kedaluwarsa" }, { status: 401 });
    const action = body?.action === "confirm" || body?.action === "decline" ? body.action : null;
    const note = typeof body?.note === "string" && body.note.trim() ? body.note.trim().slice(0, 2000) : null;
    if (!action) return NextResponse.json({ error: "Respons tidak dikenal" }, { status: 400 });
    if (action === "decline" && !note) return NextResponse.json({ error: "Alasan belum dapat menerima Work Order wajib diisi" }, { status: 400 });

    const now = new Date().toISOString();
    const updates = action === "confirm"
      ? { status: "confirmed", supplier_confirmed_at: now, supplier_declined_at: null, supplier_response_note: note, updated_at: now }
      : { status: "declined", supplier_confirmed_at: null, supplier_declined_at: now, supplier_response_note: note, updated_at: now };
    const { data, error } = await getServerClient()
      .from("supply_engagements")
      .update(updates)
      .eq("id", engagementId)
      .eq("status", "pending_confirmation")
      .select("id,status,supplier_confirmed_at,supplier_declined_at,supplier_response_note")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return NextResponse.json({ error: "Work Order sudah direspons atau tidak lagi aktif" }, { status: 409 });
    return NextResponse.json({ ok: true, engagement: data });
  } catch (error) {
    return NextResponse.json({ error: "Respons Work Order gagal disimpan", detail: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
