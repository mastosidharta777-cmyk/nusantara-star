import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import { forwardOnlyBriefStatus } from "@/lib/brief-status";
import { verifyAccessToken } from "@/lib/signed-access";

export const runtime = "nodejs";
type ResponseStatus = "confirmed" | "tentative" | "unavailable" | "no_response";

function getServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) throw new Error("Supabase server environment is not configured");
  return createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
}
function nullableText(value: unknown) { return typeof value === "string" && value.trim() ? value.trim() : null; }

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const requestId = typeof body?.requestId === "string" ? body.requestId : "";
    const status = body?.status as ResponseStatus | undefined;
    const accessToken = typeof body?.accessToken === "string" ? body.accessToken : null;
    if (!requestId || !["confirmed", "tentative", "unavailable", "no_response"].includes(status ?? "")) return NextResponse.json({ error: "Invalid response payload" }, { status: 400 });
    if (process.env.VERCEL_ENV === "production" && !verifyAccessToken(accessToken, "talent_offer", requestId)) return NextResponse.json({ error: "Invalid or expired access link" }, { status: 401 });

    const rawFee = body?.eventFee;
    const eventFee = rawFee === null || rawFee === undefined || rawFee === "" ? null : Number(rawFee);
    if (eventFee !== null && (!Number.isFinite(eventFee) || eventFee < 0)) return NextResponse.json({ error: "Invalid event fee" }, { status: 400 });
    if (status === "confirmed" && (!eventFee || eventFee <= 0)) return NextResponse.json({ error: "Confirmed offer requires an event fee" }, { status: 409 });

    let quoteValidUntil: string | null = null;
    if (body?.quoteValidUntil) {
      const parsed = new Date(String(body.quoteValidUntil));
      if (Number.isNaN(parsed.getTime())) return NextResponse.json({ error: "Invalid quote validity" }, { status: 400 });
      if (parsed.getTime() <= Date.now()) return NextResponse.json({ error: "Quote validity must be in the future" }, { status: 409 });
      quoteValidUntil = parsed.toISOString();
    }

    const supabase = getServerClient();
    const { data: availabilityRequest, error: requestError } = await supabase.from("availability_requests").select("id,brief_id,talent_id,status").eq("id", requestId).single();
    if (requestError || !availabilityRequest) return NextResponse.json({ error: "Availability request not found" }, { status: 404 });
    const { data: brief, error: briefError } = await supabase.from("briefs").select("id,event_date,status").eq("id", availabilityRequest.brief_id).single();
    if (briefError || !brief) throw new Error(briefError?.message ?? "Brief not found");
    const now = new Date().toISOString();

    if (brief.event_date && status !== "no_response") {
      const calendarStatus = status === "confirmed" ? "available" : status;
      const { error: calendarError } = await supabase.from("talent_availability").upsert({ talent_id: availabilityRequest.talent_id, event_date: brief.event_date, status: calendarStatus, notes: `Live confirmation response for brief ${availabilityRequest.brief_id}`, updated_at: now }, { onConflict: "talent_id,event_date" });
      if (calendarError) throw new Error(calendarError.message);
      const { error: talentFreshnessError } = await supabase.from("talents").update({ last_calendar_updated_at: now }).eq("id", availabilityRequest.talent_id);
      if (talentFreshnessError) throw new Error(talentFreshnessError.message);
    }

    const { error: updateError } = await supabase.from("availability_requests").update({ status, responded_at: now }).eq("id", requestId);
    if (updateError) throw new Error(updateError.message);

    if (status !== "no_response") {
      const offerStatus = status === "unavailable" ? "unavailable" : availabilityRequest.status === "pending" ? "confirmed" : "changed";
      const { error: offerError } = await supabase.from("talent_offers").upsert({ availability_request_id: requestId, brief_id: availabilityRequest.brief_id, talent_id: availabilityRequest.talent_id, status: offerStatus, availability_status: status, event_fee: status === "unavailable" ? null : eventFee, currency: "IDR", included_costs: nullableText(body?.includedCosts), excluded_costs: nullableText(body?.excludedCosts), payment_terms: nullableText(body?.paymentTerms), rider_exceptions: nullableText(body?.riderExceptions), quote_valid_until: status === "unavailable" ? null : quoteValidUntil, confirmation_source: "manager_portal", confirmed_at: now, updated_at: now }, { onConflict: "availability_request_id" });
      if (offerError) throw new Error(`Talent offer persistence failed: ${offerError.message}`);
    }

    let proposedBriefStatus = "availability_check";
    if (status === "confirmed") {
      const { data: matchResult, error: matchError } = await supabase.from("match_results").select("admin_approved,admin_rejected").eq("brief_id", availabilityRequest.brief_id).eq("talent_id", availabilityRequest.talent_id).maybeSingle();
      if (matchError) throw new Error(matchError.message);
      if (matchResult?.admin_approved === true && matchResult?.admin_rejected !== true) proposedBriefStatus = "shortlisted";
    }
    const nextBriefStatus = forwardOnlyBriefStatus(brief.status, proposedBriefStatus);
    if (nextBriefStatus !== brief.status) {
      const { error: briefStatusError } = await supabase.from("briefs").update({ status: nextBriefStatus }).eq("id", availabilityRequest.brief_id).eq("status", brief.status);
      if (briefStatusError) throw new Error(briefStatusError.message);
    }
    return NextResponse.json({ ok: true, requestId, briefId: availabilityRequest.brief_id, talentId: availabilityRequest.talent_id, status, talentOffer: status !== "no_response", briefStatus: nextBriefStatus });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown error";
    console.error("Availability response failed", detail);
    return NextResponse.json({ error: "Availability response failed", detail }, { status: 500 });
  }
}
