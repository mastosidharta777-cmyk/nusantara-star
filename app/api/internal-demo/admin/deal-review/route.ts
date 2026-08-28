import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import { computeDealReview, type DealMilestone } from "@/lib/deal-copilot";

export const runtime = "nodejs";

function getServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) throw new Error("Supabase server environment is not configured");
  return createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

function optionalDate(value: unknown) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function numberOrNull(value: unknown) {
  return value === null || value === undefined ? null : Number(value);
}

function sameJson(a: unknown, b: unknown) {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const briefId = typeof body?.briefId === "string" ? body.briefId : "";
    const action = typeof body?.action === "string" ? body.action : "refresh";
    if (!briefId) return NextResponse.json({ error: "Invalid brief id" }, { status: 400 });

    const supabase = getServerClient();
    const { data: existing, error: existingError } = await supabase.from("deals").select("*").eq("brief_id", briefId).maybeSingle();
    if (existingError && existingError.code !== "42P01") throw new Error(existingError.message);

    if (["approve", "request_exception", "approve_exception", "lock"].includes(action)) {
      if (!existing) return NextResponse.json({ error: "Prepare the Deal Review first" }, { status: 409 });
      const now = new Date().toISOString();

      if (action === "request_exception") {
        const reason = typeof body?.reason === "string" ? body.reason.trim() : "";
        if (!reason) return NextResponse.json({ error: "Exception reason is required" }, { status: 400 });
        if (existing.status !== "review_required") return NextResponse.json({ error: "Only a deal under review can request an exception" }, { status: 409 });
        const { data: changed, error } = await supabase.from("deals").update({ exception_status: "requested", exception_reason: reason, updated_at: now }).eq("id", existing.id).eq("status", "review_required").select("id").maybeSingle();
        if (error) throw new Error(error.message);
        if (!changed) return NextResponse.json({ error: "Deal changed while requesting exception. Refresh and try again." }, { status: 409 });
        return NextResponse.json({ ok: true, status: "review_required", exceptionStatus: "requested" });
      }

      if (action === "approve_exception") {
        if (existing.status !== "review_required" || existing.exception_status !== "requested") return NextResponse.json({ error: "No exception is awaiting approval" }, { status: 409 });
        const { data: changed, error } = await supabase.from("deals").update({ exception_status: "approved", updated_at: now }).eq("id", existing.id).eq("status", "review_required").eq("exception_status", "requested").select("id").maybeSingle();
        if (error) throw new Error(error.message);
        if (!changed) return NextResponse.json({ error: "Deal changed while approving exception. Refresh and try again." }, { status: 409 });
        return NextResponse.json({ ok: true, exceptionStatus: "approved" });
      }

      if (["approve", "lock"].includes(action)) {
        const { data: offer, error: offerError } = await supabase.from("talent_offers").select("status,availability_status,quote_valid_until").eq("id", existing.talent_offer_id).single();
        if (offerError || !offer || offer.status !== "confirmed" || offer.availability_status !== "confirmed") return NextResponse.json({ error: "Talent offer is no longer confirmed. Reconfirm before continuing." }, { status: 409 });
        if (offer.quote_valid_until && new Date(offer.quote_valid_until).getTime() <= Date.now()) return NextResponse.json({ error: "Talent offer has expired. Reconfirm before continuing." }, { status: 409 });
      }

      if (action === "approve") {
        const hasBlocking = (existing.unresolved_issues?.length ?? 0) > 0 || existing.funding_gap_status !== "safe";
        if (hasBlocking && existing.exception_status !== "approved") return NextResponse.json({ error: "Deal masih memiliki unresolved issue/funding gap. Review Exception diperlukan." }, { status: 409 });
        const { data: changed, error } = await supabase.from("deals").update({ status: "approved", approved_at: now, updated_at: now }).eq("id", existing.id).eq("status", "review_required").select("id,status").maybeSingle();
        if (error) throw new Error(error.message);
        if (!changed) return NextResponse.json({ error: "Deal changed before approval. Refresh and try again." }, { status: 409 });
        return NextResponse.json({ ok: true, status: "approved" });
      }

      if (existing.status !== "approved") return NextResponse.json({ error: "Deal must be approved before it can be locked" }, { status: 409 });
      const { data: changed, error } = await supabase.from("deals").update({ status: "locked", locked_at: now, updated_at: now }).eq("id", existing.id).eq("status", "approved").select("id,status").maybeSingle();
      if (error) throw new Error(error.message);
      if (!changed) return NextResponse.json({ error: "Deal changed before lock. Refresh and try again." }, { status: 409 });
      return NextResponse.json({ ok: true, status: "locked" });
    }

    if (existing?.status === "locked") return NextResponse.json({ error: "Deal is locked and cannot be recalculated" }, { status: 409 });

    const [{ data: selection, error: selectionError }, { data: proposal, error: proposalError }, { data: brief, error: briefError }, { data: terms, error: termsError }] = await Promise.all([
      supabase.from("buyer_selections").select("talent_id,status").eq("brief_id", briefId).eq("status", "selected").single(),
      supabase.from("proposals").select("id,status").eq("brief_id", briefId).eq("status", "selected").order("version", { ascending: false }).limit(1).single(),
      supabase.from("briefs").select("id,event_date").eq("id", briefId).single(),
      supabase.from("commercial_terms").select("buyer_price,talent_payable,direct_costs,taxes_and_payment_fees,buyer_payment_schedule,talent_payment_schedule,cancellation_terms,rider_notes,special_conditions,status").eq("brief_id", briefId).maybeSingle(),
    ]);
    if (selectionError || !selection) return NextResponse.json({ error: "Buyer selection not found" }, { status: 409 });
    if (proposalError || !proposal) return NextResponse.json({ error: "Selected proposal not found" }, { status: 409 });
    if (briefError || !brief) return NextResponse.json({ error: "Brief not found" }, { status: 404 });
    if (termsError) throw new Error(termsError.message);

    const { data: item, error: itemError } = await supabase.from("proposal_items").select("id,talent_offer_id,talent_id,buyer_price").eq("proposal_id", proposal.id).eq("talent_id", selection.talent_id).single();
    if (itemError || !item) return NextResponse.json({ error: "Selected proposal item not found" }, { status: 409 });

    const { data: offer, error: offerError } = await supabase.from("talent_offers").select("id,event_fee,status,availability_status,quote_valid_until").eq("id", item.talent_offer_id).single();
    if (offerError || !offer || offer.status !== "confirmed" || offer.availability_status !== "confirmed") return NextResponse.json({ error: "Talent offer is not confirmed" }, { status: 409 });
    if (offer.quote_valid_until && new Date(offer.quote_valid_until).getTime() <= Date.now()) return NextResponse.json({ error: "Talent offer has expired. Reconfirm before preparing the Deal Review." }, { status: 409 });

    const buyerPrice = terms ? Number(terms.buyer_price) : Number(item.buyer_price);
    const talentPayable = terms ? Number(terms.talent_payable) : Number(offer.event_fee);
    const directCosts = terms ? numberOrNull(terms.direct_costs) : null;
    const taxesAndPaymentFees = terms ? numberOrNull(terms.taxes_and_payment_fees) : null;
    const buyerSchedule = (terms?.buyer_payment_schedule ?? []) as DealMilestone[];
    const talentSchedule = (terms?.talent_payment_schedule ?? []) as DealMilestone[];
    const bookingReferenceDate = optionalDate(body?.bookingReferenceDate) ?? existing?.booking_reference_date ?? null;
    const invoiceReferenceDate = optionalDate(body?.invoiceReferenceDate) ?? existing?.invoice_reference_date ?? null;
    const directCostDueDate = optionalDate(body?.directCostDueDate) ?? existing?.direct_cost_due_date ?? null;
    const taxFeeDueDate = optionalDate(body?.taxFeeDueDate) ?? existing?.tax_fee_due_date ?? null;

    const review = computeDealReview({ buyerPrice, talentPayable, directCosts, taxesAndPaymentFees, buyerSchedule, talentSchedule, eventDate: brief.event_date, bookingReferenceDate, invoiceReferenceDate, directCostDueDate, taxFeeDueDate });
    const issues = [...review.unresolvedIssues];
    if (buyerPrice !== Number(item.buyer_price)) issues.push("Buyer price berbeda dari proposal yang dipilih buyer");
    if (talentPayable !== Number(offer.event_fee)) issues.push("Talent payable berbeda dari confirmed talent offer");
    if (!terms?.cancellation_terms) issues.push("Cancellation term belum dikonfirmasi");
    const nextIssues = [...new Set(issues)];

    const riskStateUnchanged = Boolean(existing &&
      Number(existing.buyer_price) === buyerPrice &&
      Number(existing.talent_payable) === talentPayable &&
      numberOrNull(existing.direct_costs) === directCosts &&
      numberOrNull(existing.taxes_and_payment_fees) === taxesAndPaymentFees &&
      sameJson(existing.buyer_payment_schedule, buyerSchedule) &&
      sameJson(existing.talent_payment_schedule, talentSchedule) &&
      (existing.booking_reference_date ?? null) === bookingReferenceDate &&
      (existing.invoice_reference_date ?? null) === invoiceReferenceDate &&
      (existing.direct_cost_due_date ?? null) === directCostDueDate &&
      (existing.tax_fee_due_date ?? null) === taxFeeDueDate &&
      existing.funding_gap_status === review.fundingGapStatus &&
      numberOrNull(existing.funding_gap_amount) === review.fundingGapAmount &&
      sameJson(existing.unresolved_issues ?? [], nextIssues) &&
      (existing.cancellation_terms ?? null) === (terms?.cancellation_terms ?? null) &&
      (existing.rider_notes ?? null) === (terms?.rider_notes ?? null) &&
      (existing.special_conditions ?? null) === (terms?.special_conditions ?? null)
    );

    const preserveApproved = existing?.status === "approved" && riskStateUnchanged;
    const nextExceptionStatus = riskStateUnchanged ? existing?.exception_status ?? "none" : "none";
    const nextExceptionReason = riskStateUnchanged ? existing?.exception_reason ?? null : null;
    const now = new Date().toISOString();
    const payload = {
      brief_id: briefId,
      proposal_id: proposal.id,
      proposal_item_id: item.id,
      talent_offer_id: offer.id,
      talent_id: selection.talent_id,
      status: preserveApproved ? "approved" : "review_required",
      buyer_price: buyerPrice,
      talent_payable: talentPayable,
      direct_costs: directCosts,
      taxes_and_payment_fees: taxesAndPaymentFees,
      contribution: review.contribution,
      buyer_payment_schedule: buyerSchedule,
      talent_payment_schedule: talentSchedule,
      booking_reference_date: bookingReferenceDate,
      invoice_reference_date: invoiceReferenceDate,
      direct_cost_due_date: directCostDueDate,
      tax_fee_due_date: taxFeeDueDate,
      funding_gap_amount: review.fundingGapAmount,
      funding_gap_status: review.fundingGapStatus,
      unresolved_issues: nextIssues,
      cancellation_terms: terms?.cancellation_terms ?? null,
      rider_notes: terms?.rider_notes ?? null,
      special_conditions: terms?.special_conditions ?? null,
      exception_status: nextExceptionStatus,
      exception_reason: nextExceptionReason,
      approved_at: preserveApproved ? existing?.approved_at ?? now : null,
      locked_at: null,
      updated_at: now,
    };
    const { data: saved, error: saveError } = await supabase.from("deals").upsert(payload, { onConflict: "brief_id" }).select("id,status,funding_gap_status,funding_gap_amount,unresolved_issues,contribution,exception_status").single();
    if (saveError) throw new Error(saveError.message);
    return NextResponse.json({ ok: true, deal: saved });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown error";
    console.error("Deal review action failed", detail);
    return NextResponse.json({ error: "Deal review action failed", detail }, { status: 500 });
  }
}
