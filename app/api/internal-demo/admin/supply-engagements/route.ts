import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import { sanitizeSupplyServiceIds, supplyServiceLabel, type NonTalentSupplyType } from "@/lib/supply-onboarding";

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

function text(value: unknown, max = 2000) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null;
}

function isNonTalent(value: unknown): value is NonTalentSupplyType {
  return value === "professional" || value === "production_partner";
}

const STUDIO_DELIVERY_SERVICE_IDS = new Set(["songwriter_topliner", "recording_engineer", "mixing_engineer", "mastering_engineer"]);

function deliveryDueAt(value: unknown) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}:00+07:00`);
  if (!Number.isFinite(parsed.getTime()) || parsed.getTime() <= Date.now()) return null;
  return parsed.toISOString();
}

function tableMissing(error: { code?: string; message?: string } | null) {
  return error?.code === "42P01"
    || error?.code === "PGRST205"
    || /(?:supply_engagements.*does not exist|could not find the table.*supply_engagements)/i.test(error?.message ?? "");
}

export async function GET(request: Request) {
  try {
    if (!ensureAdmin(request)) return NextResponse.json({ error: "Tidak memiliki akses" }, { status: 401 });
    const supplyId = new URL(request.url).searchParams.get("supplyId") ?? "";
    if (!supplyId) return NextResponse.json({ error: "Profil supply wajib dipilih" }, { status: 400 });
    const { data, error } = await getServerClient()
      .from("supply_engagements")
      .select("id,work_order_reference,service_label_snapshot,project_name,event_date,city,scope_of_work,deliverables,agreed_fee,currency,payment_terms,status,confirmation_requested_at,supplier_confirmed_at,supplier_declined_at,supplier_response_note,delivery_due_at,supplier_delivery_url,supplier_delivery_note,supplier_delivery_submitted_at,started_at,completed_at,created_at")
      .eq("supply_id", supplyId)
      .order("created_at", { ascending: false });
    if (tableMissing(error)) return NextResponse.json({ ok: true, ready: false, engagements: [] });
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true, ready: true, engagements: data ?? [] });
  } catch (error) {
    return NextResponse.json({ error: "Gagal memuat Work Order", detail: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    if (!ensureAdmin(request)) return NextResponse.json({ error: "Tidak memiliki akses" }, { status: 401 });
    const body = await request.json().catch(() => null);
    const supplyId = text(body?.supplyId, 100);
    const requestKey = typeof body?.requestKey === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.requestKey)
      ? body.requestKey
      : null;
    const projectName = text(body?.projectName, 200);
    const serviceId = text(body?.serviceId, 100);
    const scopeOfWork = text(body?.scopeOfWork, 6000);
    const paymentTerms = text(body?.paymentTerms, 2000);
    const city = text(body?.city, 200);
    const eventDate = /^\d{4}-\d{2}-\d{2}$/.test(body?.eventDate ?? "") ? body.eventDate : null;
    const deliveryDueAtValue = deliveryDueAt(body?.deliveryDueAt);
    const agreedFee = Number(body?.agreedFee);
    const deliverables = Array.isArray(body?.deliverables)
      ? Array.from(new Set(body.deliverables.map((item: unknown) => text(item, 500)).filter((item: string | null): item is string => Boolean(item)))).slice(0, 30)
      : [];

    if (!supplyId || !requestKey || !projectName || !serviceId || !scopeOfWork || !paymentTerms || !Number.isSafeInteger(agreedFee) || agreedFee <= 0) {
      return NextResponse.json({ error: "Lengkapi proyek, layanan, scope, fee, dan termin pembayaran" }, { status: 400 });
    }
    if (!deliverables.length) return NextResponse.json({ error: "Minimal satu deliverable wajib dicatat" }, { status: 400 });
    if (STUDIO_DELIVERY_SERVICE_IDS.has(serviceId) && !deliveryDueAtValue) {
      return NextResponse.json({ error: "Batas delivery / kesiapan (WIB) wajib dan harus di masa depan untuk layanan studio" }, { status: 400 });
    }

    const supabase = getServerClient();
    const { data: existing, error: existingError } = await supabase
      .from("supply_engagements")
      .select("*")
      .eq("request_key", requestKey)
      .maybeSingle();
    if (tableMissing(existingError)) return NextResponse.json({ error: "Schema Engagement V1 belum diterapkan" }, { status: 503 });
    if (existingError) throw new Error(existingError.message);
    if (existing) {
      if (existing.supply_id !== supplyId) return NextResponse.json({ error: "Request key sudah dipakai untuk profil supply lain" }, { status: 409 });
      const sameRequest = existing.project_name === projectName
        && existing.service_id === serviceId
        && existing.event_date === eventDate
        && existing.delivery_due_at === deliveryDueAtValue
        && existing.city === city
        && existing.scope_of_work === scopeOfWork
        && JSON.stringify(existing.deliverables ?? []) === JSON.stringify(deliverables)
        && Number(existing.agreed_fee) === agreedFee
        && existing.payment_terms === paymentTerms;
      if (!sameRequest) return NextResponse.json({ error: "Work Order untuk request ini sudah tersimpan dengan isi berbeda. Gunakan data yang sudah tercatat atau buat request baru." }, { status: 409 });
      return NextResponse.json({ ok: true, idempotent: true, engagement: existing });
    }

    const { data: supply, error: supplyError } = await supabase
      .from("talents")
      .select("id,name,supply_type,supply_service_ids,supply_other_service,status,onboarding_status")
      .eq("id", supplyId)
      .maybeSingle();
    if (supplyError) throw new Error(supplyError.message);
    if (!supply || !isNonTalent(supply.supply_type)) return NextResponse.json({ error: "Professional / Production Partner tidak ditemukan" }, { status: 404 });
    if (supply.status !== "verified" || supply.onboarding_status !== "approved") {
      return NextResponse.json({ error: "Profil harus disetujui sebelum menerima Work Order" }, { status: 409 });
    }
    const serviceIds = sanitizeSupplyServiceIds(supply.supply_type, supply.supply_service_ids);
    if (!serviceIds.includes(serviceId)) return NextResponse.json({ error: "Layanan tidak terdaftar pada profil ini" }, { status: 400 });

    const now = new Date();
    const reference = `WO-${now.getUTCFullYear()}-${randomUUID().slice(0, 8).toUpperCase()}`;
    const { data, error } = await supabase
      .from("supply_engagements")
      .insert({
        supply_id: supplyId,
        supply_type: supply.supply_type,
        request_key: requestKey,
        work_order_reference: reference,
        service_id: serviceId,
        supply_name_snapshot: supply.name?.trim() || "Supply Partner",
        service_label_snapshot: supplyServiceLabel(supply.supply_type, serviceId, supply.supply_other_service),
        project_name: projectName,
        event_date: eventDate,
        delivery_due_at: deliveryDueAtValue,
        city,
        scope_of_work: scopeOfWork,
        deliverables,
        agreed_fee: agreedFee,
        currency: "IDR",
        payment_terms: paymentTerms,
        status: "pending_confirmation",
        confirmation_requested_at: now.toISOString(),
      })
      .select("*")
      .single();
    if (tableMissing(error)) return NextResponse.json({ error: "Schema Engagement V1 belum diterapkan" }, { status: 503 });
    if (error?.code === "23505") {
      const { data: raced, error: racedError } = await supabase.from("supply_engagements").select("*").eq("request_key", requestKey).maybeSingle();
      if (racedError) throw new Error(racedError.message);
      if (raced?.supply_id === supplyId) return NextResponse.json({ ok: true, idempotent: true, engagement: raced });
    }
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true, engagement: data }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: "Gagal membuat Work Order", detail: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
