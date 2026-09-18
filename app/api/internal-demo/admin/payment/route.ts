import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import { commercialIntegrityReady } from "@/lib/commercial-integrity";

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
    const action = typeof body?.action === "string" ? body.action : "";
    const bookingId = typeof body?.bookingId === "string" ? body.bookingId : "";
    if (!bookingId || !["create_next_buyer_payment", "mark_paid"].includes(action)) return NextResponse.json({ error: "Invalid payment action" }, { status: 400 });

    const supabase = getServerClient();
    const { data: booking, error: bookingError } = await supabase
      .from("bookings")
      .select("id,deal_id,status,buyer_price,buyer_terms_accepted_at,buyer_terms_accepted_deal_id,buyer_terms_acceptance_source")
      .eq("id", bookingId)
      .single();
    if (bookingError || !booking) return NextResponse.json({ error: "Booking not found" }, { status: 404 });
    if (!["pending_security", "secured", "pre_show"].includes(booking.status)) return NextResponse.json({ error: "Booking is not active for buyer payments" }, { status: 409 });
    const buyerPrice = Number(booking.buyer_price ?? 0);
    if (buyerPrice <= 0) return NextResponse.json({ error: "Booking buyer price is invalid" }, { status: 409 });
    if (!booking.deal_id) return NextResponse.json({ error: "Booking has no locked deal" }, { status: 409 });

    const { data: deal, error: dealError } = await supabase.from("deals").select("id,status,buyer_terms_status").eq("id", booking.deal_id).single();
    if (dealError || !deal || deal.status !== "locked") return NextResponse.json({ error: "Locked deal not found" }, { status: 409 });
    const buyerTermsAccepted = Boolean(
      booking.buyer_terms_accepted_at
      && booking.buyer_terms_accepted_deal_id === booking.deal_id
      && booking.buyer_terms_acceptance_source === "signed_buyer_link"
      && deal.buyer_terms_status === "accepted",
    );
    if (!buyerTermsAccepted) return NextResponse.json({ error: "Buyer terms must be accepted before buyer payment security starts" }, { status: 409 });

    const integrityReady = await commercialIntegrityReady(supabase);

    if (action === "create_next_buyer_payment") {
      if (!integrityReady) return NextResponse.json({ error: "Commercial integrity database cutover is not complete" }, { status: 503 });

      const paymentMethod = typeof body?.paymentMethod === "string" ? body.paymentMethod : "";
      const providerName = typeof body?.providerName === "string" ? body.providerName.trim() : "";
      const destination = typeof body?.destination === "string" ? body.destination.trim() : "";
      const accountName = typeof body?.accountName === "string" ? body.accountName.trim() : "";
      const instructionNotes = typeof body?.instructionNotes === "string" ? body.instructionNotes.trim() : "";
      if (!["bank_transfer", "payment_link", "other"].includes(paymentMethod) || !providerName || !destination) {
        return NextResponse.json({ error: "Payment method, provider/bank, and payment destination are required" }, { status: 400 });
      }

      const { data: payment, error: requestError } = await supabase.rpc("ns_create_buyer_payment_request_v1", {
        p_booking_id: bookingId,
        p_payment_instructions: {
          method: paymentMethod,
          provider_name: providerName,
          destination,
          account_name: accountName || null,
          notes: instructionNotes || null,
        },
      });
      if (requestError) return NextResponse.json({ error: requestError.message }, { status: 409 });
      if (!payment) return NextResponse.json({ error: "Payment request could not be created" }, { status: 409 });

      return NextResponse.json({
        ok: true,
        payment: {
          id: payment.id,
          status: payment.status,
          payment_type: payment.payment_type,
          amount: Number(payment.amount),
          currency: payment.currency,
          payment_milestone_id: payment.payment_milestone_id,
          request_reference: payment.request_reference,
          request_issued_at: payment.request_issued_at,
          request_due_date: payment.request_due_date,
          payment_instructions_snapshot: payment.payment_instructions_snapshot,
        },
        source: "ns_create_buyer_payment_request_v1",
      });
    }

    const paymentId = typeof body?.paymentId === "string" ? body.paymentId : "";
    const provider = typeof body?.provider === "string" ? body.provider.trim() : "";
    const providerReference = typeof body?.providerReference === "string" ? body.providerReference.trim() : "";
    if (!paymentId || !provider || !providerReference) return NextResponse.json({ error: "Payment ID, provider/bank, and transaction reference are required" }, { status: 400 });
    if (!integrityReady) {
      return NextResponse.json({ error: "Commercial integrity database cutover is not complete" }, { status: 503 });
    }

    const { data, error } = await supabase.rpc("ns_record_buyer_payment_v1", {
      p_booking_id: bookingId,
      p_payment_id: paymentId,
      p_provider: provider,
      p_provider_reference: providerReference,
      p_paid_at: new Date().toISOString(),
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 409 });
    return NextResponse.json({ ok: true, payment: data, paymentStatus: "paid", bookingStatus: booking.status });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown error";
    console.error("Payment action failed", detail);
    return NextResponse.json({ error: "Payment action failed", detail }, { status: 500 });
  }
}
