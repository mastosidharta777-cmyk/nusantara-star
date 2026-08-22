import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function getServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) throw new Error("Supabase server environment is not configured");
  return createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

function parseAmount(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const amount = typeof value === "number" ? value : Number(value);
  return Number.isFinite(amount) ? amount : null;
}

export async function POST(request: Request) {
  if (process.env.VERCEL_ENV === "production") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const body = await request.json().catch(() => null);
    const briefId = typeof body?.briefId === "string" ? body.briefId : "";
    const talentId = typeof body?.talentId === "string" ? body.talentId : "";
    const buyerPrice = parseAmount(body?.buyerPrice);
    const talentPayable = parseAmount(body?.talentPayable);
    const directCosts = parseAmount(body?.directCosts ?? 0);
    const taxesAndPaymentFees = parseAmount(body?.taxesAndPaymentFees ?? 0);
    const status = body?.status === "agreed" ? "agreed" : "draft";

    if (
      !briefId ||
      !talentId ||
      buyerPrice === null ||
      talentPayable === null ||
      directCosts === null ||
      taxesAndPaymentFees === null ||
      buyerPrice < 0 ||
      talentPayable < 0 ||
      directCosts < 0 ||
      taxesAndPaymentFees < 0
    ) {
      return NextResponse.json({ error: "Invalid commercial terms payload" }, { status: 400 });
    }

    if (status === "agreed" && (buyerPrice <= 0 || talentPayable <= 0)) {
      return NextResponse.json({ error: "Buyer price and talent payable must be greater than zero before terms can be agreed" }, { status: 409 });
    }

    if (buyerPrice < talentPayable + directCosts + taxesAndPaymentFees) {
      return NextResponse.json({ error: "Buyer price must cover talent payable, direct costs, and taxes/payment fees" }, { status: 409 });
    }

    const supabase = getServerClient();
    const [{ data: brief, error: briefError }, { data: selection, error: selectionError }] = await Promise.all([
      supabase.from("briefs").select("id,status").eq("id", briefId).single(),
      supabase.from("buyer_selections").select("talent_id,status").eq("brief_id", briefId).eq("status", "selected").single(),
    ]);

    if (briefError || !brief) return NextResponse.json({ error: "Brief not found" }, { status: 404 });
    if (selectionError || !selection || selection.talent_id !== talentId) {
      return NextResponse.json({ error: "Talent is not the buyer-selected talent" }, { status: 409 });
    }
    if (!["buyer_selected", "terms_agreed"].includes(brief.status)) {
      return NextResponse.json({ error: "Brief is not ready for commercial terms" }, { status: 409 });
    }

    const now = new Date().toISOString();
    const { error: upsertError } = await supabase.from("commercial_terms").upsert(
      {
        brief_id: briefId,
        talent_id: talentId,
        buyer_price: buyerPrice,
        talent_payable: talentPayable,
        direct_costs: directCosts,
        taxes_and_payment_fees: taxesAndPaymentFees,
        payment_terms: typeof body?.paymentTerms === "string" ? body.paymentTerms : null,
        cancellation_terms: typeof body?.cancellationTerms === "string" ? body.cancellationTerms : null,
        notes: typeof body?.notes === "string" ? body.notes : null,
        status,
        agreed_at: status === "agreed" ? now : null,
        updated_at: now,
      },
      { onConflict: "brief_id" },
    );
    if (upsertError) throw new Error(upsertError.message);

    const nextStatus = status === "agreed" ? "terms_agreed" : "buyer_selected";
    const { error: briefUpdateError } = await supabase.from("briefs").update({ status: nextStatus }).eq("id", briefId);
    if (briefUpdateError) throw new Error(briefUpdateError.message);

    return NextResponse.json({ ok: true, briefId, talentId, status, briefStatus: nextStatus });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown error";
    console.error("Commercial terms action failed", detail);
    return NextResponse.json({ error: "Commercial terms action failed", detail }, { status: 500 });
  }
}
