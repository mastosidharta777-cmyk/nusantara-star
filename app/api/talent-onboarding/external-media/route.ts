import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import { parseInstagramMediaUrl, parseSoundCloudUrl } from "@/lib/profile-media";
import { verifyAccessToken } from "@/lib/signed-access";
import { talentOnboardingEditConflict } from "@/lib/talent-onboarding-state";

export const runtime = "nodejs";

function getServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase server environment is not configured");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const talentId = typeof body?.talentId === "string" ? body.talentId : "";
    const token = typeof body?.token === "string" ? body.token : "";
    const provider = body?.provider === "soundcloud" || body?.provider === "instagram" ? body.provider : null;
    if (!talentId || !verifyAccessToken(token, "talent_onboarding", talentId)) return NextResponse.json({ error: "Tautan pendaftaran tidak valid atau sudah kedaluwarsa" }, { status: 401 });
    if (!provider) return NextResponse.json({ error: "Provider media tidak didukung" }, { status: 400 });

    const media = provider === "soundcloud" ? parseSoundCloudUrl(body?.url) : parseInstagramMediaUrl(body?.url);
    if (!media) return NextResponse.json({ error: provider === "soundcloud" ? "Gunakan link track atau playlist SoundCloud yang valid" : "Gunakan link post atau Reel Instagram yang valid" }, { status: 400 });

    const supabase = getServerClient();
    const editConflict = await talentOnboardingEditConflict(supabase, talentId);
    if (editConflict) return editConflict;
    const assetType = provider === "soundcloud" ? "showreel" : "event_clip";
    const { data: current, error: currentError } = await supabase
      .from("talent_assets").select("id").eq("talent_id", talentId).eq("provider", provider).eq("asset_type", assetType).maybeSingle();
    if (currentError) throw new Error(currentError.message);

    const payload = {
      talent_id: talentId, asset_type: assetType, provider,
      storage_key: `${talentId}/${provider}`,
      original_filename: media.canonicalUrl,
      mime_type: "text/uri-list", size_bytes: 1,
      title: provider === "soundcloud" ? "Audio pilihan SoundCloud" : "Video pilihan Instagram",
      description: null, upload_status: "uploaded", review_status: "pending", buyer_visible: false,
      uploaded_at: new Date().toISOString(), reviewed_at: null, updated_at: new Date().toISOString(),
    };
    const query = current ? supabase.from("talent_assets").update(payload).eq("id", current.id).eq("talent_id", talentId) : supabase.from("talent_assets").insert(payload);
    const { data: asset, error } = await query.select("id,provider,original_filename,title,review_status").single();
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true, asset });
  } catch (error) {
    return NextResponse.json({ error: "Link media belum dapat disimpan", detail: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
