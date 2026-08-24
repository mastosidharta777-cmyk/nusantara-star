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
  if (process.env.VERCEL_ENV === "production") return NextResponse.json({ error: "Not found" }, { status: 404 });

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
        supabase.from("payments").select("id,payment_type,amount,status").eq("booking_id", bookingId).in("status", ["pending", "paid"]).order("created_at"),
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

      const { data: payment, error: insertError } = await supabase.from("payments").insert({ booking_id: bookingId, payment_type: paymentType, amount, status: "pending" }).select("id,status,payment_type,amount").single();
      if (insertError || !payment) throw new Error(insertError?.message ?? "Payment creation failed");
      return NextResponse.json({ ok: true, payment, milestoneSequence: next.sequence_no, source: "booking_payment_milestone" });
    }

    const paymentId = typeof body?.paymentId === "string" ? body.paymentId : "";
    if (!paymentId) return NextResponse.json({ error: "Payment ID is required" }, { status: 400 });
    const { data: payment, error: paymentError } = await supabase.from("payments").select("id,booking_id,status").eq("id", paymentId).single();
    if (paymentError || !payment) return NextResponse.json({ error: "Payment not found" }, { status: 404 });
    if (payment.booking_id !== bookingId) return NextResponse.json({ error: "Payment does not belong to booking" }, { status: 409 });
    if (payment.status !== "pending") return NextResponse.json({ error: "Payment is not pending" }, { status: 409 });

    const now = new Date().toISOString();
    const { error: paidError } = await supabase.from("payments").update({ status: "paid", paid_at: now, updated_at: now }).eq("id", paymentId).eq("status", "pending");
    if (paidError) throw new Error(paidError.message);
    return NextResponse.json({ ok: true, paymentStatus: "paid", bookingStatus: booking.status });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown error";
    console.error("Payment action failed", detail);
    return NextResponse.json({ error: "Payment action failed", detail }, { status: 500 });
  }
}
