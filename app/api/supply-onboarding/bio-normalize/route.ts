import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import { normalizeSupplyBio } from "@/lib/bio-normalization";
import { sanitizeSupplyDetails, sanitizeSupplyServiceIds, supplyServiceLabel, type NonTalentSupplyType } from "@/lib/supply-onboarding";
import { verifyAccessToken } from "@/lib/signed-access";
import { talentOnboardingEditConflict } from "@/lib/talent-onboarding-state";

export const runtime = "nodejs";

function getServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase server environment is not configured");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
function textArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean))).slice(0, 30);
}
function isNonTalent(value: unknown): value is NonTalentSupplyType {
  return value === "professional" || value === "production_partner";
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const supplyId = typeof body?.supplyId === "string" ? body.supplyId : "";
    const token = typeof body?.token === "string" ? body.token : "";
    if (!supplyId || !verifyAccessToken(token, "talent_onboarding", supplyId)) {
      return NextResponse.json({ error: "Tautan pendaftaran tidak valid atau sudah kedaluwarsa" }, { status: 401 });
    }
    const s = getServerClient();
    const { data: supply, error } = await s.from("talents").select("supply_type,status").eq("id", supplyId).maybeSingle();
    if (error) throw new Error(error.message);
    if (!supply || !isNonTalent(supply.supply_type) || supply.status === "inactive") {
      return NextResponse.json({ error: "Profil supply tidak ditemukan" }, { status: 404 });
    }
    const editConflict = await talentOnboardingEditConflict(s, supplyId);
    if (editConflict) return editConflict;

    const sourceText = text(body?.sourceText);
    if (!sourceText) return NextResponse.json({ error: "Profil singkat belum diisi" }, { status: 400 });
    if (sourceText.length > 12_000) return NextResponse.json({ error: "Profil singkat maksimal 12.000 karakter" }, { status: 400 });
    const serviceIds = sanitizeSupplyServiceIds(supply.supply_type, body?.serviceIds);
    const otherService = text(body?.otherService);
    const primaryServiceId = typeof body?.primaryServiceId === "string" && serviceIds.includes(body.primaryServiceId) ? body.primaryServiceId : null;
    const supplyDetails = sanitizeSupplyDetails(supply.supply_type, primaryServiceId, body?.supplyDetails);
    const bio = await normalizeSupplyBio({
      sourceText,
      supplyType: supply.supply_type,
      name: text(body?.name),
      baseCity: text(body?.baseCity),
      primaryServiceLabel: primaryServiceId ? supplyServiceLabel(supply.supply_type, primaryServiceId, otherService) : null,
      serviceLabels: serviceIds.map((id) => supplyServiceLabel(supply.supply_type, id, otherService)),
      serviceCities: textArray(body?.serviceCities),
      serviceFormats: textArray(body?.serviceFormats),
      capabilityTags: textArray(body?.capabilityTags),
      eventTypes: textArray(body?.eventTypes),
      supplyDetails,
    });
    return NextResponse.json({ ok: true, bio });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Gagal merapikan profil";
    console.error(JSON.stringify({ level: "error", message: "Supply bio normalization failed", route: "/api/supply-onboarding/bio-normalize", detail: message }));
    return NextResponse.json({ error: message }, { status: message.includes("dibatasi") ? 503 : 422 });
  }
}
