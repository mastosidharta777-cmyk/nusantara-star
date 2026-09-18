import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import { verifyAccessToken } from "@/lib/signed-access";

export const runtime = "nodejs";

const MAX_BYTES = 15 * 1024 * 1024;
const ALLOWED = new Map([
  ["image/jpeg", { ext: "jpg", type: "photo" }],
  ["image/png", { ext: "png", type: "photo" }],
  ["image/webp", { ext: "webp", type: "photo" }],
  ["application/pdf", { ext: "pdf", type: "document" }],
] as const);

function getServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) throw new Error("Supabase server environment is not configured");
  return createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function auth(body: any) {
  const bookingId = clean(body?.bookingId);
  const incidentId = clean(body?.incidentId);
  const party = body?.party === "buyer" || body?.party === "talent" ? body.party : null;
  const token = clean(body?.token);
  const scope = party === "buyer" ? "buyer_pre_show" : party === "talent" ? "talent_pre_show" : null;
  const ok = Boolean(bookingId && incidentId && party && scope && verifyAccessToken(token, scope, bookingId));
  return { bookingId, incidentId, party, token, ok };
}

async function validateIncident(supabase: ReturnType<typeof getServerClient>, bookingId: string, incidentId: string) {
  const { data: incident, error } = await supabase
    .from("incidents")
    .select("id,status")
    .eq("id", incidentId)
    .eq("booking_id", bookingId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return incident;
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const { bookingId, incidentId, party, ok } = auth(body);
    if (!ok || !party) return NextResponse.json({ error: "Secure link tidak valid atau sudah kedaluwarsa" }, { status: 401 });

    const supabase = getServerClient();
    const incident = await validateIncident(supabase, bookingId, incidentId);
    if (!incident) return NextResponse.json({ error: "Laporan kejadian tidak ditemukan" }, { status: 404 });
    if (incident.status !== "open") return NextResponse.json({ error: "Bukti hanya dapat ditambahkan pada laporan yang masih terbuka" }, { status: 409 });

    const externalUrl = clean(body?.externalUrl);
    if (externalUrl) {
      let parsed: URL;
      try {
        parsed = new URL(externalUrl);
      } catch {
        return NextResponse.json({ error: "Link bukti tidak valid" }, { status: 400 });
      }
      if (!["http:", "https:"].includes(parsed.protocol)) {
        return NextResponse.json({ error: "Link bukti harus menggunakan http atau https" }, { status: 400 });
      }

      const { data: evidence, error } = await supabase
        .from("incident_evidence")
        .insert({
          incident_id: incidentId,
          booking_id: bookingId,
          uploaded_by_party: party,
          evidence_type: "link",
          provider: "external_url",
          external_url: parsed.toString(),
          upload_status: "uploaded",
        })
        .select("id")
        .single();
      if (error || !evidence) throw new Error(error?.message ?? "Evidence link insert failed");
      return NextResponse.json({ ok: true, evidenceId: evidence.id, uploaded: true });
    }

    const fileName = clean(body?.fileName);
    const mimeType = clean(body?.mimeType);
    const sizeBytes = Number(body?.sizeBytes ?? 0);
    const typed = ALLOWED.get(mimeType as "image/jpeg" | "image/png" | "image/webp" | "application/pdf");
    if (!fileName || !typed || !Number.isSafeInteger(sizeBytes) || sizeBytes <= 0 || sizeBytes > MAX_BYTES) {
      return NextResponse.json({ error: "Gunakan JPG, PNG, WebP, atau PDF maksimal 15 MB" }, { status: 400 });
    }

    const storageKey = `${bookingId}/${incidentId}/${randomUUID()}.${typed.ext}`;
    const { data: signed, error: signedError } = await supabase.storage.from("incident-evidence").createSignedUploadUrl(storageKey);
    if (signedError || !signed) throw new Error(signedError?.message ?? "Signed evidence upload failed");

    const { data: evidence, error: evidenceError } = await supabase
      .from("incident_evidence")
      .insert({
        incident_id: incidentId,
        booking_id: bookingId,
        uploaded_by_party: party,
        evidence_type: typed.type,
        provider: "supabase_storage",
        storage_key: storageKey,
        original_filename: fileName,
        mime_type: mimeType,
        size_bytes: sizeBytes,
        upload_status: "pending_upload",
      })
      .select("id")
      .single();
    if (evidenceError || !evidence) throw new Error(evidenceError?.message ?? "Evidence record failed");

    return NextResponse.json({ ok: true, evidenceId: evidence.id, path: signed.path, token: signed.token });
  } catch (error) {
    return NextResponse.json({ error: "Persiapan bukti gagal", detail: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const { bookingId, incidentId, party, ok } = auth(body);
    const evidenceId = clean(body?.evidenceId);
    if (!ok || !party || !evidenceId) return NextResponse.json({ error: "Secure link tidak valid atau sudah kedaluwarsa" }, { status: 401 });

    const supabase = getServerClient();
    const { data: evidence, error } = await supabase
      .from("incident_evidence")
      .select("id,storage_key,size_bytes,provider,upload_status")
      .eq("id", evidenceId)
      .eq("incident_id", incidentId)
      .eq("booking_id", bookingId)
      .eq("uploaded_by_party", party)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!evidence || evidence.provider !== "supabase_storage" || !evidence.storage_key) {
      return NextResponse.json({ error: "Bukti tidak ditemukan" }, { status: 404 });
    }
    if (evidence.upload_status === "uploaded") return NextResponse.json({ ok: true, alreadyUploaded: true });

    const parts = evidence.storage_key.split("/");
    const file = parts.pop() ?? "";
    const folder = parts.join("/");
    const { data: listed, error: listError } = await supabase.storage.from("incident-evidence").list(folder, { search: file, limit: 20 });
    if (listError) throw new Error(listError.message);
    const uploaded = (listed ?? []).find((item) => item.name === file);
    const uploadedSize = Number((uploaded as any)?.metadata?.size ?? 0);
    if (!uploaded || uploadedSize !== Number(evidence.size_bytes)) {
      return NextResponse.json({ error: "File bukti belum dapat diverifikasi" }, { status: 409 });
    }

    const { error: updateError } = await supabase
      .from("incident_evidence")
      .update({ upload_status: "uploaded", updated_at: new Date().toISOString() })
      .eq("id", evidenceId);
    if (updateError) throw new Error(updateError.message);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: "Verifikasi bukti gagal", detail: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
