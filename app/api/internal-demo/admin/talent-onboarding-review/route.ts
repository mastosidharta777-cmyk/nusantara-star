import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createR2PresignedUrl } from "@/lib/r2-presign";

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

async function buildPreviewUrl(s: ReturnType<typeof getServerClient>, asset: any) {
  if (!asset?.storage_key || asset.upload_status !== "uploaded") return null;
  if (asset.provider === "cloudflare_r2") return createR2PresignedUrl("GET", asset.storage_key, 600);
  if (asset.provider === "supabase_storage") {
    const bucket = asset.asset_type === "profile_photo" ? "talent-photos" : asset.asset_type === "rider_document" ? "talent-documents" : null;
    if (!bucket) return null;
    const { data, error } = await s.storage.from(bucket).createSignedUrl(asset.storage_key, 600);
    if (error) return null;
    return data.signedUrl;
  }
  return null;
}

export async function GET(request: Request) {
  try {
    if (!ensureAdmin(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const talentId = new URL(request.url).searchParams.get("talentId") ?? "";
    if (!talentId) return NextResponse.json({ error: "Talent wajib dipilih" }, { status: 400 });
    const s = getServerClient();
    const [{ data: talent, error: te }, { data: submission, error: se }, { data: assets, error: ae }] = await Promise.all([
      s.from("talents").select("id,name,onboarding_status,public_visible,status").eq("id", talentId).maybeSingle(),
      s.from("talent_profile_submissions").select("*").eq("talent_id", talentId).maybeSingle(),
      s.from("talent_assets").select("id,asset_type,provider,storage_key,original_filename,mime_type,size_bytes,title,description,upload_status,review_status,buyer_visible,created_at").eq("talent_id", talentId).order("created_at", { ascending: false }),
    ]);
    if (te) throw new Error(te.message);
    if (!talent) return NextResponse.json({ error: "Talent tidak ditemukan" }, { status: 404 });
    if (se) throw new Error(se.message);
    if (ae) throw new Error(ae.message);
    const enriched = await Promise.all((assets ?? []).map(async (asset) => ({ ...asset, preview_url: await buildPreviewUrl(s, asset) })));
    return NextResponse.json({ ok: true, talent, submission, assets: enriched });
  } catch (e) {
    return NextResponse.json({ error: "Gagal memuat review onboarding", detail: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    if (!ensureAdmin(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const body = await request.json().catch(() => null);
    const talentId = typeof body?.talentId === "string" ? body.talentId : "";
    const action = typeof body?.action === "string" ? body.action : "";
    if (!talentId) return NextResponse.json({ error: "Talent wajib dipilih" }, { status: 400 });
    const s = getServerClient();
    const now = new Date().toISOString();

    if (action === "review_asset") {
      const assetId = typeof body?.assetId === "string" ? body.assetId : "";
      const decision = body?.decision === "approved" ? "approved" : body?.decision === "rejected" ? "rejected" : "";
      if (!assetId || !decision) return NextResponse.json({ error: "Review asset tidak valid" }, { status: 400 });
      const { data: asset, error: assetError } = await s.from("talent_assets").select("id,asset_type").eq("id", assetId).eq("talent_id", talentId).maybeSingle();
      if (assetError) throw new Error(assetError.message);
      if (!asset) return NextResponse.json({ error: "Asset tidak ditemukan" }, { status: 404 });
      const buyerVisible = decision === "approved" && asset.asset_type !== "rider_document";
      const { error } = await s.from("talent_assets").update({ review_status: decision, buyer_visible: buyerVisible, reviewed_at: now, updated_at: now }).eq("id", assetId).eq("talent_id", talentId).eq("upload_status", "uploaded");
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true, buyerVisible });
    }

    if (action === "reject_profile") {
      const rejectionNote = typeof body?.rejectionNote === "string" && body.rejectionNote.trim() ? body.rejectionNote.trim() : "Perlu revisi";
      const { error } = await s.from("talent_profile_submissions").update({ status: "rejected", rejection_note: rejectionNote, reviewed_at: now, updated_at: now }).eq("talent_id", talentId);
      if (error) throw new Error(error.message);
      await s.from("talents").update({ onboarding_status: "rejected", public_visible: false, updated_at: now }).eq("id", talentId);
      return NextResponse.json({ ok: true });
    }

    if (action === "approve_profile") {
      const [{ data: submission, error: se }, { data: assets, error: ae }] = await Promise.all([
        s.from("talent_profile_submissions").select("*").eq("talent_id", talentId).eq("status", "submitted").maybeSingle(),
        s.from("talent_assets").select("asset_type,review_status,buyer_visible").eq("talent_id", talentId).eq("review_status", "approved").eq("buyer_visible", true),
      ]);
      if (se) throw new Error(se.message);
      if (ae) throw new Error(ae.message);
      if (!submission) return NextResponse.json({ error: "Profil belum berstatus submitted" }, { status: 409 });
      const hasPhoto = (assets ?? []).some((a) => a.asset_type === "profile_photo");
      const hasVideo = (assets ?? []).some((a) => ["live_performance", "showreel", "event_clip"].includes(a.asset_type));
      if (!hasPhoto || !hasVideo) return NextResponse.json({ error: "Approve minimal 1 foto profil dan 1 video terlebih dahulu" }, { status: 409 });
      const publicProfile = {
        name: submission.name, category: submission.category, act_type: submission.act_type, base_city: submission.base_city,
        genres: submission.genres, music_styles: submission.music_styles ?? [], vibe_tags: submission.vibe_tags ?? [], capability_tags: submission.capability_tags ?? [],
        service_cities: submission.service_cities, performance_formats: submission.performance_formats, event_types: submission.event_types,
        bio: submission.bio, show_duration_minutes: submission.show_duration_minutes,
        manager_name: submission.manager_name, manager_email: submission.manager_email, manager_whatsapp: submission.manager_whatsapp,
        instagram_url: submission.instagram_url, tiktok_url: submission.tiktok_url, youtube_url: submission.youtube_url,
        base_rider: submission.base_rider, travel_policy: submission.travel_policy, accommodation_policy: submission.accommodation_policy,
        onboarding_status: "approved", onboarding_approved_at: now, status: "verified", public_visible: true, updated_at: now,
      };
      const { error: te } = await s.from("talents").update(publicProfile).eq("id", talentId);
      if (te) throw new Error(te.message);
      const { error: sue } = await s.from("talent_profile_submissions").update({ status: "approved", rejection_note: null, reviewed_at: now, updated_at: now }).eq("talent_id", talentId);
      if (sue) throw new Error(sue.message);
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Action tidak dikenal" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: "Review onboarding gagal", detail: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
