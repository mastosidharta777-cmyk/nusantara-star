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
    const briefId = typeof body?.briefId === "string" ? body.briefId : "";
    if (!briefId) return NextResponse.json({ error: "Missing briefId" }, { status: 400 });

    const supabase = getServerClient();

    const { data: existing, error: existingError } = await supabase
      .from("bookings")
      .select("id,status")
      .eq("brief_id", briefId)
      .maybeSingle();
    if (existingError) throw new Error(existingError.message);
    if (existing) return NextResponse.json({ ok: true, existing: true, bookingId: existing.id, status: existing.status });

    const [briefResult, selectionResult, termsResult] = await Promise.all([
      supabase.from("briefs").select("id,status,event_date,venue,city").eq("id", briefId).single(),
      supabase.from("buyer_selections").select("talent_id,status").eq("brief_id", briefId).eq("status", "selected").single(),
      supabase
        .from("commercial_terms")
        .select("talent_id,buyer_price,talent_payable,direct_costs,status,buyer_payment_schedule,talent_payment_schedule")
        .eq("brief_id", briefId)
        .single(),
    ]);

    if (briefResult.error || !briefResult.data) return NextResponse.json({ error: "Brief not found" }, { status: 404 });
    if (selectionResult.error || !selectionResult.data) return NextResponse.json({ error: "Buyer selection not found" }, { status: 409 });
    if (termsResult.error || !termsResult.data) return NextResponse.json({ error: "Locked Deal Sheet not found" }, { status: 409 });

    const brief = briefResult.data;
    const selection = selectionResult.data;
    const terms = termsResult.data;
    const buyerSchedule = Array.isArray(terms.buyer_payment_schedule) ? terms.buyer_payment_schedule : [];
    const talentSchedule = Array.isArray(terms.talent_payment_schedule) ? terms.talent_payment_schedule : [];

    if (brief.status !== "terms_agreed") return NextResponse.json({ error: "Brief is not ready for booking" }, { status: 409 });
    if (!brief.event_date) return NextResponse.json({ error: "Event date is required before booking" }, { status: 409 });
    if (terms.status !== "agreed") return NextResponse.json({ error: "Deal Sheet is not locked" }, { status: 409 });
    if (selection.talent_id !== terms.talent_id) return NextResponse.json({ error: "Selected talent does not match locked Deal Sheet" }, { status: 409 });
    if (terms.buyer_price <= 0 || terms.talent_payable <= 0) return NextResponse.json({ error: "Deal values are invalid" }, { status: 409 });
    if (buyerSchedule.length === 0 || talentSchedule.length === 0) return NextResponse.json({ error: "Locked Deal Sheet has incomplete payment schedules" }, { status: 409 });

    const { data: booking, error: insertError } = await supabase
      .from("bookings")
      .insert({
        brief_id: briefId,
        talent_id: selection.talent_id,
        event_date: brief.event_date,
        venue: brief.venue,
        city: brief.city,
        buyer_price: terms.buyer_price,
        talent_payable: terms.talent_payable,
        direct_cost: terms.direct_costs ?? 0,
        status: "pending",
      })
      .select("id,status")
      .single();

    if (insertError) {
      if (insertError.code === "23505") {
        const { data: raceExisting } = await supabase.from("bookings").select("id,status").eq("brief_id", briefId).single();
        if (raceExisting) return NextResponse.json({ ok: true, existing: true, bookingId: raceExisting.id, status: raceExisting.status });
      }
      throw new Error(insertError.message);
    }

    const toMilestones = (party: "buyer" | "talent", schedule: Array<Record<string, unknown>>) =>
      schedule.map((row, index) => ({
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
      await supabase.from("bookings").delete().eq("id", booking.id).eq("status", "pending");
      throw new Error(`Deal payment schedule could not be snapshotted to booking: ${milestoneError.message}`);
    }

    return NextResponse.json({
      ok: true,
      existing: false,
      bookingId: booking.id,
      status: booking.status,
      buyerMilestoneCount: buyerSchedule.length,
      talentMilestoneCount: talentSchedule.length,
      source: "locked_deal_sheet",
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown error";
    console.error("Booking creation failed", detail);
    return NextResponse.json({ error: "Booking creation failed", detail }, { status: 500 });
  }
}
