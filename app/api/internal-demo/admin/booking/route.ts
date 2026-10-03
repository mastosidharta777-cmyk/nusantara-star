import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import { commercialIntegrityReady } from "@/lib/commercial-integrity";
import { bookingCreationReady, bookingReservationSecurityReady } from "@/lib/booking-reservation-readiness";
import { requiredInitialBuyerSecurity, type BuyerMilestone } from "@/lib/secure-booking";

export const runtime = "nodejs";

const BUYER_PAYMENT_TYPES = ["buyer_deposit", "buyer_balance", "buyer_full_payment"];

function sameJson(a: unknown, b: unknown) {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

function getServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) throw new Error("Supabase server environment is not configured");
  return createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const briefId = typeof body?.briefId === "string" ? body.briefId : "";
    const action = typeof body?.action === "string" ? body.action : "create_booking";
    if (!briefId) return NextResponse.json({ error: "Missing briefId" }, { status: 400 });

    const supabase = getServerClient();
    const { data: existing, error: existingError } = await supabase
      .from("bookings")
      .select("id,brief_id,deal_id,status,buyer_price,buyer_terms_accepted_at,buyer_terms_accepted_deal_id,buyer_terms_acceptance_source,buyer_terms_snapshot,buyer_terms_accepted_snapshot,financial_security_type,financial_security_status,financial_security_reference")
      .eq("brief_id", briefId)
      .maybeSingle();
    if (existingError) throw new Error(existingError.message);

    if (action === "create_booking") {
      if (!(await bookingCreationReady(supabase))) {
        return NextResponse.json({ error: "Pembuatan booking dengan reservasi belum tersedia" }, { status: 503 });
      }
      if (process.env.VERCEL_ENV && request.headers.get("x-ns-admin-verified") !== "1") {
        return NextResponse.json({ error: "Verified admin identity is required" }, { status: 401 });
      }
      const reviewer = request.headers.get("x-ns-admin-user")?.trim()
        || (!process.env.VERCEL_ENV ? "local-development-admin" : "");
      const travelSummary = typeof body?.travelSummary === "string" ? body.travelSummary.trim() : "";
      const nearbySummary = typeof body?.nearbySummary === "string" ? body.nearbySummary.trim() : "";
      const expectedDealId = typeof body?.dealId === "string" ? body.dealId : "";
      const cutoff = typeof body?.holdExpiresAt === "string" ? body.holdExpiresAt : "";
      if (!reviewer) return NextResponse.json({ error: "Verified admin identity is required" }, { status: 401 });
      if (!expectedDealId || body?.reviewConfirmed !== "true" || travelSummary.length < 10 || nearbySummary.length < 10
        || !Number.isFinite(Date.parse(cutoff)) || Date.parse(cutoff) <= Date.now()) {
        return NextResponse.json({ error: "Lengkapi pemeriksaan perjalanan, jadwal lain, dan batas waktu hold" }, { status: 400 });
      }
      const { data, error } = await supabase.rpc("ns_create_booking_with_hold_v1", {
        p_brief_id: briefId,
        p_expected_deal_id: expectedDealId,
        p_hold_expires_at: cutoff,
        p_travel_summary: travelSummary,
        p_nearby_commitments_summary: nearbySummary,
        p_reviewed_by: reviewer,
      });
      if (error) return NextResponse.json({ error: error.message }, { status: 409 });
      return NextResponse.json({ ok: true, ...data });
    }

    if (!existing) return NextResponse.json({ error: "Booking not found" }, { status: 404 });
    if (existing.status !== "pending_security") return NextResponse.json({ error: "Booking is not pending security" }, { status: 409 });

    if (action === "set_security") {
      const securityType = typeof body?.securityType === "string" ? body.securityType : "";
      const reference = typeof body?.reference === "string" ? body.reference.trim() : "";
      const approvedAmount = Number(body?.approvedAmount ?? 0);
      const evidenceNote = typeof body?.evidenceNote === "string" ? body.evidenceNote.trim() : "";
      if (!["approved_po_credit", "authorized_exception"].includes(securityType)) return NextResponse.json({ error: "Invalid manual financial security type" }, { status: 400 });
      if (!reference) return NextResponse.json({ error: "Manual financial security reference is required" }, { status: 409 });
      if (!Number.isSafeInteger(approvedAmount) || approvedAmount < 0 || (securityType === "approved_po_credit" && approvedAmount === 0)) {
        return NextResponse.json({ error: "Approved PO/credit amount is invalid" }, { status: 400 });
      }
      if (evidenceNote.length < 10) return NextResponse.json({ error: "Manual security evidence note is required" }, { status: 400 });
      if (!existing.buyer_terms_accepted_at
        || existing.buyer_terms_accepted_deal_id !== existing.deal_id
        || existing.buyer_terms_acceptance_source !== "signed_buyer_link"
        || !existing.buyer_terms_snapshot
        || !sameJson(existing.buyer_terms_accepted_snapshot, existing.buyer_terms_snapshot)) {
        return NextResponse.json({ error: "Buyer terms snapshot must be accepted before financial security is recorded" }, { status: 409 });
      }
      const { data: deal, error: dealError } = await supabase.from("deals").select("buyer_terms_status,exception_status").eq("id", existing.deal_id).single();
      if (dealError || !deal) return NextResponse.json({ error: "Deal not found" }, { status: 404 });
      if (deal.buyer_terms_status !== "accepted") return NextResponse.json({ error: "Buyer terms acceptance is not synchronized with the locked deal" }, { status: 409 });
      if (securityType === "authorized_exception" && deal.exception_status !== "approved") return NextResponse.json({ error: "Commercial exception is not approved" }, { status: 409 });
      if (!(await bookingReservationSecurityReady(supabase))) {
        return NextResponse.json({ error: "Reservation-backed booking security cutover is not complete" }, { status: 503 });
      }
      if (process.env.VERCEL_ENV && request.headers.get("x-ns-admin-verified") !== "1") {
        return NextResponse.json({ error: "Verified admin identity is required" }, { status: 401 });
      }
      const adminUser = request.headers.get("x-ns-admin-user")?.trim()
        || (!process.env.VERCEL_ENV ? "local-development-admin" : "");
      const adminRole = request.headers.get("x-ns-admin-role")?.trim()
        || (!process.env.VERCEL_ENV ? "admin" : "");
      if (!adminUser || !adminRole) return NextResponse.json({ error: "Verified admin identity is required" }, { status: 401 });
      const { data: result, error } = await supabase.rpc("ns_record_manual_booking_security_v1", {
        p_booking_id: existing.id,
        p_security_type: securityType,
        p_reference: reference,
        p_approved_amount: approvedAmount,
        p_evidence_note: evidenceNote,
        p_recorded_by: `${adminUser}:${adminRole}`,
      });
      if (error) return NextResponse.json({ error: error.message }, { status: 409 });
      return NextResponse.json({ ok: true, security: result });
    }

    if (action !== "secure_booking") return NextResponse.json({ error: "Invalid booking action" }, { status: 400 });
    if (!(await commercialIntegrityReady(supabase))) {
      return NextResponse.json({ error: "Commercial integrity database cutover is not complete" }, { status: 503 });
    }
    if (!(await bookingReservationSecurityReady(supabase))) {
      return NextResponse.json({ error: "Reservation-backed booking security cutover is not complete" }, { status: 503 });
    }

    const { data: acceptanceEvidence, error: acceptanceError } = await supabase
      .from("bookings")
      .select("buyer_terms_accepted_deal_id,buyer_terms_acceptance_source,buyer_terms_snapshot,buyer_terms_accepted_snapshot")
      .eq("id", existing.id)
      .single();
    if (acceptanceError || !acceptanceEvidence) return NextResponse.json({ error: "Buyer acceptance evidence is unavailable" }, { status: 503 });

    const { data: deal, error: dealError } = await supabase
      .from("deals")
      .select("status,funding_gap_status,talent_terms_status,buyer_terms_status,talent_offer_id,unresolved_issues,exception_status")
      .eq("id", existing.deal_id)
      .single();
    if (dealError || !deal) return NextResponse.json({ error: "Deal not found" }, { status: 404 });
    if (deal.status !== "locked") return NextResponse.json({ error: "Deal is not locked" }, { status: 409 });
    if (deal.talent_terms_status !== "confirmed") return NextResponse.json({ error: "Talent terms are unresolved" }, { status: 409 });
    const buyerAcceptanceValid = Boolean(
      existing.buyer_terms_accepted_at
      && acceptanceEvidence.buyer_terms_accepted_deal_id === existing.deal_id
      && acceptanceEvidence.buyer_terms_acceptance_source === "signed_buyer_link"
      && acceptanceEvidence.buyer_terms_snapshot
      && sameJson(acceptanceEvidence.buyer_terms_accepted_snapshot, acceptanceEvidence.buyer_terms_snapshot)
      && deal.buyer_terms_status === "accepted"
    );
    if (!buyerAcceptanceValid) return NextResponse.json({ error: "Buyer terms have not been accepted through a verified buyer link" }, { status: 409 });
    if (deal.funding_gap_status !== "safe") return NextResponse.json({ error: "Funding gap is unresolved" }, { status: 409 });
    const unresolvedIssues = Array.isArray(deal.unresolved_issues) ? deal.unresolved_issues : [];
    if (unresolvedIssues.length > 0 && deal.exception_status !== "approved") return NextResponse.json({ error: "Deal still has unresolved issues without an approved exception" }, { status: 409 });

    const { data: offer, error: offerError } = await supabase
      .from("talent_offers")
      .select("brief_id,talent_id,status,availability_status,quote_valid_until")
      .eq("id", deal.talent_offer_id)
      .single();
    if (offerError || !offer) return NextResponse.json({ error: "Talent offer not found" }, { status: 404 });
    if (offer.brief_id !== briefId || offer.status !== "confirmed" || offer.availability_status !== "confirmed" || !offer.quote_valid_until || new Date(offer.quote_valid_until).getTime() <= Date.now()) {
      return NextResponse.json({ error: "Talent offer requires reconfirmation" }, { status: 409 });
    }

    const [{ data: buyerMilestones, error: milestoneError }, { data: paidRows, error: paymentError }] = await Promise.all([
      supabase.from("payment_milestones").select("sequence_no,calculation_type,percentage,amount").eq("booking_id", existing.id).eq("party", "buyer").order("sequence_no"),
      supabase.from("payments").select("payment_type,amount,provider,provider_reference,evidence_key").eq("booking_id", existing.id).in("payment_type", BUYER_PAYMENT_TYPES).eq("status", "paid"),
    ]);
    if (milestoneError) throw new Error(milestoneError.message);
    if (paymentError) throw new Error(paymentError.message);
    if (!buyerMilestones?.length) return NextResponse.json({ error: "Buyer payment milestones are missing" }, { status: 409 });
    const buyerPrice = Number(existing.buyer_price ?? 0);
    if (buyerPrice <= 0) return NextResponse.json({ error: "Buyer price is invalid" }, { status: 409 });
    const requiredCashSecurity = requiredInitialBuyerSecurity(buyerMilestones as BuyerMilestone[], buyerPrice);
    if (requiredCashSecurity <= 0) return NextResponse.json({ error: "Initial buyer security amount is invalid" }, { status: 409 });
    const paidBuyerTotal = (paidRows ?? []).filter((row) => Boolean(row.provider?.trim()) && Boolean(row.provider_reference?.trim()) && Boolean(row.evidence_key?.trim())).reduce((sum, row) => sum + Number(row.amount ?? 0), 0);
    const manualSecuritySatisfied = existing.financial_security_status === "satisfied"
      && ["approved_po_credit", "authorized_exception"].includes(existing.financial_security_type ?? "")
      && Boolean(existing.financial_security_reference?.trim())
      && (existing.financial_security_type !== "authorized_exception" || deal.exception_status === "approved");
    if (!manualSecuritySatisfied && paidBuyerTotal < requiredCashSecurity) {
      return NextResponse.json({ error: "Initial buyer payment has not satisfied booking security" }, { status: 409 });
    }

    const { data: result, error: rpcError } = await supabase.rpc("ns_secure_booking_v1", { p_booking_id: existing.id });
    if (rpcError) return NextResponse.json({ error: "Booking could not be secured" }, { status: 409 });
    const row = Array.isArray(result) ? result[0] : result;
    return NextResponse.json({
      ok: true,
      bookingStatus: row?.booking_status ?? "secured",
      financialSecurityType: row?.financial_security_type ?? existing.financial_security_type,
      paidBuyerTotal: Number(row?.paid_buyer_total ?? paidBuyerTotal),
      source: "ns_secure_booking_v1",
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown error";
    console.error("Secure booking action failed", detail);
    return NextResponse.json({ error: "Secure booking action failed", detail }, { status: 500 });
  }
}
