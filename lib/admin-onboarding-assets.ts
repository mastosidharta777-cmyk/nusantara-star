import "server-only";

import { createR2PresignedUrl } from "@/lib/r2-presign";
import { youtubeEmbedUrlFromStorageKey } from "@/lib/youtube";
import { parseInstagramMediaUrl, parseSoundCloudUrl } from "@/lib/profile-media";

export async function buildAdminAssetPreviewUrl(supabase: any, asset: any) {
  if (!asset?.storage_key || asset.upload_status !== "uploaded") return null;
  if (asset.provider === "youtube_unlisted") return youtubeEmbedUrlFromStorageKey(asset.storage_key);
  if (asset.provider === "soundcloud") return parseSoundCloudUrl(asset.original_filename)?.embedUrl ?? null;
  if (asset.provider === "instagram") return parseInstagramMediaUrl(asset.original_filename)?.canonicalUrl ?? null;
  if (asset.provider === "cloudflare_r2") {
    try {
      return createR2PresignedUrl("GET", asset.storage_key, 600);
    } catch (error) {
      console.error("Admin R2 media preview unavailable", error instanceof Error ? error.message : String(error));
      return null;
    }
  }
  if (asset.provider === "supabase_storage") {
    const bucket = asset.asset_type === "profile_photo" ? "talent-photos" : asset.asset_type === "rider_document" ? "talent-documents" : null;
    if (!bucket) return null;
    const { data, error } = await supabase.storage.from(bucket).createSignedUrl(asset.storage_key, 600);
    return error ? null : data.signedUrl;
  }
  return null;
}

export async function reviewOnboardingAsset(supabase: any, input: { profileId: string; assetId: string; decision: "approved" | "rejected" }) {
  const { data: asset, error: assetError } = await supabase
    .from("talent_assets")
    .select("id,asset_type")
    .eq("id", input.assetId)
    .eq("talent_id", input.profileId)
    .maybeSingle();
  if (assetError) throw new Error(assetError.message);
  if (!asset) throw new Error("Media tidak ditemukan");
  const buyerVisible = input.decision === "approved" && asset.asset_type !== "rider_document";
  const { data: changed, error } = await supabase
    .from("talent_assets")
    .update({ review_status: input.decision, buyer_visible: buyerVisible, reviewed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", input.assetId)
    .eq("talent_id", input.profileId)
    .eq("upload_status", "uploaded")
    .select("id");
  if (error) throw new Error(error.message);
  if (!changed?.length) throw new Error("Media belum selesai diunggah atau sudah berubah");
  return { buyerVisible, assetType: asset.asset_type };
}
