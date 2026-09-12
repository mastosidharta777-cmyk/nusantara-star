import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import { POST as submitPublicBrief } from "@/app/api/brief/route";

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
  const marker = `LAUNCH-SMOKE-${stamp}`;
  const talentMarker = `LAUNCH-SMOKE-TALENT-${stamp}`;
  const email = `launch-smoke-${stamp}@example.com`;
  const eventDate = "2026-09-30";
  const supabase = getServerClient();
  let briefId: string | null = null;
  let talentId: string | null = null;

  try {
    const { data: talent, error: talentError } = await supabase
      .from("talents")
      .insert({
        name: talentMarker,
        category: "Band",
        genres: ["Pop", "Jazz"],
        music_styles: ["Pop", "Jazz"],
        vibe_tags: ["corporate"],
        capability_tags: [],
        base_city: "Jakarta",
        service_cities: ["Jakarta"],
        performance_formats: ["Full Band"],
        event_types: [],
        audience_tags: ["corporate"],
        budget_min: 90000000,
        budget_max: 130000000,
        reliability_score: 70,
        last_calendar_updated_at: new Date().toISOString(),
        status: "verified",
        onboarding_status: "approved",
        public_visible: true,
      })
      .select("id")
      .single();
    if (talentError || !talent?.id) throw new Error(`QA talent insert failed: ${talentError?.message ?? "missing id"}`);
    talentId = String(talent.id);

    const request = new Request("https://preview.local/api/brief", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: marker,
        company: "Nusantara Star QA",
        whatsapp: "+6281111111111",
        email,
        eventType: "Corporate event",
        date: eventDate,
        city: "Jakarta",
        venue: "Preview QA Venue",
        audience: "250",
        category: "Band",
        genre: "apa saja",
        budget: "Rp50–100 jt",
        duration: "30–60 minutes",
        notes: "Controlled launch readiness smoke test",
        website: "",
      }),
    });

    const response = await submitPublicBrief(request);
    const payload = (await response.json().catch(() => null)) as {
      ok?: boolean;
      received?: boolean;
      briefId?: string;
      requestMode?: string;
      nextStep?: string;
      candidates?: Array<Record<string, unknown>>;
      error?: string;
    } | null;
    if (!response.ok || !payload?.briefId) {
      return NextResponse.json({ ok: false, step: "submission", status: response.status, error: payload?.error ?? "missing brief id" }, { status: 500 });
    }
    briefId = payload.briefId;

    const [briefResult, matchesResult] = await Promise.all([
      supabase
        .from("briefs")
        .select("id,buyer_name,buyer_company,buyer_whatsapp,buyer_email,status,source_text")
        .eq("id", briefId)
        .single(),
      supabase
        .from("match_results")
        .select("id,talent_id,engine_version,generated_at")
        .eq("brief_id", briefId),
    ]);

    if (briefResult.error) throw new Error(briefResult.error.message);
    if (matchesResult.error) throw new Error(matchesResult.error.message);

    const row = briefResult.data;
    const matches = matchesResult.data ?? [];
    const qaMatch = matches.find((item) => item.talent_id === talentId);
    const checks = {
      submissionAccepted: payload.ok === true && payload.received === true,
      discoveryMode: payload.requestMode === "discovery",
      candidateReviewHandoff: payload.nextStep === "candidate_review",
      buyerSafeCandidateReturned: payload.candidates?.some((item) => item.id === talentId) === true,
      internalScoringWithheld: payload.candidates?.every((item) => !("score" in item) && !("reasons" in item)) === true,
      contactPersisted:
        row?.buyer_name === marker &&
        row?.buyer_company === "Nusantara Star QA" &&
        row?.buyer_whatsapp === "+6281111111111" &&
        row?.buyer_email === email,
      sourceTextExcludesContact: Boolean(row?.source_text) && !String(row.source_text).includes(marker) && !String(row.source_text).includes(email),
      briefStartsNew: row?.status === "new",
      qaTalentMatchedInternally: Boolean(qaMatch),
      unknownAvailabilityStillRequiresConfirmation:
        payload.candidates?.find((item) => item.id === talentId)?.availabilityStatus === "unknown" &&
        payload.candidates?.find((item) => item.id === talentId)?.requiresLiveConfirmation === true,
      frozenMatchSnapshot: Boolean(qaMatch?.engine_version && qaMatch?.generated_at),
    };

    return NextResponse.json({ ok: Object.values(checks).every(Boolean), checks, internalMatchCount: matches.length, cleanup: "automatic" });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unknown smoke error", cleanup: "attempted" }, { status: 500 });
  } finally {
    if (briefId) {
      const { error } = await supabase.from("briefs").delete().eq("id", briefId);
      if (error) console.error("Public brief smoke cleanup failed", error.message);
    }
    if (talentId) {
      await supabase.from("talent_availability").delete().eq("talent_id", talentId);
      const { error } = await supabase.from("talents").delete().eq("id", talentId);
      if (error) console.error("Public brief QA talent cleanup failed", error.message);
    }
  }
}
