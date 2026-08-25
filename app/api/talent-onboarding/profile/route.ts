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

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function textArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean).slice(0, 20);
}

function auth(body: any) {
  const talentId = typeof body?.talentId === "string" ? body.talentId : "";
  const token = typeof body?.token === "string" ? body.token : "";
  return { talentId, token, ok: Boolean(talentId && verifyAccessToken(token, "talent_onboarding", talentId)) };
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const talentId = url.searchParams.get("talentId") ?? "";
    const token = url.searchParams.get("token") ?? "";
    if (!talentId || !verifyAccessToken(token, "talent_onboarding", talentId)) return NextResponse.json({ error: "Invalid or expired onboarding link" }, { status: 401 });

    const supabase = getServerClient();
    const [{ data: talent, error: talentError }, { data: submission, error: submissionError }, { data: assets, error: assetsError }] = await Promise.all([
      supabase.from("talents").select("id,name,category,base_city,genres,service_cities,performance_formats,event_types,bio,show_duration_minutes,manager_name,manager_email,manager_whatsapp,instagram_url,tiktok_url,youtube_url,base_rider,travel_policy,accommodation_policy,onboarding_status").eq("id", talentId).maybeSingle(),
      supabase.from("talent_profile_submissions").select("*").eq("talent_id", talentId).maybeSingle(),
      supabase.from("talent_assets").select("id,asset_type,provider,original_filename,mime_type,size_bytes,title,description,upload_status,review_status,buyer_visible,created_at").eq("talent_id", talentId).order("created_at", { ascending: false }),
    ]);
    if (talentError) throw new Error(talentError.message);
    if (!talent) return NextResponse.json({ error: "Talent not found" }, { status: 404 });
    if (submissionError) throw new Error(submissionError.message);
    if (assetsError) throw new Error(assetsError.message);

    return NextResponse.json({ ok: true, talent, submission, assets: assets ?? [] });
  } catch (error) {
    return NextResponse.json({ error: "Onboarding data failed", detail: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const { talentId, ok } = auth(body);
    if (!ok) return NextResponse.json({ error: "Invalid or expired onboarding link" }, { status: 401 });

    const name = text(body?.name);
    const category = text(body?.category);
    if (!name || !category) return NextResponse.json({ error: "Nama dan kategori wajib diisi" }, { status: 400 });
    const showDuration = body?.showDurationMinutes == null || body?.showDurationMinutes === "" ? null : Number(body.showDurationMinutes);
    if (showDuration != null && (!Number.isInteger(showDuration) || showDuration <= 0 || showDuration > 600)) return NextResponse.json({ error: "Durasi tampil tidak valid" }, { status: 400 });

    const payload = {
      talent_id: talentId,
      name,
      category,
      base_city: text(body?.baseCity),
      genres: textArray(body?.genres),
      service_cities: textArray(body?.serviceCities),
      performance_formats: textArray(body?.performanceFormats),
      event_types: textArray(body?.eventTypes),
      bio: text(body?.bio),
      show_duration_minutes: showDuration,
      manager_name: text(body?.managerName),
      manager_email: text(body?.managerEmail),
      manager_whatsapp: text(body?.managerWhatsapp),
      instagram_url: text(body?.instagramUrl),
      tiktok_url: text(body?.tiktokUrl),
      youtube_url: text(body?.youtubeUrl),
      base_rider: text(body?.baseRider),
      travel_policy: text(body?.travelPolicy),
      accommodation_policy: text(body?.accommodationPolicy),
      status: "draft",
      rejection_note: null,
      updated_at: new Date().toISOString(),
    };

    const supabase = getServerClient();
    const { data, error } = await supabase.from("talent_profile_submissions").upsert(payload, { onConflict: "talent_id" }).select("*").single();
    if (error) throw new Error(error.message);
    await supabase.from("talents").update({ onboarding_status: "in_progress", updated_at: new Date().toISOString() }).eq("id", talentId).neq("onboarding_status", "approved");
    return NextResponse.json({ ok: true, submission: data });
  } catch (error) {
    return NextResponse.json({ error: "Save onboarding profile failed", detail: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const { talentId, ok } = auth(body);
    if (!ok) return NextResponse.json({ error: "Invalid or expired onboarding link" }, { status: 401 });
    const supabase = getServerClient();

    const [{ data: submission, error: submissionError }, { data: assets, error: assetsError }] = await Promise.all([
      supabase.from("talent_profile_submissions").select("id,name,category,bio,manager_name,manager_email,manager_whatsapp,status").eq("talent_id", talentId).maybeSingle(),
      supabase.from("talent_assets").select("asset_type,upload_status").eq("talent_id", talentId).eq("upload_status", "uploaded"),
    ]);
    if (submissionError) throw new Error(submissionError.message);
    if (assetsError) throw new Error(assetsError.message);
    if (!submission) return NextResponse.json({ error: "Simpan profil terlebih dahulu" }, { status: 409 });
    if (!submission.name || !submission.category || !submission.bio || !submission.manager_name || (!submission.manager_email && !submission.manager_whatsapp)) {
      return NextResponse.json({ error: "Lengkapi bio dan kontak manager/PIC sebelum submit" }, { status: 409 });
    }
    const hasPhoto = (assets ?? []).some((asset) => asset.asset_type === "profile_photo");
    const hasVideo = (assets ?? []).some((asset) => ["live_performance", "showreel", "event_clip"].includes(asset.asset_type));
    if (!hasPhoto || !hasVideo) return NextResponse.json({ error: "Minimal 1 foto profil dan 1 video wajib diunggah sebelum submit" }, { status: 409 });

    const now = new Date().toISOString();
    const { error: updateError } = await supabase.from("talent_profile_submissions").update({ status: "submitted", submitted_at: now, updated_at: now }).eq("talent_id", talentId);
    if (updateError) throw new Error(updateError.message);
    const { error: talentUpdateError } = await supabase.from("talents").update({ onboarding_status: "submitted", updated_at: now }).eq("id", talentId);
    if (talentUpdateError) throw new Error(talentUpdateError.message);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: "Submit onboarding failed", detail: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
