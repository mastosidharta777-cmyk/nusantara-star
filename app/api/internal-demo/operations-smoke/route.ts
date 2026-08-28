import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import { POST as operationsAction } from "@/app/api/internal-demo/admin/operations/route";
import { POST as settlementAction } from "@/app/api/internal-demo/admin/settlement/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) throw new Error("Supabase server environment is not configured");
  return createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

type Handler = (request: Request) => Promise<Response>;
async function post(handler: Handler, body: Record<string, unknown>) {
  const response = await handler(new Request("http://internal", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));
  const json = await response.json().catch(() => null);
  return { response, json };
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

    const preShow = await post(operationsAction, { bookingId, action: "initialize_pre_show" });
    if (!preShow.response.ok || preShow.json?.status !== "pre_show") throw new Error(`Pre-show failed: ${JSON.stringify(preShow.json)}`);

    const incident = await post(operationsAction, { bookingId, action: "report_incident", incidentType: "technical_failure", summary: "Smoke test incident" });
    if (!incident.response.ok || !incident.json?.incidentId) throw new Error(`Incident report failed: ${JSON.stringify(incident.json)}`);
    const resolved = await post(operationsAction, { bookingId, action: "resolve_incident", incidentId: incident.json.incidentId, resolutionNotes: "Resolved in smoke" });
    if (!resolved.response.ok) throw new Error(`Incident resolution failed: ${JSON.stringify(resolved.json)}`);

    const completed = await post(operationsAction, { bookingId, action: "complete_show" });
    if (!completed.response.ok || completed.json?.bookingStatus !== "completed") throw new Error(`Completion failed: ${JSON.stringify(completed.json)}`);

    const unfundedKey = `ops-smoke-unfunded-${stamp}`;
    const unfunded = await post(settlementAction, { bookingId, amount: 1000000, provider: "smoke", providerReference: `unfunded-${stamp}`, idempotencyKey: unfundedKey, notes: "must be rejected before buyer cash" });
    const unfundedSettlementBlocked = !unfunded.response.ok;

    const { error: buyerPaymentError } = await supabase.from("payments").insert({ booking_id: bookingId, payment_type: "buyer_full_payment", amount: 1200000, status: "paid", paid_at: new Date().toISOString(), idempotency_key: `ops-smoke-buyer-${stamp}` });
    if (buyerPaymentError) throw new Error(buyerPaymentError.message);

    const key = `ops-smoke-${stamp}`;
    const first = await post(settlementAction, { bookingId, amount: 1000000, provider: "smoke", providerReference: `ref-${stamp}`, idempotencyKey: key, notes: "smoke" });
    if (!first.response.ok) throw new Error(`Settlement failed: ${JSON.stringify(first.json)}`);
    const second = await post(settlementAction, { bookingId, amount: 1000000, provider: "smoke", providerReference: `ref-${stamp}`, idempotencyKey: key, notes: "smoke retry" });
    if (!second.response.ok) throw new Error(`Settlement retry failed: ${JSON.stringify(second.json)}`);

    const [{ count: checklistCount }, { count: settlementCount }, { data: finalBooking }, { data: finalBrief }] = await Promise.all([
      supabase.from("pre_show_checklist_items").select("id", { count: "exact", head: true }).eq("booking_id", bookingId),
      supabase.from("talent_settlements").select("id", { count: "exact", head: true }).eq("booking_id", bookingId).eq("status", "paid"),
      supabase.from("bookings").select("status,completed_at").eq("id", bookingId).single(),
      supabase.from("briefs").select("status").eq("id", briefId).single(),
    ]);

    const checks = {
      preShowChecklistGenerated: checklistCount === 8,
      incidentLifecycleWorks: resolved.json?.incidentStatus === "resolved",
      showCompletionWorks: finalBooking?.status === "completed" && Boolean(finalBooking?.completed_at),
      legacyBriefClosed: finalBrief?.status === "closed",
      unfundedSettlementBlocked,
      fundedTalentSettlementWorks: settlementCount === 1,
      settlementIdempotent: settlementCount === 1,
    };
    return NextResponse.json({ ok: Object.values(checks).every(Boolean), checks, cleanup: "automatic" });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ ok: false, error: detail }, { status: 500 });
  } finally {
    if (bookingId) {
      await supabase.from("talent_settlements").delete().eq("booking_id", bookingId);
      await supabase.from("payments").delete().eq("booking_id", bookingId);
      await supabase.from("incidents").delete().eq("booking_id", bookingId);
      await supabase.from("pre_show_checklist_items").delete().eq("booking_id", bookingId);
      await supabase.from("bookings").delete().eq("id", bookingId);
    }
    if (briefId) await supabase.from("briefs").delete().eq("id", briefId);
    if (talentId) await supabase.from("talents").delete().eq("id", talentId);
  }
}
