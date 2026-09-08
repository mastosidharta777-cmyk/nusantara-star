import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function getServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) throw new Error("Supabase server environment is not configured");
  return createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const briefId = text(body?.briefId);
    const reason = text(body?.reason);

    if (!briefId) return NextResponse.json({ error: "Brief tidak valid" }, { status: 400 });
    if (!reason) return NextResponse.json({ error: "Alasan promosi fallback wajib diisi" }, { status: 400 });
    if (reason.length > 1000) return NextResponse.json({ error: "Alasan terlalu panjang" }, { status: 400 });

    const supabase = getServerClient();
    const { data, error } = await supabase.rpc("ns_promote_buyer_fallback_v1", {
      p_brief_id: briefId,
      p_reason: reason,
    });

    if (error) {
      const message = error.message || "Promosi fallback gagal";
      const status = message.toLowerCase().includes("not found") ? 404 : 409;
      return NextResponse.json({ error: message }, { status });
    }

    return NextResponse.json({ ok: true, ...(data ?? {}) });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown error";
    console.error("Guarded buyer fallback promotion failed", detail);
    return NextResponse.json({ error: "Promosi fallback gagal", detail }, { status: 500 });
  }
}
