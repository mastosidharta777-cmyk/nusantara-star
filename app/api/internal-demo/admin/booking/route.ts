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
    if (existing) {
      return NextResponse.json({ ok: true, existing: true, bookingId: existing.id, status: existing.status });
    }

    const [briefResult, selectionResult, termsResult] = await Promise.all([
      supabase.from("briefs").select("id,status,event_date,venue,city").eq("id", briefId).single(),
      supabase.from("buyer_selections").select("talent_id,status").eq("brief_id", briefId).eq("status", "selected").single(),
      supabase
        .from("commercial_terms")
        .select("talent_id,buyer_price,talent_payable,direct_costs,status")
        .eq("brief_id", briefId)
        .single(),
    ]);

    if (briefResult.error || !briefResult.data) return NextResponse.json({ error: "Brief not found" }, { status: 404 });
    if (selectionResult.error || !selectionResult.data) return NextResponse.json({ error: "Buyer selection not found" }, { status: 409 });
    if (termsResult.error || !termsResult.data) return NextResponse.json({ error: "Commercial terms not found" }, { status: 409 });

    const brief = briefResult.data;
    const selection = selectionResult.data;
    const terms = termsResult.data;

    if (brief.status !== "terms_agreed") {
      return NextResponse.json({ error: "Brief is not ready for booking" }, { status: 409 });
    }
    if (!brief.event_date) {
      return NextResponse.json({ error: "Event date is required before booking" }, { status: 409 });
    }
    if (terms.status !== "agreed") {
      return NextResponse.json({ error: "Commercial terms are not agreed" }, { status: 409 });
    }
    if (selection.talent_id !== terms.talent_id) {
      return NextResponse.json({ error: "Selected talent does not match agreed commercial terms" }, { status: 409 });
    }
    if (terms.buyer_price <= 0 || terms.talent_payable <= 0) {
      return NextResponse.json({ error: "Agreed commercial values are invalid" }, { status: 409 });
    }

    const { data: talentPolicies, error: policyError } = await supabase
      .from("talent_payment_policy_templates")
      .select("milestone_type,sequence_no,calculation_type,percentage,amount,due_basis,due_offset_days,refundable,cancellation_note,notes")
      .eq("talent_id", selection.talent_id)
      .eq("is_active", true)
      .order("sequence_no", { ascending: true });

    if (policyError) {
      return NextResponse.json({ error: "Talent payment policy could not be loaded", detail: policyError.message }, { status: 500 });
    }

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

    if ((talentPolicies ?? []).length > 0) {
      const milestones = (talentPolicies ?? []).map((policy) => ({
        booking_id: booking.id,
        party: "talent",
        milestone_type: policy.milestone_type,
        sequence_no: policy.sequence_no,
        calculation_type: policy.calculation_type,
        percentage: policy.percentage,
        amount: policy.amount,
        due_basis: policy.due_basis,
        due_offset_days: policy.due_offset_days,
        custom_due_date: null,
        refundable: policy.refundable,
        cancellation_note: policy.cancellation_note,
        status: "planned",
        notes: policy.notes,
      }));

      const { error: milestoneError } = await supabase.from("payment_milestones").insert(milestones);
      if (milestoneError) {
        // Preview V1 compensation: avoid leaving a new booking without its agreed talent schedule.
        await supabase.from("bookings").delete().eq("id", booking.id).eq("status", "pending");
        throw new Error(`Talent payment schedule could not be created: ${milestoneError.message}`);
      }
    }

    return NextResponse.json({
      ok: true,
      existing: false,
      bookingId: booking.id,
      status: booking.status,
      talentSchedulePrefilled: (talentPolicies ?? []).length > 0,
      talentMilestoneCount: (talentPolicies ?? []).length,
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown error";
    console.error("Booking creation failed", detail);
    return NextResponse.json({ error: "Booking creation failed", detail }, { status: 500 });
  }
}
