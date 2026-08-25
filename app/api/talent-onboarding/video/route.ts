import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import { createR2PresignedUrl } from "@/lib/r2-presign";
import { verifyAccessToken } from "@/lib/signed-access";

export const runtime = "nodejs";

const MAX_VIDEO_BYTES = 150 * 1024 * 1024;
const ALLOWED_VIDEO_TYPES = new Set(["video/mp4", "video/webm"]);
const ALLOWED_ASSET_TYPES = new Set(["live_performance", "showreel", "event_clip"]);

function getServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) throw new Error("Supabase server environment is not configured");
  return createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

function safeExtension(fileName: string, mimeType: string) {
  if (mimeType === "video/mp4") return "mp4";
  if (mimeType === "video/webm") return "webm";
  return fileName.split(".").pop()?.toLowerCase() || "bin";
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const talentId = typeof body?.talentId === "string" ? body.talentId : "";
    const token = typeof body?.token === "string" ? body.token : "";
    const fileName = typeof body?.fileName === "string" ? body.fileName.trim() : "";
    const mimeType = typeof body?.mimeType === "string" ? body.mimeType : "";
    const sizeBytes = Number(body?.sizeBytes ?? 0);
    const assetType = typeof body?.assetType === "string" ? body.assetType : "";
    const title = typeof body?.title === "string" && body.title.trim() ? body.title.trim().slice(0, 160) : null;
    const description = typeof body?.description === "string" && body.description.trim() ? body.description.trim().slice(0, 1000) : null;

    if (!talentId || !verifyAccessToken(token, "talent_onboarding", talentId)) return NextResponse.json({ error: "Invalid or expired onboarding link" }, { status: 401 });
    if (!fileName || !ALLOWED_VIDEO_TYPES.has(mimeType) || !Number.isSafeInteger(sizeBytes) || sizeBytes <= 0 || sizeBytes > MAX_VIDEO_BYTES || !ALLOWED_ASSET_TYPES.has(assetType)) {
      return NextResponse.json({ error: "Invalid video. Use MP4/WebM up to 150 MB." }, { status: 400 });
    }

    const supabase = getServerClient();
    const { data: talent, error: talentError } = await supabase.from("talents").select("id").eq("id", talentId).maybeSingle();
    if (talentError) throw new Error(talentError.message);
    if (!talent) return NextResponse.json({ error: "Talent not found" }, { status: 404 });

    const objectKey = `talents/${talentId}/videos/${randomUUID()}.${safeExtension(fileName, mimeType)}`;
    const { data: asset, error: assetError } = await supabase.from("talent_assets").insert({
      talent_id: talentId,
      asset_type: assetType,
      provider: "cloudflare_r2",
      storage_key: objectKey,
      original_filename: fileName,
      mime_type: mimeType,
      size_bytes: sizeBytes,
      title,
      description,
      upload_status: "pending_upload",
      review_status: "pending",
      buyer_visible: false,
    }).select("id").single();
    if (assetError || !asset) throw new Error(assetError?.message ?? "Asset record failed");

    const uploadUrl = createR2PresignedUrl("PUT", objectKey, 900);
    return NextResponse.json({ ok: true, assetId: asset.id, objectKey, uploadUrl, expiresIn: 900 });
  } catch (error) {
    return NextResponse.json({ error: "Video upload preparation failed", detail: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const talentId = typeof body?.talentId === "string" ? body.talentId : "";
    const token = typeof body?.token === "string" ? body.token : "";
    const assetId = typeof body?.assetId === "string" ? body.assetId : "";
    if (!talentId || !assetId || !verifyAccessToken(token, "talent_onboarding", talentId)) return NextResponse.json({ error: "Invalid or expired onboarding link" }, { status: 401 });

    const supabase = getServerClient();
    const { data: asset, error } = await supabase.from("talent_assets").select("id,talent_id,storage_key,size_bytes,provider").eq("id", assetId).eq("talent_id", talentId).maybeSingle();
    if (error) throw new Error(error.message);
    if (!asset || asset.provider !== "cloudflare_r2") return NextResponse.json({ error: "Asset not found" }, { status: 404 });

    const headUrl = createR2PresignedUrl("HEAD", asset.storage_key, 120);
    const head = await fetch(headUrl, { method: "HEAD", cache: "no-store" });
    const uploadedBytes = Number(head.headers.get("content-length") ?? 0);
    if (!head.ok || uploadedBytes !== Number(asset.size_bytes)) return NextResponse.json({ error: "Uploaded video could not be verified" }, { status: 409 });

    const { error: updateError } = await supabase.from("talent_assets").update({ upload_status: "uploaded", uploaded_at: new Date().toISOString() }).eq("id", assetId);
    if (updateError) throw new Error(updateError.message);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: "Video upload verification failed", detail: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
