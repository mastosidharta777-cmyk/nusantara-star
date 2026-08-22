import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function getServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) throw new Error("Supabase server environment is not configured");
  return createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function POST(request: Request) {
  if (process.env.VERCEL_ENV === "production") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const body = await request.json().catch(() => null);
    const action = body?.action;
    const bookingId = typeof body?.bookingId === "string" ? body.bookingId : "";
    if (!bookingId || !["create_deposit", "mark_paid"].includes(action)) {
      return NextResponse.json({ error: "Invalid payment action" }, { status: 400 });
    }

    const supabase = getServerClient();
    const { data: booking, error: bookingError } = await supabase
      .from("bookings")
      .select("id,brief_id,status,buyer_price")
      .eq("id", bookingId)
      .single();

    if (bookingError || !booking) return NextResponse.json({ error: "Booking not found" }, { status: 404 });
    if (!booking.brief_id) return NextResponse.json({ error: "Booking has no brief" }, { status: 409 });

    if (action === "create_deposit") {
      if (booking.status !== "pending") return NextResponse.json({ error: "Booking is not pending" }, { status: 409 });
      if (!booking.buyer_price || booking.buyer_price <= 0) return NextResponse.json({ error: "Booking buyer price is invalid" }, { status: 409 });

      const { data: terms, error: termsError } = await supabase
        .from("commercial_terms")
        .select("status,payment_terms")
        .eq("brief_id", booking.brief_id)
        .single();
      if (termsError || !terms || terms.status !== "agreed") {
        return NextResponse.json({ error: "Commercial terms are not agreed" }, { status: 409 });
      }

      const paymentTerms = (terms.payment_terms ?? "").toLowerCase();
      if (!paymentTerms.includes("50%")) {
        return NextResponse.json({ error: "Preview DP flow currently requires 50% payment terms" }, { status: 409 });
      }

      const { data: existing, error: existingError } = await supabase
        .from("payments")
        .select("id,status,payment_type,amount")
        .eq("booking_id", bookingId)
        .in("payment_type", ["buyer_deposit", "buyer_full_payment"])
        .in("status", ["pending", "paid"])
        .limit(1)
        .maybeSingle();
      if (existingError) throw new Error(existingError.message);
      if (existing) return NextResponse.json({ ok: true, payment: existing, reused: true });

      const amount = Math.floor(booking.buyer_price / 2);
      const { data: payment, error: insertError } = await supabase
        .from("payments")
        .insert({
          booking_id: bookingId,
          payment_type: "buyer_deposit",
          amount,
          status: "pending",
        })
        .select("id,status,payment_type,amount")
        .single();
      if (insertError) throw new Error(insertError.message);

      return NextResponse.json({ ok: true, payment });
    }

    const paymentId = typeof body?.paymentId === "string" ? body.paymentId : "";
    if (!paymentId) return NextResponse.json({ error: "Payment ID is required" }, { status: 400 });
    if (booking.status !== "pending") return NextResponse.json({ error: "Booking is not pending" }, { status: 409 });

    const { data: payment, error: paymentError } = await supabase
      .from("payments")
      .select("id,booking_id,payment_type,status")
      .eq("id", paymentId)
      .single();
    if (paymentError || !payment) return NextResponse.json({ error: "Payment not found" }, { status: 404 });
    if (payment.booking_id !== bookingId) return NextResponse.json({ error: "Payment does not belong to booking" }, { status: 409 });
    if (!["buyer_deposit", "buyer_full_payment"].includes(payment.payment_type)) {
      return NextResponse.json({ error: "Payment type cannot confirm booking" }, { status: 409 });
    }
    if (payment.status !== "pending") return NextResponse.json({ error: "Payment is not pending" }, { status: 409 });

    const now = new Date().toISOString();
    const { error: paidError } = await supabase
      .from("payments")
      .update({ status: "paid", paid_at: now })
      .eq("id", paymentId)
      .eq("status", "pending");
    if (paidError) throw new Error(paidError.message);

    const { error: bookingUpdateError } = await supabase
      .from("bookings")
      .update({ status: "confirmed", updated_at: now })
      .eq("id", bookingId)
      .eq("status", "pending");
    if (bookingUpdateError) {
      await supabase.from("payments").update({ status: "pending", paid_at: null }).eq("id", paymentId);
      throw new Error(bookingUpdateError.message);
    }

    const { error: briefUpdateError } = await supabase
      .from("briefs")
      .update({ status: "booked" })
      .eq("id", booking.brief_id)
      .eq("status", "terms_agreed");
    if (briefUpdateError) {
      await supabase.from("bookings").update({ status: "pending", updated_at: now }).eq("id", bookingId);
      await supabase.from("payments").update({ status: "pending", paid_at: null }).eq("id", paymentId);
      throw new Error(briefUpdateError.message);
    }

    return NextResponse.json({ ok: true, paymentStatus: "paid", bookingStatus: "confirmed", briefStatus: "booked" });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown error";
    console.error("Payment action failed", detail);
    return NextResponse.json({ error: "Payment action failed", detail }, { status: 500 });
  }
}
