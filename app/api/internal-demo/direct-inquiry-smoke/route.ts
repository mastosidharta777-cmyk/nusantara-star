import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import { POST as submitPublicBrief } from "@/app/api/brief/route";
import { POST as adminMatchAction } from "@/app/api/internal-demo/admin/match-action/route";
import { GET as loadProposalCandidates } from "@/app/api/internal-demo/admin/proposal-sent/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isProduction() {
  return process.env.VERCEL_ENV === "production";
}

function getServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) throw new Error("Supabase server environment is not configured");
  return createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function GET() {
  if (isProduction()) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const stamp = Date.now();
  const talentMarker = `DIRECT-INQUIRY-SMOKE-${stamp}`;
  const eventDate = "2026-10-01";
  const supabase = getServerClient();
  let briefId: string | null = null;
  let talentId: string | null = null;

  try {
    const { data: talent, error: talentError } = await supabase
      .from("talents")
      .insert({
        name: talentMarker,
        category: "singer",
        genres: ["pop"],
        music_styles: ["pop"],
        vibe_tags: ["corporate"],
        capability_tags: [],
        base_city: "Jakarta",
        service_cities: ["Jakarta"],
        performance_formats: ["solo"],
        event_types: ["corporate"],
        audience_tags: ["corporate"],
        budget_min: 10000000,
        budget_max: 15000000,
        reliability_score: 90,
        status: "verified",
        onboarding_status: "approved",
        public_visible: true,
      })
      .select("id")
      .single();
    if (talentError || !talent?.id) throw new Error(`QA talent insert failed: ${talentError?.message ?? "missing id"}`);
    talentId = String(talent.id);

    const submission = await submitPublicBrief(new Request("https://preview.local/api/brief", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Direct Inquiry QA",
        company: "Nusantara Star QA",
        whatsapp: "+6281111111111",
        email: `direct-${stamp}@example.com`,
        eventType: "Corporate event",
        date: eventDate,
        city: "Jakarta",
        venue: "Preview QA Venue",
        audience: "250",
        category: "Singer",
        genre: "",
        budget: "Rp10–25 jt",
        duration: "30–60 minutes",
        notes: "Controlled direct inquiry smoke test",
        requestedTalentId: talentId,
        website: "",
      }),
    }));
    const submissionPayload = await submission.json().catch(() => null) as { briefId?: string; requestMode?: string; requestedTalent?: { id?: string } | null; recommendations?: unknown[]; error?: string } | null;
    if (!submission.ok || !submissionPayload?.briefId) throw new Error(submissionPayload?.error ?? `Submission failed ${submission.status}`);
    briefId = submissionPayload.briefId;

    const [{ data: initialBrief, error: initialBriefError }, { data: initialMatches, error: initialMatchError }] = await Promise.all([
      supabase.from("briefs").select("request_mode,requested_talent_id,status").eq("id", briefId).single(),
      supabase.from("match_results").select("id").eq("brief_id", briefId),
    ]);
    if (initialBriefError) throw new Error(initialBriefError.message);
    if (initialMatchError) throw new Error(initialMatchError.message);

    const actionResponse = await adminMatchAction(new Request("https://preview.local/api/internal-demo/admin/match-action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ briefId, talentId, action: "request_live_confirmation" }),
    }));
    const actionPayload = await actionResponse.json().catch(() => null) as { availabilityRequestId?: string; matchResultId?: string | null; briefStatus?: string; error?: string } | null;
    if (!actionResponse.ok || !actionPayload?.availabilityRequestId) throw new Error(actionPayload?.error ?? `Direct action failed ${actionResponse.status}`);

    const { data: requestRow, error: requestRowError } = await supabase
      .from("availability_requests")
      .select("id,talent_id,match_result_id,status")
      .eq("id", actionPayload.availabilityRequestId)
      .single();
    if (requestRowError) throw new Error(requestRowError.message);

    const { data: responseData, error: responseError } = await supabase.rpc("ns_record_availability_response_v1", {
      p_request_id: actionPayload.availabilityRequestId,
      p_status: "confirmed",
      p_event_fee: 12500000,
      p_included_costs: "Performance fee",
      p_excluded_costs: "Travel if required",
      p_payment_terms: "Event-specific manager-confirmed terms",
      p_rider_exceptions: null,
      p_quote_valid_until: "2026-10-15T12:00:00.000Z",
    });
    if (responseError) throw new Error(responseError.message);

    const [{ data: finalBrief, error: finalBriefError }, { data: offer, error: offerError }] = await Promise.all([
      supabase.from("briefs").select("status").eq("id", briefId).single(),
      supabase.from("talent_offers").select("talent_id,status,availability_status,event_fee").eq("brief_id", briefId).eq("talent_id", talentId).single(),
    ]);
    if (finalBriefError) throw new Error(finalBriefError.message);
    if (offerError) throw new Error(offerError.message);

    const proposalResponse = await loadProposalCandidates(new Request(`https://preview.local/api/internal-demo/admin/proposal-sent?briefId=${briefId}`));
    const proposalPayload = await proposalResponse.json().catch(() => null) as { candidates?: Array<{ talentId?: string }>; requestMode?: string; error?: string } | null;
    if (!proposalResponse.ok) throw new Error(proposalPayload?.error ?? `Proposal candidate load failed ${proposalResponse.status}`);

    const checks = {
      directIntentPersisted: initialBrief?.request_mode === "direct_talent" && initialBrief?.requested_talent_id === talentId,
      responseCarriesDirectIntent: submissionPayload.requestMode === "direct_talent" && submissionPayload.requestedTalent?.id === talentId,
      noGenericRecommendations: Array.isArray(submissionPayload.recommendations) && submissionPayload.recommendations.length === 0,
      noGenericMatchSnapshot: (initialMatches ?? []).length === 0,
      directAvailabilityRequest: requestRow?.talent_id === talentId && requestRow?.match_result_id === null && requestRow?.status === "pending",
      adminActionAdvancedBrief: actionPayload.briefStatus === "availability_check" && actionPayload.matchResultId === null,
      managerConfirmationRecorded: responseData?.status === "confirmed" && offer?.talent_id === talentId && offer?.status === "confirmed" && offer?.availability_status === "confirmed" && Number(offer?.event_fee) === 12500000,
      directConfirmationReadyForProposal: finalBrief?.status === "shortlisted",
      proposalUsesRequestedTalent: proposalPayload?.requestMode === "direct_talent" && proposalPayload?.candidates?.length === 1 && proposalPayload.candidates[0]?.talentId === talentId,
    };

    return NextResponse.json({ ok: Object.values(checks).every(Boolean), checks, cleanup: "automatic" });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unknown direct inquiry smoke error", cleanup: "attempted" }, { status: 500 });
  } finally {
    if (briefId) await supabase.from("briefs").delete().eq("id", briefId);
    if (talentId) await supabase.from("talents").delete().eq("id", talentId);
  }
}
