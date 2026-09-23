import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import { isRateCardServiceId, sanitizeSupplyServiceIds, type NonTalentSupplyType } from "@/lib/supply-onboarding";

export const runtime = "nodejs";

const PRICING_UNITS = new Set(["per_song", "per_hour", "per_session", "per_project"]);
const CARD_STATUSES = new Set(["draft", "active", "archived"]);

function getServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase server environment is not configured");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
function ensureAdmin(request: Request) { return process.env.VERCEL_ENV !== "production" || request.headers.get("x-ns-admin-verified") === "1"; }
function text(value: unknown, max: number) { return typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null; }
function optionalInt(value: unknown, min: number, max: number) {
  if (value === "" || value == null) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= min && parsed <= max ? parsed : undefined;
}
function tableMissing(error: { code?: string; message?: string } | null) {
  return error?.code === "42P01" || error?.code === "PGRST205" || /supply_service_rate_cards/i.test(error?.message ?? "");
}
function isProfessional(value: unknown): value is NonTalentSupplyType { return value === "professional"; }

export async function GET(request: Request) {
  try {
    if (!ensureAdmin(request)) return NextResponse.json({ error: "Tidak memiliki akses" }, { status: 401 });
    const supplyId = new URL(request.url).searchParams.get("supplyId") ?? "";
    if (!supplyId) return NextResponse.json({ error: "Profil supply wajib dipilih" }, { status: 400 });
    const { data, error } = await getServerClient().from("supply_service_rate_cards").select("*").eq("supply_id", supplyId).neq("status", "archived").order("service_id");
    if (tableMissing(error)) return NextResponse.json({ ok: true, ready: false, cards: [] });
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true, ready: true, cards: data ?? [] });
  } catch (error) {
    return NextResponse.json({ error: "Gagal memuat Rate Card", detail: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    if (!ensureAdmin(request)) return NextResponse.json({ error: "Tidak memiliki akses" }, { status: 401 });
    const body = await request.json().catch(() => null);
    const supplyId = text(body?.supplyId, 100);
    const serviceId = text(body?.serviceId, 100);
    const pricingUnit = text(body?.pricingUnit, 30);
    const startingFee = Number(body?.startingFee);
    const includedScope = text(body?.includedScope, 2000);
    const maximumTrackCount = optionalInt(body?.maximumTrackCount, 1, 500);
    const maximumStemCount = optionalInt(body?.maximumStemCount, 1, 100);
    const includedRevisions = optionalInt(body?.includedRevisions, 0, 10);
    const turnaroundDays = optionalInt(body?.turnaroundDays, 1, 90);
    const addOnPolicy = text(body?.addOnPolicy, 1200);
    const batchDiscountPolicy = text(body?.batchDiscountPolicy, 1200);
    const quoteRequiredConditions = text(body?.quoteRequiredConditions, 1200);
    const status = text(body?.status, 20);
    if (!supplyId || !isRateCardServiceId(serviceId) || !pricingUnit || !PRICING_UNITS.has(pricingUnit) || !Number.isSafeInteger(startingFee) || startingFee <= 0 || !includedScope || maximumTrackCount === undefined || maximumStemCount === undefined || includedRevisions === undefined || turnaroundDays === undefined || !quoteRequiredConditions || !status || !CARD_STATUSES.has(status)) {
      return NextResponse.json({ error: "Lengkapi layanan, harga mulai, scope, revisi, dan kondisi custom quote dengan data yang valid" }, { status: 400 });
    }
    const supabase = getServerClient();
    const { data: supply, error: supplyError } = await supabase.from("talents").select("id,supply_type,supply_service_ids,status,onboarding_status").eq("id", supplyId).maybeSingle();
    if (supplyError) throw new Error(supplyError.message);
    if (!supply || !isProfessional(supply.supply_type)) return NextResponse.json({ error: "Rate Card pilot hanya untuk Professional" }, { status: 409 });
    if (supply.status !== "verified" || supply.onboarding_status !== "approved") return NextResponse.json({ error: "Profil harus disetujui sebelum Rate Card disimpan" }, { status: 409 });
    if (!sanitizeSupplyServiceIds(supply.supply_type, supply.supply_service_ids).includes(serviceId)) return NextResponse.json({ error: "Layanan belum terdaftar pada profil ini" }, { status: 400 });
    const { data, error } = await supabase.from("supply_service_rate_cards").upsert({
      supply_id: supplyId, service_id: serviceId, currency: "IDR", pricing_unit: pricingUnit, starting_fee: startingFee,
      included_scope: includedScope, maximum_track_count: maximumTrackCount, maximum_stem_count: maximumStemCount,
      included_revisions: includedRevisions, turnaround_days: turnaroundDays, add_on_policy: addOnPolicy,
      batch_discount_policy: batchDiscountPolicy, quote_required_conditions: quoteRequiredConditions, status,
    }, { onConflict: "supply_id,service_id" }).select("*").single();
    if (tableMissing(error)) return NextResponse.json({ error: "Schema Rate Card belum diterapkan" }, { status: 503 });
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true, card: data });
  } catch (error) {
    return NextResponse.json({ error: "Gagal menyimpan Rate Card", detail: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
