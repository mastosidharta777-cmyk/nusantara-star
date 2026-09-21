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

function isDeliveryUrl(value: string | null) {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const engagementId = typeof body?.engagementId === "string" ? body.engagementId : "";
    const token = typeof body?.token === "string" ? body.token : "";
    if (!engagementId || !verifyAccessToken(token, "supply_engagement", engagementId)) {
      return NextResponse.json({ error: "Tautan Work Order tidak valid atau sudah kedaluwarsa" }, { status: 401 });
    }

    const action = body?.action === "start" || body?.action === "submit_delivery" ? body.action : null;
    const note = typeof body?.note === "string" && body.note.trim() ? body.note.trim().slice(0, 4000) : null;
    const deliveryUrl = typeof body?.deliveryUrl === "string" && body.deliveryUrl.trim() ? body.deliveryUrl.trim().slice(0, 2000) : null;
    if (!action) return NextResponse.json({ error: "Aksi delivery tidak dikenal" }, { status: 400 });
    if (action === "submit_delivery" && !isDeliveryUrl(deliveryUrl)) {
      return NextResponse.json({ error: "Masukkan link output yang valid (http:// atau https://)" }, { status: 400 });
    }

    const { data, error } = await getServerClient().rpc("ns_supplier_delivery_action_v1", {
      p_engagement_id: engagementId,
      p_action: action,
      p_note: note,
      p_delivery_url: deliveryUrl,
    });
    if (error) return NextResponse.json({ error: "Aksi delivery tidak dapat disimpan", detail: error.message }, { status: 409 });
    const engagement = Array.isArray(data) ? data[0] : data;
    if (!engagement?.id) throw new Error("Work Order tidak ditemukan setelah aksi delivery");
    return NextResponse.json({ ok: true, engagement });
  } catch (error) {
    return NextResponse.json({ error: "Aksi delivery gagal disimpan", detail: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
