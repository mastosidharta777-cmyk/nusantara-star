import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import { resolveMilestoneAmounts, type BuyerMilestone } from "@/lib/secure-booking";

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
    const { data: booking, error: bookingError } = await supabase.from("bookings").select("id,status,buyer_price").eq("id", bookingId).single();
    if (bookingError || !booking) return NextResponse.json({ error: "Booking not found" }, { status: 404 });
    if (!["pending_security", "secured", "pre_show"].includes(booking.status)) return NextResponse.json({ error: "Booking is not active for buyer payments" }, { status: 409 });
    const buyerPrice = Number(booking.buyer_price ?? 0);
    if (buyerPrice <= 0) return NextResponse.json({ error: "Booking buyer price is invalid" }, { status: 409 });

    if (action === "create_next_buyer_payment") {
      const [{ data: milestones, error: milestoneError }, { data: activePayments, error: paymentError }] = await Promise.all([
        supabase.from("payment_milestones").select("sequence_no,milestone_type,calculation_type,percentage,amount,status").eq("booking_id", bookingId).eq("party", "buyer").order("sequence_no"),
        supabase.from("payments").select("id,payment_type,amount,status,idempotency_key").eq("booking_id", bookingId).in("status", ["pending", "paid"]).order("created_at"),
      ]);
      if (milestoneError) throw new Error(milestoneError.message);
      if (paymentError) throw new Error(paymentError.message);
      if (!milestones?.length) return NextResponse.json({ error: "No buyer payment milestones found" }, { status: 409 });

      const pending = (activePayments ?? []).find((row) => row.status === "pending");
      if (pending) return NextResponse.json({ ok: true, payment: pending, reused: true });

      const resolved = resolveMilestoneAmounts(milestones as BuyerMilestone[], buyerPrice);
      const paidTotal = (activePayments ?? []).filter((row) => row.status === "paid").reduce((sum, row) => sum + Number(row.amount ?? 0), 0);
      let cumulative = 0;
      let next = resolved[0];
      for (const row of resolved) {
        cumulative += row.resolvedAmount;
        if (paidTotal < cumulative) { next = row; break; }
      }
      if (!next || paidTotal >= buyerPrice) return NextResponse.json({ error: "Buyer payment is already fully paid" }, { status: 409 });

      const amount = Math.min(next.resolvedAmount, buyerPrice - paidTotal);
      if (amount <= 0) return NextResponse.json({ error: "Next buyer milestone amount is invalid" }, { status: 409 });
      const milestoneType = (milestones.find((row) => row.sequence_no === next.sequence_no)?.milestone_type ?? "other") as string;
      const paymentType = milestoneType === "full_payment" ? "buyer_full_payment" : milestoneType === "deposit" || milestoneType === "booking_fee" ? "buyer_deposit" : "buyer_balance";
      const idempotencyKey = `buyer-payment:${bookingId}:${next.sequence_no}`;

      const existingByKey = (activePayments ?? []).find((row) => row.idempotency_key === idempotencyKey);
      if (existingByKey) return NextResponse.json({ ok: true, payment: existingByKey, reused: true, milestoneSequence: next.sequence_no });

      const { data: payment, error: insertError } = await supabase.from("payments").insert({ booking_id: bookingId, payment_type: paymentType, amount, status: "pending", idempotency_key: idempotencyKey }).select("id,status,payment_type,amount,idempotency_key").single();
      if (insertError || !payment) {
        const { data: raced } = await supabase.from("payments").select("id,status,payment_type,amount,idempotency_key").eq("idempotency_key", idempotencyKey).maybeSingle();
        if (raced) return NextResponse.json({ ok: true, payment: raced, reused: true, milestoneSequence: next.sequence_no });
        throw new Error(insertError?.message ?? "Payment creation failed");
      }
      return NextResponse.json({ ok: true, payment, milestoneSequence: next.sequence_no, source: "booking_payment_milestone" });
    }

    const paymentId = typeof body?.paymentId === "string" ? body.paymentId : "";
    const provider = typeof body?.provider === "string" ? body.provider.trim() : "";
    const providerReference = typeof body?.providerReference === "string" ? body.providerReference.trim() : "";
    if (!paymentId || !provider || !providerReference) return NextResponse.json({ error: "Payment ID, provider/bank, and transaction reference are required" }, { status: 400 });

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
