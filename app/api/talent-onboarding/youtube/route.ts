import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import { verifyAccessToken } from "@/lib/signed-access";
import { parseYouTubeVideoUrl } from "@/lib/youtube";

export const runtime = "nodejs";

function getServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase server environment is not configured");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function youtubeTitle(canonicalUrl: string) {
  try {
    const endpoint = `https://www.youtube.com/oembed?url=${encodeURIComponent(canonicalUrl)}&format=json`;
    const response = await fetch(endpoint, { cache: "no-store", signal: AbortSignal.timeout(8000) });
    if (!response.ok) return null;
    const body = await response.json().catch(() => null);
    return typeof body?.title === "string" && body.title.trim() ? body.title.trim().slice(0, 160) : null;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const talentId = typeof body?.talentId === "string" ? body.talentId : "";
    const token = typeof body?.token === "string" ? body.token : "";
    if (!talentId || !verifyAccessToken(token, "talent_onboarding", talentId)) {
      return NextResponse.json({ error: "Tautan pendaftaran tidak valid atau sudah kedaluwarsa" }, { status: 401 });
    }

    const video = parseYouTubeVideoUrl(body?.url);
    if (!video) return NextResponse.json({ error: "Gunakan link video YouTube yang valid" }, { status: 400 });

    const supabase = getServerClient();
    const titlePromise = youtubeTitle(video.canonicalUrl);
    const { data: talent, error: talentError } = await supabase.from("talents").select("id").eq("id", talentId).maybeSingle();
    if (talentError) throw new Error(talentError.message);
    if (!talent) return NextResponse.json({ error: "Talent tidak ditemukan" }, { status: 404 });

    const title = await titlePromise;
    const storageKey = `${talentId}/${video.videoId}`;
    const { data: current, error: currentError } = await supabase
      .from("talent_assets")
      .select("id")
      .eq("talent_id", talentId)
      .eq("provider", "youtube_unlisted")
      .eq("asset_type", "live_performance")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (currentError) throw new Error(currentError.message);

    const payload = {
      talent_id: talentId,
      asset_type: "live_performance",
      provider: "youtube_unlisted",
      storage_key: storageKey,
      original_filename: video.canonicalUrl,
      mime_type: "text/uri-list",
      size_bytes: 1,
      title: title ?? "Video penampilan YouTube",
      description: null,
      upload_status: "uploaded",
      review_status: "pending",
      buyer_visible: false,
      uploaded_at: new Date().toISOString(),
      reviewed_at: null,
      updated_at: new Date().toISOString(),
    };

    const query = current
      ? supabase.from("talent_assets").update(payload).eq("id", current.id).eq("talent_id", talentId)
      : supabase.from("talent_assets").insert(payload);
    const { data: asset, error } = await query.select("id,provider,original_filename,title,review_status").single();
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true, asset, embedUrl: video.embedUrl });
  } catch (error) {
    return NextResponse.json({ error: "Link YouTube belum dapat disimpan", detail: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
