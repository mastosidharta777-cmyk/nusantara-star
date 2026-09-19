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
      .select("id,work_order_reference,service_label_snapshot,project_name,event_date,city,scope_of_work,deliverables,agreed_fee,currency,payment_terms,status,confirmation_requested_at,supplier_confirmed_at,supplier_declined_at,supplier_response_note,created_at")
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
    const projectName = text(body?.projectName, 200);
    const serviceId = text(body?.serviceId, 100);
    const scopeOfWork = text(body?.scopeOfWork, 6000);
    const paymentTerms = text(body?.paymentTerms, 2000);
    const city = text(body?.city, 200);
    const eventDate = /^\d{4}-\d{2}-\d{2}$/.test(body?.eventDate ?? "") ? body.eventDate : null;
    const agreedFee = Number(body?.agreedFee);
    const deliverables = Array.isArray(body?.deliverables)
      ? Array.from(new Set(body.deliverables.map((item: unknown) => text(item, 500)).filter((item: string | null): item is string => Boolean(item)))).slice(0, 30)
      : [];

    if (!supplyId || !projectName || !serviceId || !scopeOfWork || !paymentTerms || !Number.isSafeInteger(agreedFee) || agreedFee <= 0) {
      return NextResponse.json({ error: "Lengkapi proyek, layanan, scope, fee, dan termin pembayaran" }, { status: 400 });
    }
    if (!deliverables.length) return NextResponse.json({ error: "Minimal satu deliverable wajib dicatat" }, { status: 400 });

    const supabase = getServerClient();
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
        work_order_reference: reference,
        service_id: serviceId,
        supply_name_snapshot: supply.name?.trim() || "Supply Partner",
        service_label_snapshot: supplyServiceLabel(supply.supply_type, serviceId, supply.supply_other_service),
        project_name: projectName,
        event_date: eventDate,
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
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true, engagement: data }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: "Gagal membuat Work Order", detail: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
