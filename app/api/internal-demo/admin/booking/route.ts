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
  try {
    const body = await request.json().catch(() => null);
    const briefId = typeof body?.briefId === "string" ? body.briefId : "";
    const action = typeof body?.action === "string" ? body.action : "create_booking";
    if (!briefId) return NextResponse.json({ error: "Missing briefId" }, { status: 400 });

    const supabase = getServerClient();
    const { data: existing, error: existingError } = await supabase
      .from("bookings")
      .select("id,brief_id,deal_id,status,buyer_price,buyer_terms_accepted_at,financial_security_type,financial_security_status")
      .eq("brief_id", briefId)
      .maybeSingle();
    if (existingError) throw new Error(existingError.message);

    if (action === "create_booking") {
      if (existing) return NextResponse.json({ ok: true, existing: true, bookingId: existing.id, status: existing.status });

      const [{ data: brief, error: briefError }, { data: selection, error: selectionError }, { data: deal, error: dealError }] = await Promise.all([
        supabase.from("briefs").select("id,status,event_date,venue,city").eq("id", briefId).single(),
        supabase.from("buyer_selections").select("talent_id,status").eq("brief_id", briefId).eq("status", "selected").single(),
        supabase.from("deals").select("id,talent_id,status,buyer_price,talent_payable,direct_costs,buyer_payment_schedule,talent_payment_schedule").eq("brief_id", briefId).single(),
      ]);
      if (briefError || !brief) return NextResponse.json({ error: "Brief not found" }, { status: 404 });
      if (selectionError || !selection) return NextResponse.json({ error: "Buyer selection not found" }, { status: 409 });
      if (dealError || !deal) return NextResponse.json({ error: "Locked deal not found" }, { status: 409 });
      if (deal.status !== "locked") return NextResponse.json({ error: "Deal must be locked before booking security starts" }, { status: 409 });
      if (!brief.event_date) return NextResponse.json({ error: "Event date is required before booking" }, { status: 409 });
      if (selection.talent_id !== deal.talent_id) return NextResponse.json({ error: "Selected talent does not match locked deal" }, { status: 409 });

      const buyerSchedule = Array.isArray(deal.buyer_payment_schedule) ? deal.buyer_payment_schedule : [];
      const talentSchedule = Array.isArray(deal.talent_payment_schedule) ? deal.talent_payment_schedule : [];
      if (!buyerSchedule.length || !talentSchedule.length) return NextResponse.json({ error: "Locked deal has incomplete payment schedules" }, { status: 409 });

      const { data: booking, error: bookingError } = await supabase
        .from("bookings")
        .insert({
          brief_id: briefId,
          deal_id: deal.id,
          talent_id: selection.talent_id,
          event_date: brief.event_date,
          venue: brief.venue,
          city: brief.city,
          buyer_price: deal.buyer_price,
          talent_payable: deal.talent_payable,
          direct_cost: deal.direct_costs ?? 0,
          status: "pending_security",
          financial_security_status: "pending",
        })
        .select("id,status")
        .single();
      if (bookingError || !booking) throw new Error(bookingError?.message ?? "Booking creation failed");

      const toMilestones = (party: "buyer" | "talent", schedule: Array<Record<string, unknown>>) => schedule.map((row, index) => ({
        booking_id: booking.id,
        party,
        milestone_type: row.milestone_type,
        sequence_no: index + 1,
        calculation_type: row.calculation_type,
        percentage: row.percentage ?? null,
        amount: row.amount ?? null,
        due_basis: row.due_basis,
        due_offset_days: row.due_offset_days ?? 0,
        custom_due_date: row.custom_due_date ?? null,
        refundable: row.refundable ?? null,
        cancellation_note: row.cancellation_note ?? null,
        status: "planned",
        notes: row.notes ?? null,
      }));
      const milestones = [...toMilestones("buyer", buyerSchedule), ...toMilestones("talent", talentSchedule)];
      const { error: milestoneError } = await supabase.from("payment_milestones").insert(milestones);
      if (milestoneError) {
        await supabase.from("bookings").delete().eq("id", booking.id);
        throw new Error(`Deal payment schedule could not be snapshotted: ${milestoneError.message}`);
      }
      return NextResponse.json({ ok: true, bookingId: booking.id, status: booking.status, source: "locked_deal" });
    }

    if (!existing) return NextResponse.json({ error: "Booking not found" }, { status: 404 });
    if (existing.status !== "pending_security") return NextResponse.json({ error: "Booking is not pending security" }, { status: 409 });

    if (action === "accept_buyer_terms") {
      const now = new Date().toISOString();
      const { error: bookingError } = await supabase.from("bookings").update({ buyer_terms_accepted_at: now, updated_at: now }).eq("id", existing.id).eq("status", "pending_security");
      if (bookingError) throw new Error(bookingError.message);
      const { error: dealError } = await supabase.from("deals").update({ buyer_terms_status: "accepted", updated_at: now }).eq("id", existing.deal_id).eq("status", "locked");
      if (dealError) throw new Error(dealError.message);
      return NextResponse.json({ ok: true, buyerTermsAccepted: true });
    }

    if (action === "set_security") {
      const securityType = typeof body?.securityType === "string" ? body.securityType : "";
      const reference = typeof body?.reference === "string" ? body.reference.trim() : "";
      if (!["approved_po_credit", "authorized_exception"].includes(securityType)) return NextResponse.json({ error: "Invalid manual financial security type" }, { status: 400 });
      const { data: deal, error: dealError } = await supabase.from("deals").select("exception_status").eq("id", existing.deal_id).single();
      if (dealError || !deal) return NextResponse.json({ error: "Deal not found" }, { status: 404 });
      if (securityType === "approved_po_credit" && !reference) return NextResponse.json({ error: "PO/credit reference is required" }, { status: 409 });
      if (securityType === "authorized_exception" && deal.exception_status !== "approved") return NextResponse.json({ error: "Commercial exception is not approved" }, { status: 409 });
      const { error } = await supabase.from("bookings").update({ financial_security_type: securityType, financial_security_status: "satisfied", financial_security_reference: reference || "approved_exception", updated_at: new Date().toISOString() }).eq("id", existing.id).eq("status", "pending_security");
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true, securityType, securityStatus: "satisfied" });
    }

    if (action !== "secure_booking") return NextResponse.json({ error: "Invalid booking action" }, { status: 400 });

    const { data: deal, error: dealError } = await supabase
      .from("deals")
      .select("status,funding_gap_status,talent_terms_status,buyer_terms_status,talent_offer_id")
      .eq("id", existing.deal_id)
      .single();
    if (dealError || !deal) return NextResponse.json({ error: "Deal not found" }, { status: 404 });
    if (deal.status !== "locked") return NextResponse.json({ error: "Deal is not locked" }, { status: 409 });
    if (deal.talent_terms_status !== "confirmed") return NextResponse.json({ error: "Talent terms are unresolved" }, { status: 409 });
    if (!existing.buyer_terms_accepted_at || deal.buyer_terms_status !== "accepted") return NextResponse.json({ error: "Buyer terms are not accepted" }, { status: 409 });
    if (deal.funding_gap_status !== "safe") return NextResponse.json({ error: "Funding gap is unresolved" }, { status: 409 });

    const { data: offer, error: offerError } = await supabase
      .from("talent_offers")
      .select("status,availability_status,quote_valid_until")
      .eq("id", deal.talent_offer_id)
      .single();
    if (offerError || !offer) return NextResponse.json({ error: "Talent offer not found" }, { status: 404 });
    if (offer.status !== "confirmed" || offer.availability_status !== "confirmed" || (offer.quote_valid_until && new Date(offer.quote_valid_until).getTime() <= Date.now())) {
      return NextResponse.json({ error: "Talent offer requires reconfirmation" }, { status: 409 });
    }

    const { data: result, error: rpcError } = await supabase.rpc("ns_secure_booking_v1", { p_booking_id: existing.id });
    if (rpcError) return NextResponse.json({ error: "Booking could not be secured", detail: rpcError.message }, { status: 409 });
    const row = Array.isArray(result) ? result[0] : result;
    return NextResponse.json({
      ok: true,
      bookingStatus: row?.booking_status ?? "secured",
      financialSecurityType: row?.financial_security_type ?? existing.financial_security_type,
      paidBuyerTotal: Number(row?.paid_buyer_total ?? 0),
      source: "ns_secure_booking_v1",
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown error";
    console.error("Secure booking action failed", detail);
    return NextResponse.json({ error: "Secure booking action failed", detail }, { status: 500 });
  }
}
