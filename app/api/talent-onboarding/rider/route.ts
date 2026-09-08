import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import { extractRiderText, persistRiderVersion, validateRiderIdentity } from "@/lib/rider-normalization";
import { verifyAccessToken } from "@/lib/signed-access";
import { talentOnboardingEditConflict } from "@/lib/talent-onboarding-state";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX = 15 * 1024 * 1024;
const ALLOWED = new Map([
  ["application/pdf", "pdf"],
  ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", "docx"],
  ["text/plain", "txt"],
]);

function client() {
  const u = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const k = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!u || !k) throw new Error("Supabase server environment is not configured");
  return createClient(u, k, { auth: { persistSession: false, autoRefreshToken: false } });
}

function auth(body: any) {
  const talentId = typeof body?.talentId === "string" ? body.talentId : "";
  const token = typeof body?.token === "string" ? body.token : "";
  return { talentId, ok: Boolean(talentId && verifyAccessToken(token, "talent_onboarding", talentId)) };
}

function nonEmpty(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
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
    if (!fileName || !ext || !Number.isSafeInteger(sizeBytes) || sizeBytes <= 0 || sizeBytes > MAX) {
      return NextResponse.json({ error: "Gunakan PDF, DOCX, atau TXT maksimal 15 MB" }, { status: 400 });
    }

    const s = client();
    const editConflict = await talentOnboardingEditConflict(s, talentId);
    if (editConflict) return editConflict;

    const storageKey = `${talentId}/${randomUUID()}.${ext}`;
    const { data: signed, error: signedError } = await s.storage.from("talent-documents").createSignedUploadUrl(storageKey);
    if (signedError || !signed) throw new Error(signedError?.message ?? "Signed upload failed");

    const { data: asset, error: assetError } = await s
      .from("talent_assets")
      .insert({
        talent_id: talentId,
        asset_type: "rider_document",
        provider: "supabase_storage",
        storage_key: storageKey,
        original_filename: fileName,
        mime_type: mimeType,
        size_bytes: sizeBytes,
        title: "Rider source document",
        upload_status: "pending_upload",
        review_status: "pending",
        buyer_visible: false,
      })
      .select("id")
      .single();
    if (assetError || !asset) throw new Error(assetError?.message ?? "Rider asset record failed");

    return NextResponse.json({ ok: true, assetId: asset.id, path: signed.path, token: signed.token });
  } catch (error) {
    return NextResponse.json(
      { error: "Rider upload preparation failed", detail: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request) {
  let assetStored = false;
  let assetId = "";

  try {
    const body = await request.json().catch(() => null);
    const { talentId, ok } = auth(body);
    assetId = typeof body?.assetId === "string" ? body.assetId : "";
    if (!ok || !assetId) return NextResponse.json({ error: "Invalid or expired onboarding link" }, { status: 401 });

    const s = client();
    const editConflict = await talentOnboardingEditConflict(s, talentId);
    if (editConflict) return editConflict;

    const { data: asset, error } = await s
      .from("talent_assets")
      .select("id,storage_key,size_bytes,provider,asset_type,mime_type,original_filename")
      .eq("id", assetId)
      .eq("talent_id", talentId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!asset || asset.provider !== "supabase_storage" || asset.asset_type !== "rider_document") {
      return NextResponse.json({ error: "Rider document not found" }, { status: 404 });
    }

    const parts = asset.storage_key.split("/");
    const file = parts.pop() ?? "";
    const folder = parts.join("/");
    const { data: listed, error: listError } = await s.storage.from("talent-documents").list(folder, { search: file, limit: 20 });
    if (listError) throw new Error(listError.message);

    const uploaded = (listed ?? []).find(item => item.name === file);
    const uploadedSize = Number((uploaded as any)?.metadata?.size ?? 0);
    if (!uploaded || uploadedSize !== Number(asset.size_bytes)) {
      return NextResponse.json({ error: "Uploaded rider could not be verified" }, { status: 409 });
    }

    const now = new Date().toISOString();
    const { error: updateError } = await s
      .from("talent_assets")
      .update({ upload_status: "uploaded", uploaded_at: now, buyer_visible: false, updated_at: now })
      .eq("id", assetId);
    if (updateError) throw new Error(updateError.message);
    assetStored = true;

    try {
      const [{ data: downloaded, error: downloadError }, { data: talent }, { data: submission }] = await Promise.all([
        s.storage.from("talent-documents").download(asset.storage_key),
        s.from("talents").select("name,base_city,category").eq("id", talentId).maybeSingle(),
        s.from("talent_profile_submissions").select("name,base_city,category").eq("talent_id", talentId).maybeSingle(),
      ]);
      if (downloadError || !downloaded) throw new Error(downloadError?.message ?? "Rider download failed");

      const sourceText = (await extractRiderText(Buffer.from(await downloaded.arrayBuffer()), asset.mime_type))
        .replace(/\u0000/g, " ")
        .trim();
      if (!sourceText) throw new Error("Dokumen tidak menghasilkan teks yang dapat dibaca");

      // A draft submission can exist before its fields are populated. Resolve each field independently
      // instead of letting an empty submission shadow the canonical talent record.
      const talentName = nonEmpty(submission?.name) || nonEmpty(talent?.name);
      const baseCity = nonEmpty(submission?.base_city) || nonEmpty(talent?.base_city) || null;
      const category = nonEmpty(submission?.category) || nonEmpty(talent?.category) || null;
      if (!talentName) throw new Error("Nama talent tidak ditemukan");

      const identity = await validateRiderIdentity({ sourceText, talentName, sourceFilename: asset.original_filename });
      if (identity.outcome === "mismatch") {
        await s
          .from("talent_assets")
          .update({
            review_status: "rejected",
            buyer_visible: false,
            description: `Source mismatch: ${identity.detectedArtist ?? "artist berbeda"}`,
            reviewed_at: now,
            updated_at: now,
          })
          .eq("id", assetId);
        return NextResponse.json(
          {
            error: `Dokumen terdeteksi milik ${identity.detectedArtist ?? "talent lain"}, bukan ${talentName}. Upload rider yang sesuai.`,
            sourceMismatch: true,
            identity,
          },
          { status: 409 },
        );
      }

      const riderVersion = await persistRiderVersion(s, {
        talentId,
        sourceType: "uploaded_document",
        sourceAssetId: assetId,
        sourceFilename: asset.original_filename,
        sourceText,
        talentName,
        baseCity,
        category,
      });

      await s.from("talent_assets").update({ description: null, updated_at: new Date().toISOString() }).eq("id", assetId);
      return NextResponse.json({ ok: true, normalized: true, riderVersion, identity });
    } catch (normalizationError) {
      const detail = normalizationError instanceof Error ? normalizationError.message : String(normalizationError);
      console.warn(JSON.stringify({ level: "warning", message: "Rider stored but normalization failed", route: "/api/talent-onboarding/rider", assetId, detail }));
      await s
        .from("talent_assets")
        .update({ description: "Dokumen tersimpan tetapi normalisasi AI belum berhasil; tinjau file asli.", updated_at: now })
        .eq("id", assetId);
      return NextResponse.json({
        ok: true,
        normalized: false,
        warning: "Rider sudah tersimpan, tetapi perapihan AI belum berhasil. Klik Coba AI lagi tanpa upload ulang.",
      });
    }
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error(JSON.stringify({ level: "error", message: "Rider upload verification failed", route: "/api/talent-onboarding/rider", assetId, assetStored, detail }));
    return NextResponse.json(
      {
        error: assetStored ? "Rider sudah tersimpan, tetapi pemeriksaan lanjutan gagal." : "Unggah rider gagal",
        saved: assetStored,
        detail,
      },
      { status: 500 },
    );
  }
}
