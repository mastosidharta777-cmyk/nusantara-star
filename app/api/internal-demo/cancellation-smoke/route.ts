import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function getServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) throw new Error("Supabase server environment is not configured");
  return createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function GET() {
  if (process.env.VERCEL_ENV === "production") return NextResponse.json({ error: "Not found" }, { status: 404 });
  const supabase = getServerClient();
  const stamp = Date.now();
  let talentId = "";
  let briefId = "";
  let bookingId = "";
  let paymentId = "";
  let settlementId = "";
  let caseId = "";

  try {
    const { data: talent, error: talentError } = await supabase.from("talents").insert({ name: `Cancel Smoke ${stamp}`, category: "singer", status: "curated" }).select("id").single();
    if (talentError || !talent) throw new Error(talentError?.message ?? "Talent seed failed");
    talentId = talent.id;

    const eventDate = new Date(Date.now() + 20 * 86400000).toISOString().slice(0, 10);
    const { data: brief, error: briefError } = await supabase.from("briefs").insert({ event_type: "Cancellation Smoke", event_date: eventDate, city: "Jakarta", talent_category: "singer", status: "booked" }).select("id").single();
    if (briefError || !brief) throw new Error(briefError?.message ?? "Brief seed failed");
    briefId = brief.id;

    const { data: booking, error: bookingError } = await supabase.from("bookings").insert({ brief_id: briefId, talent_id: talentId, event_date: eventDate, city: "Jakarta", talent_payable: 1000000, buyer_price: 1200000, status: "secured", financial_security_status: "satisfied", financial_security_type: "full_payment_received", secured_at: new Date().toISOString() }).select("id").single();
    if (bookingError || !booking) throw new Error(bookingError?.message ?? "Booking seed failed");
    bookingId = booking.id;

    const buyerProvider = "smoke-bank";
    const buyerReference = `buyer-${stamp}`;
    const { data: payment, error: paymentError } = await supabase.from("payments").insert({ booking_id: bookingId, payment_type: "buyer_full_payment", amount: 1200000, provider: buyerProvider, provider_reference: buyerReference, evidence_key: `${buyerProvider}:${buyerReference}`.toLowerCase(), status: "paid", paid_at: new Date().toISOString(), idempotency_key: `cancel-smoke-buyer-${stamp}` }).select("id").single();
    if (paymentError || !payment) throw new Error(paymentError?.message ?? "Buyer payment seed failed");
    paymentId = payment.id;

    const settlement = await supabase.rpc("ns_record_talent_settlement_v1", { p_booking_id: bookingId, p_amount: 1000000, p_provider: "smoke", p_provider_reference: `talent-${stamp}`, p_idempotency_key: `cancel-smoke-talent-${stamp}`, p_paid_at: new Date().toISOString(), p_notes: "cancellation smoke" });
    if (settlement.error) throw new Error(settlement.error.message);
    settlementId = Array.isArray(settlement.data) ? settlement.data[0]?.id : settlement.data?.id;
    if (!settlementId) {
      const { data: row } = await supabase.from("talent_settlements").select("id").eq("idempotency_key", `cancel-smoke-talent-${stamp}`).single();
      settlementId = row?.id ?? "";
    }
    if (!settlementId) throw new Error("Settlement ID missing");

    const approved = await supabase.rpc("ns_approve_cancellation_v1", {
      p_booking_id: bookingId,
      p_initiated_by: "buyer",
      p_reason: "Smoke cancellation",
      p_buyer_refund_amount: 400000,
      p_talent_due_amount: 800000,
      p_decision_notes: "Smoke approved terms",
      p_idempotency_key: `cancel-smoke-case-${stamp}`,
    });
    if (approved.error) throw new Error(approved.error.message);
    caseId = Array.isArray(approved.data) ? approved.data[0]?.id : approved.data?.id;
    if (!caseId) {
      const { data: row } = await supabase.from("cancellation_cases").select("id").eq("idempotency_key", `cancel-smoke-case-${stamp}`).single();
      caseId = row?.id ?? "";
    }
    if (!caseId) throw new Error("Cancellation case ID missing");

    const earlyRefund = await supabase.rpc("ns_record_buyer_refund_v1", {
      p_case_id: caseId,
      p_payment_id: paymentId,
      p_amount: 400000,
      p_provider: "smoke",
      p_provider_reference: `refund-early-${stamp}`,
      p_idempotency_key: `cancel-smoke-refund-early-${stamp}`,
      p_refunded_at: new Date().toISOString(),
      p_notes: "must fail before talent reversal",
    });
    const unsafeRefundBlocked = Boolean(earlyRefund.error);
    if (!unsafeRefundBlocked) throw new Error("Unsafe buyer refund was not blocked");

    const reversal = await supabase.rpc("ns_reverse_talent_settlement_v1", {
      p_case_id: caseId,
      p_settlement_id: settlementId,
      p_amount: 200000,
      p_provider: "smoke",
      p_provider_reference: `reversal-${stamp}`,
      p_idempotency_key: `cancel-smoke-reversal-${stamp}`,
      p_reversed_at: new Date().toISOString(),
      p_notes: "partial recovery",
    });
    if (reversal.error) throw new Error(reversal.error.message);

    const refund = await supabase.rpc("ns_record_buyer_refund_v1", {
      p_case_id: caseId,
      p_payment_id: paymentId,
      p_amount: 400000,
      p_provider: "smoke",
      p_provider_reference: `refund-${stamp}`,
      p_idempotency_key: `cancel-smoke-refund-${stamp}`,
      p_refunded_at: new Date().toISOString(),
      p_notes: "approved refund",
    });
    if (refund.error) throw new Error(refund.error.message);

    const finalized = await supabase.rpc("ns_finalize_cancellation_v1", { p_case_id: caseId });
    if (finalized.error) throw new Error(finalized.error.message);

    const [{ data: finalBooking }, { data: finalBrief }, { data: finalCase }] = await Promise.all([
      supabase.from("bookings").select("status").eq("id", bookingId).single(),
      supabase.from("briefs").select("status").eq("id", briefId).single(),
      supabase.from("cancellation_cases").select("status,buyer_refund_amount,talent_due_amount").eq("id", caseId).single(),
    ]);

    const cancellationFinalized = finalBooking?.status === "cancelled" && finalBrief?.status === "cancelled" && finalCase?.status === "settled";
    return NextResponse.json({
      ok: unsafeRefundBlocked && cancellationFinalized,
      checks: {
        unsafeRefundBlocked,
        talentReversalRecorded: true,
        approvedBuyerRefundRecorded: true,
        cancellationReconciledBeforeFinalization: cancellationFinalized,
      },
      cleanup: "automatic",
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ ok: false, error: detail }, { status: 500 });
  } finally {
    if (bookingId) {
      await supabase.from("buyer_refunds").delete().eq("booking_id", bookingId);
      await supabase.from("talent_settlement_reversals").delete().eq("booking_id", bookingId);
      await supabase.from("cancellation_cases").delete().eq("booking_id", bookingId);
      await supabase.from("talent_settlements").delete().eq("booking_id", bookingId);
      await supabase.from("payments").delete().eq("booking_id", bookingId);
      await supabase.from("bookings").delete().eq("id", bookingId);
    }
    if (briefId) await supabase.from("briefs").delete().eq("id", briefId);
    if (talentId) await supabase.from("talents").delete().eq("id", talentId);
  }
}
