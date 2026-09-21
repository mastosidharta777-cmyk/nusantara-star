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
    const talentId = typeof body?.talentId === "string" ? body.talentId : "";
    const publicVisible = body?.publicVisible;
    if (!talentId || typeof publicVisible !== "boolean") {
      return NextResponse.json({ error: "Aksi publikasi tidak valid" }, { status: 400 });
    }

    const { data, error } = await getServerClient().rpc("ns_set_talent_public_visibility_v1", {
      p_talent_id: talentId,
      p_public_visible: publicVisible,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 409 });
    return NextResponse.json(data ?? { ok: true, public_visible: publicVisible });
  } catch (error) {
    return NextResponse.json({ error: "Gagal mengubah status publik", detail: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
