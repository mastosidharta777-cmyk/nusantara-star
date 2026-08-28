import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import { POST as dealReview } from "@/app/api/internal-demo/admin/deal-review/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) throw new Error("Supabase server environment is not configured");
  return createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function call(body: Record<string, unknown>) {
  const response = await dealReview(new Request("http://internal/api/internal-demo/admin/deal-review", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }));
  return { response, body: await response.json().catch(() => null) };
}

export async function GET() {
  if (process.env.VERCEL_ENV === "production") return NextResponse.json({ error: "Not found" }, { status: 404 });
  const supabase = getServerClient();
  let talentId = "";
  let briefId = "";

  try {
    const stamp = Date.now();
    const eventDate = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
    const bookingDate = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    const quoteValidUntil = new Date(Date.now() + 7 * 86400000).toISOString();

    const { data: talent, error: talentError } = await supabase.from("talents").insert({ name: `Deal Smoke ${stamp}`, category: "singer", status: "curated" }).select("id").single();
    if (talentError || !talent) throw new Error(talentError?.message ?? "Talent seed failed");
    talentId = talent.id;

    const { data: brief, error: briefError } = await supabase.from("briefs").insert({ event_type: "Deal Smoke", event_date: eventDate, city: "Jakarta", talent_category: "singer", status: "buyer_selected" }).select("id").single();
    if (briefError || !brief) throw new Error(briefError?.message ?? "Brief seed failed");
    briefId = brief.id;

    const { data: requestRow, error: requestError } = await supabase.from("availability_requests").insert({ brief_id: briefId, talent_id: talentId, status: "confirmed", responded_at: new Date().toISOString() }).select("id").single();
    if (requestError || !requestRow) throw new Error(requestError?.message ?? "Availability seed failed");

    const { data: offer, error: offerError } = await supabase.from("talent_offers").insert({ availability_request_id: requestRow.id, brief_id: briefId, talent_id: talentId, status: "confirmed", availability_status: "confirmed", event_fee: 10000000, currency: "IDR", quote_valid_until: quoteValidUntil, confirmation_source: "manager_portal", confirmed_at: new Date().toISOString() }).select("id").single();
    if (offerError || !offer) throw new Error(offerError?.message ?? "Offer seed failed");

    const { data: proposal, error: proposalError } = await supabase.from("proposals").insert({ brief_id: briefId, version: 1, status: "selected", expires_at: quoteValidUntil, sent_at: new Date().toISOString() }).select("id").single();
    if (proposalError || !proposal) throw new Error(proposalError?.message ?? "Proposal seed failed");

    const { data: item, error: itemError } = await supabase.from("proposal_items").insert({ proposal_id: proposal.id, brief_id: briefId, talent_id: talentId, talent_offer_id: offer.id, buyer_price: 12000000, currency: "IDR", availability_status: "confirmed", talent_name_snapshot: `Deal Smoke ${stamp}`, talent_category_snapshot: "singer", talent_genres_snapshot: [], match_score_snapshot: 95, match_tier_snapshot: "strong_match" }).select("id").single();
    if (itemError || !item) throw new Error(itemError?.message ?? "Proposal item seed failed");

    const { error: selectionError } = await supabase.from("buyer_selections").insert({ brief_id: briefId, talent_id: talentId, status: "selected", selected_at: new Date().toISOString(), updated_at: new Date().toISOString() });
    if (selectionError) throw new Error(selectionError.message);

    const incompleteBuyer = [{ milestone_type: "deposit", sequence_no: 1, calculation_type: "percentage", percentage: 50, amount: null, due_basis: "booking_date", due_offset_days: 0, custom_due_date: null }];
    const completeBuyer = [
      { milestone_type: "deposit", sequence_no: 1, calculation_type: "percentage", percentage: 50, amount: null, due_basis: "booking_date", due_offset_days: 0, custom_due_date: null },
      { milestone_type: "balance", sequence_no: 2, calculation_type: "remaining_balance", percentage: null, amount: null, due_basis: "event_date", due_offset_days: 0, custom_due_date: null },
    ];
    const completeTalent = [{ milestone_type: "full_payment", sequence_no: 1, calculation_type: "remaining_balance", percentage: null, amount: null, due_basis: "event_date", due_offset_days: 0, custom_due_date: null }];

    const { error: termsError } = await supabase.from("commercial_terms").insert({ brief_id: briefId, talent_id: talentId, buyer_price: 12000000, talent_payable: 10000000, direct_costs: 0, taxes_and_payment_fees: 0, buyer_payment_schedule: incompleteBuyer, talent_payment_schedule: completeTalent, cancellation_terms: "Smoke cancellation terms", status: "draft" });
    if (termsError) throw new Error(termsError.message);

    const incomplete = await call({ briefId, action: "refresh", bookingReferenceDate: bookingDate });
    if (!incomplete.response.ok) throw new Error(incomplete.body?.detail ?? incomplete.body?.error ?? "Incomplete review failed");
    const incompleteScheduleBlocked = incomplete.body?.deal?.funding_gap_status === "unknown" && Array.isArray(incomplete.body?.deal?.unresolved_issues) && incomplete.body.deal.unresolved_issues.some((issue: string) => issue.includes("100%"));
    const approveIncomplete = await call({ briefId, action: "approve" });
    const incompleteApprovalRejected = approveIncomplete.response.status === 409;

    const { error: termsUpdateError } = await supabase.from("commercial_terms").update({ buyer_payment_schedule: completeBuyer }).eq("brief_id", briefId);
    if (termsUpdateError) throw new Error(termsUpdateError.message);
    const complete = await call({ briefId, action: "refresh", bookingReferenceDate: bookingDate });
    if (!complete.response.ok) throw new Error(complete.body?.detail ?? complete.body?.error ?? "Complete review failed");
    const completeReviewSafe = complete.body?.deal?.funding_gap_status === "safe" && (complete.body?.deal?.unresolved_issues?.length ?? 0) === 0;

    const requested = await call({ briefId, action: "request_exception", reason: "Smoke exception" });
    if (!requested.response.ok) throw new Error(requested.body?.detail ?? requested.body?.error ?? "Exception request failed");
    const unchangedRefresh = await call({ briefId, action: "refresh", bookingReferenceDate: bookingDate });
    const exceptionPreservedOnUnchangedRefresh = unchangedRefresh.response.ok && unchangedRefresh.body?.deal?.exception_status === "requested";

    const changedBookingDate = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
    const changedRefresh = await call({ briefId, action: "refresh", bookingReferenceDate: changedBookingDate });
    const exceptionResetOnRiskChange = changedRefresh.response.ok && changedRefresh.body?.deal?.exception_status === "none";

    const approved = await call({ briefId, action: "approve" });
    if (!approved.response.ok) throw new Error(approved.body?.detail ?? approved.body?.error ?? "Deal approval failed");
    const { error: expireError } = await supabase.from("talent_offers").update({ quote_valid_until: new Date(Date.now() - 86400000).toISOString() }).eq("id", offer.id);
    if (expireError) throw new Error(expireError.message);
    const expiredLock = await call({ briefId, action: "lock" });
    const expiredOfferBlocksLock = expiredLock.response.status === 409;

    const { error: restoreError } = await supabase.from("talent_offers").update({ quote_valid_until: quoteValidUntil }).eq("id", offer.id);
    if (restoreError) throw new Error(restoreError.message);
    const locked = await call({ briefId, action: "lock" });
    const lockAfterValidOffer = locked.response.ok && locked.body?.status === "locked";

    return NextResponse.json({
      ok: incompleteScheduleBlocked && incompleteApprovalRejected && completeReviewSafe && exceptionPreservedOnUnchangedRefresh && exceptionResetOnRiskChange && expiredOfferBlocksLock && lockAfterValidOffer,
      checks: { incompleteScheduleBlocked, incompleteApprovalRejected, completeReviewSafe, exceptionPreservedOnUnchangedRefresh, exceptionResetOnRiskChange, expiredOfferBlocksLock, lockAfterValidOffer },
      cleanup: "automatic",
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  } finally {
    if (briefId) await supabase.from("briefs").delete().eq("id", briefId);
    if (talentId) await supabase.from("talents").delete().eq("id", talentId);
  }
}
