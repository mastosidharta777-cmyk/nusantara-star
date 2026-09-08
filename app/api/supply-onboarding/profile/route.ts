import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import { verifyAccessToken } from "@/lib/signed-access";
import { talentOnboardingEditConflict } from "@/lib/talent-onboarding-state";

export const runtime = "nodejs";

type NonTalentSupplyType = "professional" | "production_partner";

function getServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase server environment is not configured");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
function textArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean))).slice(0, 30);
}
function optionalHttpUrl(value: unknown) {
  const raw = text(value);
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}
function isNonTalent(value: unknown): value is NonTalentSupplyType {
  return value === "professional" || value === "production_partner";
}
function auth(body: any) {
  const supplyId = typeof body?.supplyId === "string" ? body.supplyId : "";
  const token = typeof body?.token === "string" ? body.token : "";
  return { supplyId, ok: Boolean(supplyId && verifyAccessToken(token, "talent_onboarding", supplyId)) };
}
async function loadSupply(s: ReturnType<typeof getServerClient>, supplyId: string) {
  const { data, error } = await s
    .from("talents")
    .select("id,supply_type,name,category,base_city,service_cities,performance_formats,capability_tags,event_types,bio,manager_name,manager_email,manager_whatsapp,portfolio_url,booking_limitations,onboarding_status,status")
    .eq("id", supplyId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const supplyId = url.searchParams.get("supplyId") ?? "";
    const token = url.searchParams.get("token") ?? "";
    if (!supplyId || !verifyAccessToken(token, "talent_onboarding", supplyId)) {
      return NextResponse.json({ error: "Tautan pendaftaran tidak valid atau sudah kedaluwarsa" }, { status: 401 });
    }
    const s = getServerClient();
    const [{ data: supply, error: supplyError }, { data: submission, error: submissionError }] = await Promise.all([
      s.from("talents").select("id,supply_type,name,category,base_city,service_cities,performance_formats,capability_tags,event_types,bio,manager_name,manager_email,manager_whatsapp,portfolio_url,booking_limitations,onboarding_status,status").eq("id", supplyId).maybeSingle(),
      s.from("talent_profile_submissions").select("*").eq("talent_id", supplyId).maybeSingle(),
    ]);
    if (supplyError) throw new Error(supplyError.message);
    if (submissionError) throw new Error(submissionError.message);
    if (!supply || !isNonTalent(supply.supply_type) || supply.status === "inactive") {
      return NextResponse.json({ error: "Profil supply tidak ditemukan" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, supply, submission });
  } catch (error) {
    return NextResponse.json({ error: "Gagal memuat pendaftaran", detail: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const { supplyId, ok } = auth(body);
    if (!ok) return NextResponse.json({ error: "Tautan pendaftaran tidak valid atau sudah kedaluwarsa" }, { status: 401 });
    const s = getServerClient();
    const supply = await loadSupply(s, supplyId);
    if (!supply || !isNonTalent(supply.supply_type) || supply.status === "inactive") return NextResponse.json({ error: "Profil supply tidak ditemukan" }, { status: 404 });
    const editConflict = await talentOnboardingEditConflict(s, supplyId);
    if (editConflict) return editConflict;

    const portfolioUrl = optionalHttpUrl(body?.portfolioUrl);
    if (portfolioUrl === undefined) return NextResponse.json({ error: "Link portofolio utama tidak valid" }, { status: 400 });
    const bookingLimitations = text(body?.bookingLimitations);
    if (bookingLimitations && bookingLimitations.length > 2000) return NextResponse.json({ error: "Batasan booking maksimal 2.000 karakter" }, { status: 400 });

    const payload = {
      talent_id: supplyId,
      name: text(body?.name) ?? "",
      category: supply.category,
      base_city: text(body?.baseCity),
      service_cities: textArray(body?.serviceCities),
      performance_formats: textArray(body?.serviceFormats),
      capability_tags: textArray(body?.capabilityTags),
      event_types: textArray(body?.eventTypes),
      genres: [],
      music_styles: [],
      vibe_tags: [],
      bio: text(body?.bio),
      booking_limitations: bookingLimitations,
      manager_name: text(body?.managerName),
      manager_email: text(body?.managerEmail),
      manager_whatsapp: text(body?.managerWhatsapp),
      portfolio_url: portfolioUrl,
      act_type: null,
      willing_to_perform_covers: null,
      accepts_song_requests: null,
      sample_repertoire: [],
      repertoire_genres: [],
      repertoire_styles: [],
      repertoire_eras: [],
      repertoire_ai_status: "not_applicable",
      status: "draft",
      rejection_note: null,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await s.from("talent_profile_submissions").upsert(payload, { onConflict: "talent_id" }).select("*").single();
    if (error) throw new Error(error.message);
    const { error: updateError } = await s.from("talents").update({ onboarding_status: "in_progress", updated_at: new Date().toISOString() }).eq("id", supplyId).neq("onboarding_status", "approved");
    if (updateError) throw new Error(updateError.message);
    return NextResponse.json({ ok: true, submission: data });
  } catch (error) {
    return NextResponse.json({ error: "Gagal menyimpan profil", detail: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const { supplyId, ok } = auth(body);
    if (!ok) return NextResponse.json({ error: "Tautan pendaftaran tidak valid atau sudah kedaluwarsa" }, { status: 401 });
    const s = getServerClient();
    const supply = await loadSupply(s, supplyId);
    if (!supply || !isNonTalent(supply.supply_type) || supply.status === "inactive") return NextResponse.json({ error: "Profil supply tidak ditemukan" }, { status: 404 });
    const { data: submission, error } = await s.from("talent_profile_submissions").select("name,category,base_city,performance_formats,capability_tags,bio,manager_name,manager_email,manager_whatsapp,portfolio_url,status").eq("talent_id", supplyId).maybeSingle();
    if (error) throw new Error(error.message);
    if (!submission) return NextResponse.json({ error: "Simpan profil terlebih dahulu" }, { status: 409 });
    if (submission.status === "submitted") return NextResponse.json({ ok: true, alreadySubmitted: true });
    if (submission.status === "approved") return NextResponse.json({ error: "Profil sudah disetujui dan tidak dapat dikirim ulang dari portal onboarding" }, { status: 409 });

    const missing: string[] = [];
    if (!text(submission.name)) missing.push(supply.supply_type === "production_partner" ? "Nama perusahaan / brand" : "Nama profesional");
    if (!text(submission.category)) missing.push("Kategori");
    if (!text(submission.base_city)) missing.push("Kota basis");
    if (!text(submission.bio)) missing.push("Profil singkat");
    if (!text(submission.manager_name)) missing.push("PIC utama");
    if (!text(submission.manager_email) && !text(submission.manager_whatsapp)) missing.push("Kontak PIC (WhatsApp atau email)");
    if (!text(submission.portfolio_url)) missing.push("Link portofolio utama");
    if (!textArray(submission.capability_tags).length && !textArray(submission.performance_formats).length) missing.push("Minimal satu layanan / kapabilitas");
    if (missing.length) return NextResponse.json({ error: `Lengkapi: ${missing.join(", ")}`, missingFields: missing }, { status: 409 });

    const { data, error: rpcError } = await s.rpc("ns_submit_supply_profile_v1", { p_talent_id: supplyId });
    if (rpcError) throw new Error(rpcError.message);
    return NextResponse.json(data ?? { ok: true });
  } catch (error) {
    return NextResponse.json({ error: "Gagal mengirim profil untuk ditinjau", detail: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const { supplyId, ok } = auth(body);
    if (!ok) return NextResponse.json({ error: "Tautan pendaftaran tidak valid atau sudah kedaluwarsa" }, { status: 401 });
    if (body?.action !== "reopen") return NextResponse.json({ error: "Aksi tidak dikenal" }, { status: 400 });
    const s = getServerClient();
    const supply = await loadSupply(s, supplyId);
    if (!supply || !isNonTalent(supply.supply_type)) return NextResponse.json({ error: "Profil supply tidak ditemukan" }, { status: 404 });
    const { data, error } = await s.rpc("ns_reopen_supply_profile_v1", { p_talent_id: supplyId });
    if (error) return NextResponse.json({ error: error.message }, { status: 409 });
    return NextResponse.json(data ?? { ok: true, status: "draft" });
  } catch (error) {
    return NextResponse.json({ error: "Profil belum dapat dibuka kembali untuk diedit", detail: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
