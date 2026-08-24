import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function db() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase server environment is not configured");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function GET() {
  if (process.env.VERCEL_ENV === "production") return NextResponse.json({ error: "Not found" }, { status: 404 });
  const supabase = db();
  let talentId: string | null = null;
  let briefId: string | null = null;
  try {
    const eventDate = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
    const now = new Date().toISOString();
    const validUntil = new Date(Date.now() + 7 * 86400000).toISOString();

    const { data: talent, error: talentError } = await supabase.from("talents").insert({ name: `BOOKING-SMOKE-${Date.now()}`, category: "singer", status: "verified", public_visible: false }).select("id").single();
    if (talentError || !talent) throw new Error(talentError?.message ?? "talent insert failed");
    talentId = talent.id;
    const { data: brief, error: briefError } = await supabase.from("briefs").insert({ event_type: "corporate", event_date: eventDate, city: "Jakarta", talent_category: "singer", status: "buyer_selected" }).select("id").single();
    if (briefError || !brief) throw new Error(briefError?.message ?? "brief insert failed");
    briefId = brief.id;
    const { data: match, error: matchError } = await supabase.from("match_results").insert({ brief_id: briefId, talent_id: talentId, score: 90, tier: "strong_match", admin_approved: true }).select("id").single();
    if (matchError || !match) throw new Error(matchError?.message ?? "match insert failed");
    const { data: request, error: requestError } = await supabase.from("availability_requests").insert({ brief_id: briefId, talent_id: talentId, match_result_id: match.id, status: "confirmed", responded_at: now }).select("id").single();
    if (requestError || !request) throw new Error(requestError?.message ?? "request insert failed");
    const { data: offer, error: offerError } = await supabase.from("talent_offers").insert({ availability_request_id: request.id, brief_id: briefId, talent_id: talentId, status: "confirmed", availability_status: "confirmed", event_fee: 10000000, currency: "IDR", quote_valid_until: validUntil, confirmed_at: now }).select("id").single();
    if (offerError || !offer) throw new Error(offerError?.message ?? "offer insert failed");
    const { data: proposal, error: proposalError } = await supabase.from("proposals").insert({ brief_id: briefId, version: 1, status: "selected", sent_at: now }).select("id").single();
    if (proposalError || !proposal) throw new Error(proposalError?.message ?? "proposal insert failed");
    const { data: item, error: itemError } = await supabase.from("proposal_items").insert({ proposal_id: proposal.id, brief_id: briefId, talent_id: talentId, talent_offer_id: offer.id, buyer_price: 12000000, currency: "IDR", availability_status: "confirmed", talent_name_snapshot: "Booking Smoke", talent_category_snapshot: "singer" }).select("id").single();
    if (itemError || !item) throw new Error(itemError?.message ?? "proposal item insert failed");
    const { error: selectionError } = await supabase.from("buyer_selections").insert({ brief_id: briefId, talent_id: talentId, status: "selected", selected_at: now });
    if (selectionError) throw new Error(selectionError.message);
    const buyerSchedule = [{ milestone_type: "deposit", sequence_no: 1, calculation_type: "percentage", percentage: 30, amount: null, due_basis: "booking_date", due_offset_days: 0, custom_due_date: null }, { milestone_type: "balance", sequence_no: 2, calculation_type: "remaining_balance", percentage: null, amount: null, due_basis: "event_date", due_offset_days: -3, custom_due_date: null }];
    const talentSchedule = [{ milestone_type: "full_payment", sequence_no: 1, calculation_type: "remaining_balance", percentage: null, amount: null, due_basis: "event_date", due_offset_days: 0, custom_due_date: null }];
    const { data: deal, error: dealError } = await supabase.from("deals").insert({ brief_id: briefId, proposal_id: proposal.id, proposal_item_id: item.id, talent_offer_id: offer.id, talent_id: talentId, status: "locked", buyer_price: 12000000, talent_payable: 10000000, direct_costs: 0, taxes_and_payment_fees: 0, contribution: 2000000, buyer_payment_schedule: buyerSchedule, talent_payment_schedule: talentSchedule, booking_reference_date: eventDate, funding_gap_amount: 0, funding_gap_status: "safe", talent_terms_status: "confirmed", buyer_terms_status: "recommended", unresolved_issues: [], locked_at: now }).select("id").single();
    if (dealError || !deal) throw new Error(dealError?.message ?? "deal insert failed");

    const { data: booking, error: bookingError } = await supabase.from("bookings").insert({ brief_id: briefId, deal_id: deal.id, talent_id: talentId, event_date: eventDate, city: "Jakarta", buyer_price: 12000000, talent_payable: 10000000, status: "pending_security", financial_security_status: "pending" }).select("id,status").single();
    if (bookingError || !booking) throw new Error(bookingError?.message ?? "booking insert failed");
    const { data: stillSelected } = await supabase.from("briefs").select("status").eq("id", briefId).single();
    if (stillSelected?.status === "booked") throw new Error("Buyer Selected incorrectly became Booked");

    const acceptedAt = new Date().toISOString();
    const { error: acceptBookingError } = await supabase.from("bookings").update({ buyer_terms_accepted_at: acceptedAt }).eq("id", booking.id);
    if (acceptBookingError) throw new Error(acceptBookingError.message);
    const { error: acceptDealError } = await supabase.from("deals").update({ buyer_terms_status: "accepted" }).eq("id", deal.id);
    if (acceptDealError) throw new Error(acceptDealError.message);
    const { error: securityError } = await supabase.from("bookings").update({ financial_security_type: "approved_po_credit", financial_security_status: "satisfied", financial_security_reference: "SMOKE-PO-001" }).eq("id", booking.id);
    if (securityError) throw new Error(securityError.message);

    const { data: gateBooking } = await supabase.from("bookings").select("buyer_terms_accepted_at,financial_security_status").eq("id", booking.id).single();
    const { data: gateDeal } = await supabase.from("deals").select("status,funding_gap_status,talent_terms_status,buyer_terms_status").eq("id", deal.id).single();
    const canSecure = Boolean(gateBooking?.buyer_terms_accepted_at && gateBooking.financial_security_status === "satisfied" && gateDeal?.status === "locked" && gateDeal.funding_gap_status === "safe" && gateDeal.talent_terms_status === "confirmed" && gateDeal.buyer_terms_status === "accepted");
    if (!canSecure) throw new Error("Secure booking gate failed");

    const securedAt = new Date().toISOString();
    const { data: secured, error: secureError } = await supabase.from("bookings").update({ status: "secured", secured_at: securedAt }).eq("id", booking.id).eq("status", "pending_security").select("status,financial_security_type").single();
    if (secureError || secured?.status !== "secured") throw new Error(secureError?.message ?? "booking not secured");
    const { error: briefBookedError } = await supabase.from("briefs").update({ status: "booked" }).eq("id", briefId).eq("status", "buyer_selected");
    if (briefBookedError) throw new Error(briefBookedError.message);

    return NextResponse.json({ ok: true, checks: { buyerSelectedNotBooked: true, buyerTermsAccepted: true, financialSecuritySatisfied: true, noUniversalDeposit: buyerSchedule[0].percentage === 30, secureBookingGate: true, bookingStateMachine: secured.status === "secured" }, booking: { status: secured.status, securityType: secured.financial_security_type }, cleanup: "automatic" });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ ok: false, error: "Booking smoke failed", detail }, { status: 500 });
  } finally {
    if (briefId) await supabase.from("briefs").delete().eq("id", briefId);
    if (talentId) await supabase.from("talents").delete().eq("id", talentId);
  }
}
