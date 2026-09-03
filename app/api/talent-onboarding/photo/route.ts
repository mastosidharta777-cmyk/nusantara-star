import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import { verifyAccessToken } from "@/lib/signed-access";
import { talentOnboardingEditConflict } from "@/lib/talent-onboarding-state";

export const runtime = "nodejs";

const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
const ALLOWED = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);

function getServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) throw new Error("Supabase server environment is not configured");
  return createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const talentId = typeof body?.talentId === "string" ? body.talentId : "";
    const token = typeof body?.token === "string" ? body.token : "";
    const fileName = typeof body?.fileName === "string" ? body.fileName.trim() : "";
    const mimeType = typeof body?.mimeType === "string" ? body.mimeType : "";
    const sizeBytes = Number(body?.sizeBytes ?? 0);
    const assetType = body?.assetType === "press_photo" ? "press_photo" : "profile_photo";
    if (!talentId || !verifyAccessToken(token, "talent_onboarding", talentId)) return NextResponse.json({ error: "Invalid or expired onboarding link" }, { status: 401 });
    const ext = ALLOWED.get(mimeType);
    if (!fileName || !ext || !Number.isSafeInteger(sizeBytes) || sizeBytes <= 0 || sizeBytes > MAX_PHOTO_BYTES) return NextResponse.json({ error: "Gunakan JPG, PNG, atau WebP maksimal 10 MB" }, { status: 400 });

    const supabase = getServerClient();
    const editConflict = await talentOnboardingEditConflict(supabase, talentId);
    if (editConflict) return editConflict;
    const storageKey = `${talentId}/${randomUUID()}.${ext}`;
    const { data: signed, error: signedError } = await supabase.storage.from("talent-photos").createSignedUploadUrl(storageKey);
    if (signedError || !signed) throw new Error(signedError?.message ?? "Signed photo upload failed");

    const { data: asset, error: assetError } = await supabase.from("talent_assets").insert({
      talent_id: talentId,
      asset_type: assetType,
      provider: "supabase_storage",
      storage_key: storageKey,
      original_filename: fileName,
      mime_type: mimeType,
      size_bytes: sizeBytes,
      upload_status: "pending_upload",
      review_status: "pending",
      buyer_visible: false,
    }).select("id").single();
    if (assetError || !asset) throw new Error(assetError?.message ?? "Asset record failed");
    return NextResponse.json({ ok: true, assetId: asset.id, path: signed.path, token: signed.token });
  } catch (error) {
    return NextResponse.json({ error: "Photo upload preparation failed", detail: error instanceof Error ? error.message : String(error) }, { status: 500 });
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
    const editConflict = await talentOnboardingEditConflict(supabase, talentId);
    if (editConflict) return editConflict;
    const { data: asset, error } = await supabase.from("talent_assets").select("id,storage_key,size_bytes,provider").eq("id", assetId).eq("talent_id", talentId).maybeSingle();
    if (error) throw new Error(error.message);
    if (!asset || asset.provider !== "supabase_storage") return NextResponse.json({ error: "Asset not found" }, { status: 404 });

    const parts = asset.storage_key.split("/");
    const file = parts.pop() ?? "";
    const folder = parts.join("/");
    const { data: listed, error: listError } = await supabase.storage.from("talent-photos").list(folder, { search: file, limit: 20 });
    if (listError) throw new Error(listError.message);
    const uploaded = (listed ?? []).find((item) => item.name === file);
    const uploadedSize = Number((uploaded as any)?.metadata?.size ?? 0);
    if (!uploaded || uploadedSize !== Number(asset.size_bytes)) return NextResponse.json({ error: "Uploaded photo could not be verified" }, { status: 409 });

    const { error: updateError } = await supabase.from("talent_assets").update({ upload_status: "uploaded", uploaded_at: new Date().toISOString() }).eq("id", assetId);
    if (updateError) throw new Error(updateError.message);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: "Photo upload verification failed", detail: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
