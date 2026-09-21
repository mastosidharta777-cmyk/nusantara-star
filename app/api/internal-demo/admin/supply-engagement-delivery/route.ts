import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function getServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase server environment is not configured");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function ensureAdmin(request: Request) {
  return process.env.VERCEL_ENV !== "production" || request.headers.get("x-ns-admin-verified") === "1";
}

export async function PATCH(request: Request) {
  try {
    if (!ensureAdmin(request)) return NextResponse.json({ error: "Tidak memiliki akses" }, { status: 401 });
    const body = await request.json().catch(() => null);
    const engagementId = typeof body?.engagementId === "string" ? body.engagementId : "";
    const action = body?.action === "start" || body?.action === "request_revision" || body?.action === "accept" ? body.action : null;
    const note = typeof body?.note === "string" && body.note.trim() ? body.note.trim().slice(0, 4000) : null;
    if (!engagementId || !action) return NextResponse.json({ error: "Aksi Work Order tidak valid" }, { status: 400 });
    if (action === "request_revision" && !note) return NextResponse.json({ error: "Instruksi revisi wajib diisi" }, { status: 400 });

    const { data, error } = await getServerClient().rpc("ns_admin_delivery_action_v1", {
      p_engagement_id: engagementId,
      p_action: action,
      p_note: note,
    });
    if (error) return NextResponse.json({ error: "Aksi Work Order tidak dapat disimpan", detail: error.message }, { status: 409 });
    const engagement = Array.isArray(data) ? data[0] : data;
    if (!engagement?.id) throw new Error("Work Order tidak ditemukan setelah aksi");
    return NextResponse.json({ ok: true, engagement });
  } catch (error) {
    return NextResponse.json({ error: "Aksi Work Order gagal disimpan", detail: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
