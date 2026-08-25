import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function getServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) throw new Error("Supabase server environment is not configured");
  return createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

function ensureAdmin(request: Request) {
  return process.env.VERCEL_ENV !== "production" || request.headers.get("x-ns-admin-verified") === "1";
}

export async function GET(request: Request) {
  try {
    if (!ensureAdmin(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const talentId = new URL(request.url).searchParams.get("talentId") ?? "";
    if (!talentId) return NextResponse.json({ error: "Talent wajib dipilih" }, { status: 400 });
    const supabase = getServerClient();
    const [{ data: talent, error: talentError }, { data: submission, error: submissionError }, { data: assets, error: assetsError }] = await Promise.all([
      supabase.from("talents").select("id,name,onboarding_status,public_visible,status").eq("id", talentId).maybeSingle(),
      supabase.from("talent_profile_submissions").select("*").eq("talent_id", talentId).maybeSingle(),
      supabase.from("talent_assets").select("id,asset_type,provider,original_filename,mime_type,size_bytes,title,description,upload_status,review_status,buyer_visible,created_at").eq("talent_id", talentId).order("created_at", { ascending: false }),
    ]);
    if (talentError) throw new Error(talentError.message);
    if (!talent) return NextResponse.json({ error: "Talent tidak ditemukan" }, { status: 404 });
    if (submissionError) throw new Error(submissionError.message);
    if (assetsError) throw new Error(assetsError.message);
    return NextResponse.json({ ok: true, talent, submission, assets: assets ?? [] });
  } catch (error) {
    return NextResponse.json({ error: "Gagal memuat review onboarding", detail: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    if (!ensureAdmin(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const body = await request.json().catch(() => null);
    const talentId = typeof body?.talentId === "string" ? body.talentId : "";
    const action = typeof body?.action === "string" ? body.action : "";
    if (!talentId) return NextResponse.json({ error: "Talent wajib dipilih" }, { status: 400 });
    const supabase = getServerClient();
    const now = new Date().toISOString();

    if (action === "review_asset") {
      const assetId = typeof body?.assetId === "string" ? body.assetId : "";
      const decision = body?.decision === "approved" ? "approved" : body?.decision === "rejected" ? "rejected" : "";
      if (!assetId || !decision) return NextResponse.json({ error: "Review asset tidak valid" }, { status: 400 });
      const { error } = await supabase.from("talent_assets").update({ review_status: decision, buyer_visible: decision === "approved", reviewed_at: now, updated_at: now }).eq("id", assetId).eq("talent_id", talentId).eq("upload_status", "uploaded");
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true });
    }

    if (action === "reject_profile") {
      const rejectionNote = typeof body?.rejectionNote === "string" && body.rejectionNote.trim() ? body.rejectionNote.trim() : "Perlu revisi";
      const { error } = await supabase.from("talent_profile_submissions").update({ status: "rejected", rejection_note: rejectionNote, reviewed_at: now, updated_at: now }).eq("talent_id", talentId);
      if (error) throw new Error(error.message);
      await supabase.from("talents").update({ onboarding_status: "rejected", public_visible: false, updated_at: now }).eq("id", talentId);
      return NextResponse.json({ ok: true });
    }

    if (action === "approve_profile") {
      const [{ data: submission, error: submissionError }, { data: assets, error: assetsError }] = await Promise.all([
        supabase.from("talent_profile_submissions").select("*").eq("talent_id", talentId).eq("status", "submitted").maybeSingle(),
        supabase.from("talent_assets").select("asset_type,review_status,buyer_visible").eq("talent_id", talentId).eq("review_status", "approved").eq("buyer_visible", true),
      ]);
      if (submissionError) throw new Error(submissionError.message);
      if (assetsError) throw new Error(assetsError.message);
      if (!submission) return NextResponse.json({ error: "Profil belum berstatus submitted" }, { status: 409 });
      const hasPhoto = (assets ?? []).some((asset) => asset.asset_type === "profile_photo");
      const hasVideo = (assets ?? []).some((asset) => ["live_performance", "showreel", "event_clip"].includes(asset.asset_type));
      if (!hasPhoto || !hasVideo) return NextResponse.json({ error: "Approve minimal 1 foto profil dan 1 video terlebih dahulu" }, { status: 409 });

      const publicProfile = {
        name: submission.name,
        category: submission.category,
        base_city: submission.base_city,
        genres: submission.genres,
        service_cities: submission.service_cities,
        performance_formats: submission.performance_formats,
        event_types: submission.event_types,
        bio: submission.bio,
        show_duration_minutes: submission.show_duration_minutes,
        manager_name: submission.manager_name,
        manager_email: submission.manager_email,
        manager_whatsapp: submission.manager_whatsapp,
        instagram_url: submission.instagram_url,
        tiktok_url: submission.tiktok_url,
        youtube_url: submission.youtube_url,
        base_rider: submission.base_rider,
        travel_policy: submission.travel_policy,
        accommodation_policy: submission.accommodation_policy,
        onboarding_status: "approved",
        onboarding_approved_at: now,
        status: "verified",
        public_visible: true,
        updated_at: now,
      };
      const { error: talentError } = await supabase.from("talents").update(publicProfile).eq("id", talentId);
      if (talentError) throw new Error(talentError.message);
      const { error: submissionUpdateError } = await supabase.from("talent_profile_submissions").update({ status: "approved", rejection_note: null, reviewed_at: now, updated_at: now }).eq("talent_id", talentId);
      if (submissionUpdateError) throw new Error(submissionUpdateError.message);
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Action tidak dikenal" }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: "Review onboarding gagal", detail: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
