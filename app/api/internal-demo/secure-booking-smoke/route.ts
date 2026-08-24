import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) throw new Error("Supabase server environment is not configured");
  return createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

function futureDate(days: number) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

async function post(origin: string, path: string, body: Record<string, unknown>) {
  const response = await fetch(`${origin}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const json = await response.json().catch(() => null);
  return { response, json };
}

export async function GET(request: Request) {
  if (process.env.VERCEL_ENV === "production") return NextResponse.json({ error: "Not found" }, { status: 404 });

  const supabase = getServerClient();
  const origin = new URL(request.url).origin;
  let briefId: string | null = null;
  let talentId: string | null = null;

  try {
    const eventDate = futureDate(30);
    const now = new Date().toISOString();
    const marker = `SECURE-SMOKE-${Date.now()}`;

    const { data: talent, error: talentError } = await supabase.from("talents").insert({
      name: marker,
      category: "singer",
      genres: ["pop"],
      base_city: "Jakarta",
      service_cities: ["Jakarta"],
      performance_formats: ["solo"],
      event_types: ["corporate"],
      audience_tags: ["corporate"],
      budget_min: 10000000,
      budget_max: 15000000,
      status: "verified",
      public_visible: false,
    }).select("id").single();
    if (talentError || !talent) throw new Error(talentError?.message ?? "Talent insert failed");
    talentId = talent.id;

    const { data: brief, error: briefError } = await supabase.from("briefs").insert({
      event_type: "corporate",
      event_date: eventDate,
      city: "Jakarta",
      venue: "Secure Booking Smoke Venue",
      talent_category: "singer",
      status: "buyer_selected",
    }).select("id").single();
    if (briefError || !brief) throw new Error(briefError?.message ?? "Brief insert failed");
    briefId = brief.id;

    const { data: offer, error: offerError } = await supabase.from("talent_offers").insert({
      availability_request_id: (await supabase.from("availability_requests").insert({ brief_id: briefId, talent_id: talentId, status: "confirmed", responded_at: now }).select("id").single()).data?.id,
      brief_id: briefId,
      talent_id: talentId,
      status: "confirmed",
      availability_status: "confirmed",
      event_fee: 10000000,
      currency: "IDR",
      quote_valid_until: new Date(Date.now() + 7 * 86400000).toISOString(),
      confirmation_source: "manager_portal",
      confirmed_at: now,
    }).select("id").single();
    if (offerError || !offer) throw new Error(offerError?.message ?? "Offer insert failed");

    const { data: proposal, error: proposalError } = await supabase.from("proposals").insert({ brief_id: briefId, version: 1, status: "selected", sent_at: now }).select("id").single();
    if (proposalError || !proposal) throw new Error(proposalError?.message ?? "Proposal insert failed");

    const { data: item, error: itemError } = await supabase.from("proposal_items").insert({
      proposal_id: proposal.id,
      brief_id: briefId,
      talent_id: talentId,
      talent_offer_id: offer.id,
      buyer_price: 10000000,
      currency: "IDR",
      availability_status: "confirmed",
      talent_name_snapshot: marker,
      talent_category_snapshot: "singer",
      talent_base_city_snapshot: "Jakarta",
      talent_genres_snapshot: ["pop"],
    }).select("id").single();
    if (itemError || !item) throw new Error(itemError?.message ?? "Proposal item insert failed");

    const { error: selectionError } = await supabase.from("buyer_selections").insert({ brief_id: briefId, talent_id: talentId, status: "selected" });
    if (selectionError) throw new Error(selectionError.message);

    const buyerSchedule = [
      { milestone_type: "deposit", sequence_no: 1, calculation_type: "percentage", percentage: 30, amount: null, due_basis: "booking_date", due_offset_days: 0, custom_due_date: null },
      { milestone_type: "balance", sequence_no: 2, calculation_type: "remaining_balance", percentage: null, amount: null, due_basis: "event_date", due_offset_days: 0, custom_due_date: null },
    ];
    const talentSchedule = [
      { milestone_type: "full_payment", sequence_no: 1, calculation_type: "remaining_balance", percentage: null, amount: null, due_basis: "event_date", due_offset_days: 0, custom_due_date: null },
    ];

    const { data: deal, error: dealError } = await supabase.from("deals").insert({
      brief_id: briefId,
      proposal_id: proposal.id,
      proposal_item_id: item.id,
      talent_offer_id: offer.id,
      talent_id: talentId,
      status: "locked",
      buyer_price: 10000000,
      talent_payable: 10000000,
      direct_costs: 0,
      taxes_and_payment_fees: 0,
      contribution: 0,
      buyer_payment_schedule: buyerSchedule,
      talent_payment_schedule: talentSchedule,
      booking_reference_date: futureDate(1),
      funding_gap_amount: 0,
      funding_gap_status: "safe",
      talent_terms_status: "confirmed",
      buyer_terms_status: "recommended",
      unresolved_issues: [],
      exception_status: "none",
      locked_at: now,
    }).select("id").single();
    if (dealError || !deal) throw new Error(dealError?.message ?? "Deal insert failed");

    const create = await post(origin, "/api/internal-demo/admin/booking", { briefId, action: "create_booking" });
    if (!create.response.ok || create.json?.status !== "pending_security") throw new Error(`Pending security booking failed: ${JSON.stringify(create.json)}`);
    const bookingId = String(create.json.bookingId);

    const prematureSecure = await post(origin, "/api/internal-demo/admin/booking", { briefId, action: "secure_booking" });
    if (prematureSecure.response.ok) throw new Error("Booking secured before buyer terms/security were satisfied");

    const accept = await post(origin, "/api/internal-demo/admin/booking", { briefId, action: "accept_buyer_terms" });
    if (!accept.response.ok) throw new Error(`Buyer terms acceptance failed: ${JSON.stringify(accept.json)}`);

    const paymentCreate = await post(origin, "/api/internal-demo/admin/payment", { bookingId, action: "create_next_buyer_payment" });
    if (!paymentCreate.response.ok) throw new Error(`Initial payment creation failed: ${JSON.stringify(paymentCreate.json)}`);
    const payment = paymentCreate.json?.payment;
    if (Number(payment?.amount) !== 3000000) throw new Error(`Milestone amount is not 30%: ${JSON.stringify(paymentCreate.json)}`);

    const paid = await post(origin, "/api/internal-demo/admin/payment", { bookingId, action: "mark_paid", paymentId: payment.id });
    if (!paid.response.ok) throw new Error(`Payment confirmation failed: ${JSON.stringify(paid.json)}`);

    const secure = await post(origin, "/api/internal-demo/admin/booking", { briefId, action: "secure_booking" });
    if (!secure.response.ok || secure.json?.status !== "secured") throw new Error(`Secure booking failed: ${JSON.stringify(secure.json)}`);

    const { data: finalBooking, error: finalError } = await supabase.from("bookings").select("status,buyer_terms_accepted_at,financial_security_type,financial_security_status,secured_at").eq("id", bookingId).single();
    if (finalError || !finalBooking) throw new Error(finalError?.message ?? "Final booking read failed");

    return NextResponse.json({
      ok: true,
      checks: {
        buyerSelectedIsNotBooked: create.json.status === "pending_security",
        buyerTermsRequired: !prematureSecure.response.ok,
        noUniversalFiftyPercent: Number(payment.amount) === 3000000,
        milestoneDrivenPayment: paymentCreate.json?.source === "booking_payment_milestone",
        financialSecuritySatisfied: finalBooking.financial_security_status === "satisfied",
        secureBookingGate: finalBooking.status === "secured" && Boolean(finalBooking.buyer_terms_accepted_at) && Boolean(finalBooking.secured_at),
      },
      booking: finalBooking,
      cleanup: "automatic",
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown error";
    console.error("Secure booking smoke failed", detail);
    return NextResponse.json({ ok: false, error: "Secure booking smoke failed", detail }, { status: 500 });
  } finally {
    if (briefId) await supabase.from("briefs").delete().eq("id", briefId);
    if (talentId) await supabase.from("talents").delete().eq("id", talentId);
  }
}
