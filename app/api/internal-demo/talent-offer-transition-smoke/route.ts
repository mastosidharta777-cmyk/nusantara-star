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
  let requestId = "";

  try {
    const eventDate = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
    const quoteValidUntil = new Date(Date.now() + 7 * 86400000).toISOString();

    const { data: talent, error: talentError } = await supabase.from("talents").insert({
      name: `Offer Transition Smoke ${stamp}`,
      category: "singer",
      status: "curated",
    }).select("id").single();
    if (talentError || !talent) throw new Error(talentError?.message ?? "Talent seed failed");
    talentId = talent.id;

    const { data: brief, error: briefError } = await supabase.from("briefs").insert({
      event_type: "Offer Transition Smoke",
      event_date: eventDate,
      city: "Jakarta",
      talent_category: "singer",
      status: "availability_check",
    }).select("id").single();
    if (briefError || !brief) throw new Error(briefError?.message ?? "Brief seed failed");
    briefId = brief.id;

    const { data: match, error: matchError } = await supabase.from("match_results").insert({
      brief_id: briefId,
      talent_id: talentId,
      score: 90,
      tier: "A",
      admin_approved: true,
      admin_rejected: false,
    }).select("id").single();
    if (matchError || !match) throw new Error(matchError?.message ?? "Match seed failed");

    const { data: availabilityRequest, error: requestError } = await supabase.from("availability_requests").insert({
      brief_id: briefId,
      talent_id: talentId,
      match_result_id: match.id,
      status: "pending",
    }).select("id").single();
    if (requestError || !availabilityRequest) throw new Error(requestError?.message ?? "Availability request seed failed");
    requestId = availabilityRequest.id;

    const tentative = await supabase.rpc("ns_record_availability_response_v1", {
      p_request_id: requestId,
      p_status: "tentative",
      p_event_fee: 900000,
      p_included_costs: "Standard performance",
      p_excluded_costs: null,
      p_payment_terms: "Subject to final confirmation",
      p_rider_exceptions: null,
      p_quote_valid_until: quoteValidUntil,
    });
    if (tentative.error) throw new Error(tentative.error.message);

    const [{ data: tentativeOffer }, { data: tentativeBrief }] = await Promise.all([
      supabase.from("talent_offers").select("status,availability_status,event_fee").eq("availability_request_id", requestId).single(),
      supabase.from("briefs").select("status").eq("id", briefId).single(),
    ]);

    const tentativeRecorded = tentativeOffer?.status === "changed" && tentativeOffer?.availability_status === "tentative" && Number(tentativeOffer?.event_fee) === 900000 && tentativeBrief?.status === "availability_check";

    const confirmed = await supabase.rpc("ns_record_availability_response_v1", {
      p_request_id: requestId,
      p_status: "confirmed",
      p_event_fee: 1000000,
      p_included_costs: "Standard performance",
      p_excluded_costs: null,
      p_payment_terms: "50% booking, 50% before show",
      p_rider_exceptions: null,
      p_quote_valid_until: quoteValidUntil,
    });
    if (confirmed.error) throw new Error(confirmed.error.message);

    const [{ data: finalOffer }, { data: finalBrief }, { data: finalCalendar }, { data: finalRequest }] = await Promise.all([
      supabase.from("talent_offers").select("status,availability_status,event_fee").eq("availability_request_id", requestId).single(),
      supabase.from("briefs").select("status").eq("id", briefId).single(),
      supabase.from("talent_availability").select("status").eq("talent_id", talentId).eq("event_date", eventDate).single(),
      supabase.from("availability_requests").select("status").eq("id", requestId).single(),
    ]);

    const tentativeToConfirmed = finalOffer?.status === "confirmed" && finalOffer?.availability_status === "confirmed" && Number(finalOffer?.event_fee) === 1000000;
    const briefAdvanced = finalBrief?.status === "shortlisted";
    const calendarUpdated = finalCalendar?.status === "available";
    const requestConfirmed = finalRequest?.status === "confirmed";

    return NextResponse.json({
      ok: tentativeRecorded && tentativeToConfirmed && briefAdvanced && calendarUpdated && requestConfirmed,
      checks: { tentativeRecorded, tentativeToConfirmed, briefAdvanced, calendarUpdated, requestConfirmed },
      cleanup: "automatic",
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  } finally {
    if (briefId) {
      await supabase.from("talent_offers").delete().eq("brief_id", briefId);
      await supabase.from("availability_requests").delete().eq("brief_id", briefId);
      await supabase.from("talent_availability").delete().eq("talent_id", talentId);
      await supabase.from("match_results").delete().eq("brief_id", briefId);
      await supabase.from("briefs").delete().eq("id", briefId);
    }
    if (talentId) await supabase.from("talents").delete().eq("id", talentId);
  }
}
