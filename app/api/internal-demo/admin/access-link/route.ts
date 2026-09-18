import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

import { commercialIntegrityReady } from "@/lib/commercial-integrity";
import { signAccessToken, type SignedAccessScope } from "@/lib/signed-access";
import { categoryAllowedForSupply, isSupplyType } from "@/lib/supply-onboarding";

export const runtime = "nodejs";

function getServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) throw new Error("Supabase server environment is not configured");
  return createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const allowedScopes: SignedAccessScope[] = ["buyer_proposal", "buyer_terms", "buyer_payment", "buyer_advance", "talent_advance", "buyer_pre_show", "talent_pre_show", "talent_offer", "talent_onboarding"];
    const scope = typeof body?.scope === "string" && allowedScopes.includes(body.scope as SignedAccessScope) ? body.scope as SignedAccessScope : null;
    const createNewTalent = scope === "talent_onboarding" && body?.createNewTalent === true;
    let subjectId = typeof body?.subjectId === "string" ? body.subjectId : "";
    if (!scope || (!subjectId && !createNewTalent)) return NextResponse.json({ error: "Invalid secure-link request" }, { status: 400 });

    if (process.env.VERCEL_ENV && request.headers.get("x-ns-admin-verified") !== "1") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = getServerClient();
    let path = "";
    let expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    if (createNewTalent) {
      const supplyType = isSupplyType(body?.supplyType) ? body.supplyType : null;
      const category = typeof body?.category === "string" ? body.category.trim() : "";
      if (!supplyType || (supplyType === "talent" && !categoryAllowedForSupply(supplyType, category))) {
        return NextResponse.json({ error: supplyType === "talent" ? "Pilih kategori Talent yang valid" : "Pilih jenis supply yang valid" }, { status: 400 });
      }
      subjectId = randomUUID();
      const { error } = await supabase.from("talents").insert({
        id: subjectId,
        name: "",
        // Non-talent services are selected by the registrant; category stays only as a legacy compatibility field.
        category: supplyType === "talent" ? category : "",
        supply_type: supplyType,
        status: "draft",
        onboarding_status: "not_started",
        public_visible: false,
      });
      if (error) throw new Error(error.message);
    }

    if (scope === "buyer_proposal") {
      const { data: proposal, error } = await supabase.from("proposals").select("brief_id,expires_at,status").eq("brief_id", subjectId).in("status", ["sent", "viewed", "selected"]).order("version", { ascending: false }).limit(1).maybeSingle();
      if (error) throw new Error(error.message);
      if (!proposal) return NextResponse.json({ error: "Buyer proposal is not available" }, { status: 409 });
      if (!proposal.expires_at) return NextResponse.json({ error: "Proposal validity is missing and must be regenerated" }, { status: 409 });
      const proposalExpiry = new Date(proposal.expires_at);
      if (!Number.isFinite(proposalExpiry.getTime()) || proposalExpiry.getTime() <= Date.now()) return NextResponse.json({ error: "Proposal has expired" }, { status: 409 });
      if (proposalExpiry < expiresAt) expiresAt = proposalExpiry;
      path = `/id/proposal/${encodeURIComponent(subjectId)}`;
    } else if (scope === "buyer_terms") {
      if (!(await commercialIntegrityReady(supabase))) {
        return NextResponse.json({ error: "Commercial integrity database cutover is not complete" }, { status: 503 });
      }
      const { data: booking, error: bookingError } = await supabase.from("bookings").select("id,deal_id,status,buyer_terms_accepted_at,buyer_terms_accepted_deal_id,buyer_terms_acceptance_source").eq("id", subjectId).maybeSingle();
      if (bookingError) throw new Error(bookingError.message);
      if (!booking || !booking.deal_id) return NextResponse.json({ error: "Booking is not available for buyer terms" }, { status: 404 });
      const validExistingAcceptance = Boolean(booking.buyer_terms_accepted_at && booking.buyer_terms_accepted_deal_id === booking.deal_id && booking.buyer_terms_acceptance_source === "signed_buyer_link");
      if (validExistingAcceptance) return NextResponse.json({ error: "Buyer terms have already been accepted" }, { status: 409 });
      if (booking.status !== "pending_security") return NextResponse.json({ error: "Booking is no longer awaiting buyer terms" }, { status: 409 });

      const { data: deal, error: dealError } = await supabase.from("deals").select("id,status,talent_offer_id,buyer_payment_schedule,cancellation_terms").eq("id", booking.deal_id).maybeSingle();
      if (dealError) throw new Error(dealError.message);
      if (!deal || deal.status !== "locked") return NextResponse.json({ error: "Deal must be locked before buyer terms are sent" }, { status: 409 });
      if (!Array.isArray(deal.buyer_payment_schedule) || deal.buyer_payment_schedule.length === 0 || !deal.cancellation_terms?.trim()) {
        return NextResponse.json({ error: "Buyer-facing payment and cancellation terms are incomplete" }, { status: 409 });
      }

      const { data: offer, error: offerError } = await supabase.from("talent_offers").select("status,availability_status,quote_valid_until").eq("id", deal.talent_offer_id).maybeSingle();
      if (offerError) throw new Error(offerError.message);
      if (!offer || offer.status !== "confirmed" || offer.availability_status !== "confirmed" || !offer.quote_valid_until) return NextResponse.json({ error: "Talent offer requires reconfirmation" }, { status: 409 });
      const offerExpiry = new Date(offer.quote_valid_until);
      if (!Number.isFinite(offerExpiry.getTime()) || offerExpiry.getTime() <= Date.now()) return NextResponse.json({ error: "Talent offer has expired" }, { status: 409 });
      if (offerExpiry < expiresAt) expiresAt = offerExpiry;
      path = `/id/terms/${encodeURIComponent(subjectId)}`;
    } else if (scope === "buyer_payment") {
      if (!(await commercialIntegrityReady(supabase))) {
        return NextResponse.json({ error: "Commercial integrity database cutover is not complete" }, { status: 503 });
      }
      const { data: payment, error: paymentError } = await supabase
        .from("payments")
        .select("id,booking_id,payment_type,status,request_reference,request_issued_at,request_due_date,request_snapshot,payment_instructions_snapshot")
        .eq("id", subjectId)
        .maybeSingle();
      if (paymentError) throw new Error(paymentError.message);
      if (!payment || !["buyer_deposit","buyer_balance","buyer_full_payment"].includes(payment.payment_type ?? "")) {
        return NextResponse.json({ error: "Buyer payment request is not available" }, { status: 404 });
      }
      if (!["pending","paid"].includes(payment.status) || !payment.request_reference || !payment.request_issued_at || !payment.request_due_date || !payment.request_snapshot || !payment.payment_instructions_snapshot) {
        return NextResponse.json({ error: "Payment request snapshot is incomplete" }, { status: 409 });
      }
      const { data: booking, error: bookingError } = await supabase
        .from("bookings")
        .select("id,deal_id,buyer_terms_accepted_at,buyer_terms_accepted_deal_id,buyer_terms_acceptance_source,buyer_terms_snapshot,buyer_terms_accepted_snapshot")
        .eq("id", payment.booking_id)
        .maybeSingle();
      if (bookingError) throw new Error(bookingError.message);
      const acceptanceValid = Boolean(
        booking?.deal_id
        && booking.buyer_terms_accepted_at
        && booking.buyer_terms_accepted_deal_id === booking.deal_id
        && booking.buyer_terms_acceptance_source === "signed_buyer_link"
        && booking.buyer_terms_snapshot
        && JSON.stringify(booking.buyer_terms_accepted_snapshot ?? null) === JSON.stringify(booking.buyer_terms_snapshot)
      );
      if (!acceptanceValid) return NextResponse.json({ error: "Buyer terms acceptance is not valid for this payment request" }, { status: 409 });
      expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      path = `/id/payment/${encodeURIComponent(subjectId)}`;
    } else if (scope === "buyer_advance" || scope === "talent_advance") {
      const { data: booking, error: bookingError } = await supabase
        .from("bookings")
        .select("id,status,event_date")
        .eq("id", subjectId)
        .maybeSingle();
      if (bookingError) throw new Error(bookingError.message);
      if (!booking || !["secured", "pre_show"].includes(booking.status)) {
        return NextResponse.json({ error: "Show Advance is available only for an active secured booking" }, { status: 409 });
      }
      const eventEnd = new Date(`${booking.event_date}T23:59:59+07:00`);
      const sevenDays = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      expiresAt = Number.isFinite(eventEnd.getTime()) && eventEnd < sevenDays ? eventEnd : sevenDays;
      path = scope === "buyer_advance"
        ? `/id/advance/buyer/${encodeURIComponent(subjectId)}`
        : `/id/advance/talent/${encodeURIComponent(subjectId)}`;
    } else if (scope === "buyer_pre_show" || scope === "talent_pre_show") {
      const { data: booking, error: bookingError } = await supabase
        .from("bookings")
        .select("id,status,event_date")
        .eq("id", subjectId)
        .maybeSingle();
      if (bookingError) throw new Error(bookingError.message);
      if (!booking || booking.status !== "pre_show") {
        return NextResponse.json({ error: "Pre-show workspace is available only after the checklist starts" }, { status: 409 });
      }

      const { data: advance, error: advanceError } = await supabase
        .from("booking_advances")
        .select("revision_no,status,confirmed_revision_no,confirmed_at")
        .eq("booking_id", subjectId)
        .maybeSingle();
      if (advanceError) throw new Error(advanceError.message);
      if (!advance || advance.status !== "confirmed" || advance.confirmed_revision_no !== advance.revision_no || !advance.confirmed_at) {
        return NextResponse.json({ error: "Current Show Advance requires confirmation before pre-show access" }, { status: 409 });
      }

      const eventEnd = new Date(`${booking.event_date}T23:59:59+07:00`);
      const sevenDays = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      expiresAt = Number.isFinite(eventEnd.getTime()) && eventEnd < sevenDays ? eventEnd : sevenDays;
      path = scope === "buyer_pre_show"
        ? `/id/pre-show/buyer/${encodeURIComponent(subjectId)}`
        : `/id/pre-show/talent/${encodeURIComponent(subjectId)}`;
    } else if (scope === "talent_offer") {
      const { data: row, error } = await supabase.from("availability_requests").select("id").eq("id", subjectId).maybeSingle();
      if (error) throw new Error(error.message);
      if (!row) return NextResponse.json({ error: "Availability request not found" }, { status: 404 });
      path = `/talent-confirmation/${encodeURIComponent(subjectId)}`;
    } else {
      const { data: talent, error } = await supabase.from("talents").select("id,status,supply_type").eq("id", subjectId).maybeSingle();
      if (error) throw new Error(error.message);
      if (!talent || talent.status === "inactive") return NextResponse.json({ error: "Profil tidak tersedia untuk onboarding" }, { status: 404 });
      expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      path = `/talent-onboarding/${encodeURIComponent(subjectId)}`;
    }

    const token = signAccessToken(scope, subjectId, expiresAt);
    const origin = new URL(request.url).origin;
    return NextResponse.json({ ok: true, url: `${origin}${path}?token=${encodeURIComponent(token)}`, expiresAt: expiresAt.toISOString() });
  } catch (error) {
    return NextResponse.json({ error: "Secure link creation failed", detail: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
