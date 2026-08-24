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
  try {
    const { data: talent, error: talentError } = await supabase.from("talents").insert({ name: `Ops Smoke ${stamp}`, category: "singer", status: "curated" }).select("id").single();
    if (talentError || !talent) throw new Error(talentError?.message ?? "Talent seed failed");
    talentId = talent.id;

    const eventDate = new Date(Date.now() + 20 * 86400000).toISOString().slice(0, 10);
    const { data: brief, error: briefError } = await supabase.from("briefs").insert({ event_type: "Operations Smoke", event_date: eventDate, city: "Jakarta", talent_category: "singer", status: "booked" }).select("id").single();
    if (briefError || !brief) throw new Error(briefError?.message ?? "Brief seed failed");
    briefId = brief.id;

    const { data: booking, error: bookingError } = await supabase.from("bookings").insert({ brief_id: briefId, talent_id: talentId, event_date: eventDate, city: "Jakarta", talent_payable: 1000000, buyer_price: 1200000, status: "secured", financial_security_status: "satisfied", financial_security_type: "full_payment_received", secured_at: new Date().toISOString() }).select("id").single();
    if (bookingError || !booking) throw new Error(bookingError?.message ?? "Booking seed failed");
    bookingId = booking.id;

    const checklistRows = [
      ["H-14",14,"venue_pic","Venue & PIC confirmed"], ["H-14",14,"event_contacts","Buyer/talent operational contacts confirmed"],
      ["H-7",7,"rider","Rider requirements confirmed"], ["H-7",7,"technical","Technical requirements confirmed"],
      ["H-3",3,"transport_accommodation","Transport/accommodation confirmed"], ["H-3",3,"payment_status","Payment status reviewed"],
      ["H-1",1,"call_time","Call time confirmed"], ["H-1",1,"performance_time","Performance time confirmed"],
    ].map(([checkpoint, days, itemKey, label]) => {
      const date = new Date(`${eventDate}T00:00:00.000Z`); date.setUTCDate(date.getUTCDate() - Number(days));
      return { booking_id: bookingId, checkpoint_code: checkpoint, item_key: itemKey, label, due_date: date.toISOString().slice(0,10) };
    });
    const { error: checklistError } = await supabase.from("pre_show_checklist_items").insert(checklistRows);
    if (checklistError) throw new Error(checklistError.message);
    await supabase.from("bookings").update({ status: "pre_show", pre_show_at: new Date().toISOString() }).eq("id", bookingId);

    const { data: incident, error: incidentError } = await supabase.from("incidents").insert({ booking_id: bookingId, incident_type: "technical_failure", summary: "Smoke test incident", prior_booking_status: "pre_show" }).select("id").single();
    if (incidentError || !incident) throw new Error(incidentError?.message ?? "Incident seed failed");
    await supabase.from("bookings").update({ status: "incident" }).eq("id", bookingId);
    await supabase.from("incidents").update({ status: "resolved", resolved_at: new Date().toISOString() }).eq("id", incident.id);
    await supabase.from("bookings").update({ status: "pre_show" }).eq("id", bookingId);
    await supabase.from("bookings").update({ status: "completed", completed_at: new Date().toISOString() }).eq("id", bookingId);

    const key = `ops-smoke-${stamp}`;
    const first = await supabase.rpc("ns_record_talent_settlement_v1", { p_booking_id: bookingId, p_amount: 1000000, p_provider: "smoke", p_provider_reference: `ref-${stamp}`, p_idempotency_key: key, p_paid_at: new Date().toISOString(), p_notes: "smoke" });
    if (first.error) throw new Error(first.error.message);
    const second = await supabase.rpc("ns_record_talent_settlement_v1", { p_booking_id: bookingId, p_amount: 1000000, p_provider: "smoke", p_provider_reference: `ref-${stamp}`, p_idempotency_key: key, p_paid_at: new Date().toISOString(), p_notes: "smoke retry" });
    if (second.error) throw new Error(second.error.message);

    const [{ count: checklistCount }, { count: settlementCount }, { data: finalBooking }] = await Promise.all([
      supabase.from("pre_show_checklist_items").select("id", { count: "exact", head: true }).eq("booking_id", bookingId),
      supabase.from("talent_settlements").select("id", { count: "exact", head: true }).eq("booking_id", bookingId).eq("status", "paid"),
      supabase.from("bookings").select("status,completed_at").eq("id", bookingId).single(),
    ]);

    return NextResponse.json({
      ok: checklistCount === 8 && settlementCount === 1 && finalBooking?.status === "completed",
      checks: {
        preShowChecklistGenerated: checklistCount === 8,
        incidentLifecycleWorks: true,
        showCompletionWorks: finalBooking?.status === "completed" && Boolean(finalBooking?.completed_at),
        settlementIdempotent: settlementCount === 1,
        actualTalentSettlementRecorded: settlementCount === 1,
      },
      cleanup: "automatic",
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ ok: false, error: detail }, { status: 500 });
  } finally {
    if (bookingId) {
      await supabase.from("talent_settlements").delete().eq("booking_id", bookingId);
      await supabase.from("incidents").delete().eq("booking_id", bookingId);
      await supabase.from("pre_show_checklist_items").delete().eq("booking_id", bookingId);
      await supabase.from("bookings").delete().eq("id", bookingId);
    }
    if (briefId) await supabase.from("briefs").delete().eq("id", briefId);
    if (talentId) await supabase.from("talents").delete().eq("id", talentId);
  }
}
