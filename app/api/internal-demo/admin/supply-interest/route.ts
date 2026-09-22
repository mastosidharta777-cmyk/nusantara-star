import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import { signAccessToken } from "@/lib/signed-access";
import { categoryAllowedForSupply, isSupplyType } from "@/lib/supply-onboarding";

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

function inviteUrl(request: Request, talentId: string) {
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const token = signAccessToken("talent_onboarding", talentId, expiresAt);
  const origin = new URL(request.url).origin;
  return `${origin}/talent-onboarding/${encodeURIComponent(talentId)}?token=${encodeURIComponent(token)}`;
}

export async function POST(request: Request) {
  try {
    if (!ensureAdmin(request)) return NextResponse.json({ error: "Tidak memiliki akses" }, { status: 401 });
    const body = await request.json().catch(() => null);
    const interestId = typeof body?.interestId === "string" ? body.interestId : "";
    const action = body?.action;
    if (!interestId || !["create_invite", "copy_invite", "archive"].includes(action)) {
      return NextResponse.json({ error: "Aksi inbox tidak valid" }, { status: 400 });
    }

    const supabase = getServerClient();
    if (action === "archive") {
      const { data, error } = await supabase.from("supply_interest_submissions").update({ status: "archived" }).eq("id", interestId).eq("status", "new").select("id").maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) return NextResponse.json({ error: "Hanya pendaftaran baru yang dapat diarsipkan" }, { status: 409 });
      return NextResponse.json({ ok: true, status: "archived" });
    }

    if (action === "copy_invite") {
      const { data, error } = await supabase.from("supply_interest_submissions").select("email,supply_type,status,onboarding_talent_id").eq("id", interestId).maybeSingle();
      if (error) throw new Error(error.message);
      if (!data || data.status !== "invited" || !data.onboarding_talent_id || !isSupplyType(data.supply_type)) {
        return NextResponse.json({ error: "Undangan aktif tidak ditemukan" }, { status: 409 });
      }
      return NextResponse.json({ ok: true, email: data.email, supplyType: data.supply_type, url: inviteUrl(request, data.onboarding_talent_id) });
    }

    const category = typeof body?.category === "string" ? body.category.trim() : null;
    const { data, error } = await supabase.rpc("ns_create_supply_interest_invite_v1", {
      p_interest_id: interestId,
      p_talent_category: category,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: error.code === "PGRST202" ? 503 : 409 });
    const result = data as { talent_id?: string; email?: string; supply_type?: string } | null;
    if (!result?.talent_id || !result.email || !isSupplyType(result.supply_type)) {
      return NextResponse.json({ error: "Profil undangan belum dapat dibuat" }, { status: 409 });
    }
    if (result.supply_type === "talent" && !categoryAllowedForSupply(result.supply_type, category)) {
      return NextResponse.json({ error: "Pilih kategori Talent yang valid" }, { status: 400 });
    }
    return NextResponse.json({ ok: true, email: result.email, supplyType: result.supply_type, url: inviteUrl(request, result.talent_id) });
  } catch (error) {
    return NextResponse.json({ error: "Aksi inbox belum dapat diproses", detail: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
