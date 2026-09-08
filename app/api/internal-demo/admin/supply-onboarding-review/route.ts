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
function isNonTalent(value: unknown) {
  return value === "professional" || value === "production_partner";
}

export async function GET(request: Request) {
  try {
    if (!ensureAdmin(request)) return NextResponse.json({ error: "Tidak memiliki akses" }, { status: 401 });
    const supplyId = new URL(request.url).searchParams.get("supplyId") ?? "";
    if (!supplyId) return NextResponse.json({ error: "Profil supply wajib dipilih" }, { status: 400 });
    const s = getServerClient();
    const [{ data: supply, error: supplyError }, { data: submission, error: submissionError }] = await Promise.all([
      s.from("talents").select("id,supply_type,onboarding_status,public_visible,status").eq("id", supplyId).maybeSingle(),
      s.from("talent_profile_submissions").select("*").eq("talent_id", supplyId).maybeSingle(),
    ]);
    if (supplyError) throw new Error(supplyError.message);
    if (submissionError) throw new Error(submissionError.message);
    if (!supply || !isNonTalent(supply.supply_type)) return NextResponse.json({ error: "Profil supply tidak ditemukan" }, { status: 404 });
    return NextResponse.json({ ok: true, supply, submission });
  } catch (error) {
    return NextResponse.json({ error: "Gagal memuat peninjauan supply", detail: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    if (!ensureAdmin(request)) return NextResponse.json({ error: "Tidak memiliki akses" }, { status: 401 });
    const body = await request.json().catch(() => null);
    const supplyId = typeof body?.supplyId === "string" ? body.supplyId : "";
    const action = typeof body?.action === "string" ? body.action : "";
    if (!supplyId) return NextResponse.json({ error: "Profil supply wajib dipilih" }, { status: 400 });
    const s = getServerClient();
    const { data: supply, error: supplyError } = await s.from("talents").select("id,supply_type").eq("id", supplyId).maybeSingle();
    if (supplyError) throw new Error(supplyError.message);
    if (!supply || !isNonTalent(supply.supply_type)) return NextResponse.json({ error: "Profil supply tidak ditemukan" }, { status: 404 });

    if (action === "reject_profile") {
      const rejectionNote = typeof body?.rejectionNote === "string" && body.rejectionNote.trim() ? body.rejectionNote.trim() : "Perlu revisi";
      const { data, error } = await s.rpc("ns_reject_supply_profile_v1", { p_talent_id: supplyId, p_rejection_note: rejectionNote });
      if (error) return NextResponse.json({ error: error.message }, { status: 409 });
      return NextResponse.json(data ?? { ok: true });
    }
    if (action === "approve_profile") {
      const { data, error } = await s.rpc("ns_approve_supply_profile_v1", { p_talent_id: supplyId });
      if (error) return NextResponse.json({ error: error.message }, { status: 409 });
      return NextResponse.json(data ?? { ok: true });
    }
    return NextResponse.json({ error: "Aksi tidak dikenal" }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: "Peninjauan supply gagal", detail: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
