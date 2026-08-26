import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import { extractRiderText, persistRiderVersion } from "@/lib/rider-normalization";
import { verifyAccessToken } from "@/lib/signed-access";

export const runtime = "nodejs";

const MAX_RIDER_BYTES = 15 * 1024 * 1024;
const ALLOWED = new Map([
  ["application/pdf", "pdf"],
  ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", "docx"],
  ["text/plain", "txt"],
]);

function getServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) throw new Error("Supabase server environment is not configured");
  return createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
}
function auth(body: any) {
  const talentId = typeof body?.talentId === "string" ? body.talentId : "";
  const token = typeof body?.token === "string" ? body.token : "";
  return { talentId, ok: Boolean(talentId && verifyAccessToken(token, "talent_onboarding", talentId)) };
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const { talentId, ok } = auth(body);
    if (!ok) return NextResponse.json({ error: "Invalid or expired onboarding link" }, { status: 401 });
    const fileName = typeof body?.fileName === "string" ? body.fileName.trim() : "";
    const mimeType = typeof body?.mimeType === "string" ? body.mimeType : "";
    const sizeBytes = Number(body?.sizeBytes ?? 0);
    const ext = ALLOWED.get(mimeType);
    if (!fileName || !ext || !Number.isSafeInteger(sizeBytes) || sizeBytes <= 0 || sizeBytes > MAX_RIDER_BYTES) return NextResponse.json({ error: "Gunakan PDF, DOCX, atau TXT maksimal 15 MB" }, { status: 400 });

    const supabase = getServerClient();
    const storageKey = `${talentId}/${randomUUID()}.${ext}`;
    const { data: signed, error: signedError } = await supabase.storage.from("talent-documents").createSignedUploadUrl(storageKey);
    if (signedError || !signed) throw new Error(signedError?.message ?? "Signed rider upload failed");
    const { data: asset, error: assetError } = await supabase.from("talent_assets").insert({ talent_id: talentId, asset_type: "rider_document", provider: "supabase_storage", storage_key: storageKey, original_filename: fileName, mime_type: mimeType, size_bytes: sizeBytes, title: "Rider source document", upload_status: "pending_upload", review_status: "pending", buyer_visible: false }).select("id").single();
    if (assetError || !asset) throw new Error(assetError?.message ?? "Rider asset record failed");
    return NextResponse.json({ ok: true, assetId: asset.id, path: signed.path, token: signed.token });
  } catch (error) {
    return NextResponse.json({ error: "Rider upload preparation failed", detail: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const { talentId, ok } = auth(body);
    const assetId = typeof body?.assetId === "string" ? body.assetId : "";
    if (!ok || !assetId) return NextResponse.json({ error: "Invalid or expired onboarding link" }, { status: 401 });
    const supabase = getServerClient();
    const { data: asset, error } = await supabase.from("talent_assets").select("id,storage_key,size_bytes,provider,asset_type,mime_type,original_filename").eq("id", assetId).eq("talent_id", talentId).maybeSingle();
    if (error) throw new Error(error.message);
    if (!asset || asset.provider !== "supabase_storage" || asset.asset_type !== "rider_document") return NextResponse.json({ error: "Rider document not found" }, { status: 404 });

    const parts = asset.storage_key.split("/"); const file = parts.pop() ?? ""; const folder = parts.join("/");
    const { data: listed, error: listError } = await supabase.storage.from("talent-documents").list(folder, { search: file, limit: 20 });
    if (listError) throw new Error(listError.message);
    const uploaded = (listed ?? []).find((item) => item.name === file);
    const uploadedSize = Number((uploaded as any)?.metadata?.size ?? 0);
    if (!uploaded || uploadedSize !== Number(asset.size_bytes)) return NextResponse.json({ error: "Uploaded rider could not be verified" }, { status: 409 });

    const now = new Date().toISOString();
    const { error: updateError } = await supabase.from("talent_assets").update({ upload_status: "uploaded", uploaded_at: now, buyer_visible: false, updated_at: now }).eq("id", assetId);
    if (updateError) throw new Error(updateError.message);

    let riderVersion = null;
    let normalizationError: string | null = null;
    try {
      const [{ data: downloaded, error: downloadError }, { data: talent }, { data: submission }] = await Promise.all([
        supabase.storage.from("talent-documents").download(asset.storage_key),
        supabase.from("talents").select("name,base_city").eq("id", talentId).maybeSingle(),
        supabase.from("talent_profile_submissions").select("name,base_city").eq("talent_id", talentId).maybeSingle(),
      ]);
      if (downloadError || !downloaded) throw new Error(downloadError?.message ?? "Rider download failed");
      const buffer = Buffer.from(await downloaded.arrayBuffer());
      const sourceText = (await extractRiderText(buffer, asset.mime_type)).replace(/\u0000/g, " ").trim();
      if (!sourceText) throw new Error("Dokumen tidak menghasilkan teks yang dapat dibaca");
      const source = submission ?? talent;
      riderVersion = await persistRiderVersion(supabase, { talentId, sourceType: "uploaded_document", sourceAssetId: assetId, sourceFilename: asset.original_filename, sourceText, talentName: source?.name ?? null, baseCity: source?.base_city ?? null });
    } catch (normalizationFailure) {
      normalizationError = normalizationFailure instanceof Error ? normalizationFailure.message : String(normalizationFailure);
      console.error("Rider document normalization failed", normalizationFailure);
    }

    return NextResponse.json({ ok: true, normalized: Boolean(riderVersion), riderVersion, normalizationError });
  } catch (error) {
    return NextResponse.json({ error: "Rider upload verification failed", detail: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
