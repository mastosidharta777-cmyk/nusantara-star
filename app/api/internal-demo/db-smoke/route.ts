import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import { persistMatchSnapshot } from "@/lib/match-persistence";
import { rankTalents } from "@/lib/talent-engine/matching";
import { loadEngineTalents } from "@/lib/talent-engine/supabase-talents";
import type { StructuredBrief } from "@/lib/talent-engine/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) throw new Error("Supabase server environment is not configured");
  return createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

function futureDate(days: number) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export async function GET() {
  if (process.env.VERCEL_ENV === "production") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const supabase = getServerClient();
  let talentId: string | null = null;
  let briefId: string | null = null;

  try {
    const eventDate = futureDate(30);
    const marker = `SMOKE-${Date.now()}`;

    const { data: talent, error: talentError } = await supabase
      .from("talents")
      .insert({
        name: marker,
        category: "singer",
        gender: "female",
        genres: ["pop"],
        base_city: "Jakarta",
        service_cities: ["Jakarta"],
        performance_formats: ["solo"],
        event_types: ["corporate"],
        audience_tags: ["pop", "corporate"],
        budget_min: 10000000,
        budget_max: 15000000,
        reliability_score: 90,
        last_calendar_updated_at: new Date().toISOString(),
        status: "verified",
        public_visible: false,
      })
      .select("id")
      .single();
    if (talentError || !talent?.id) throw new Error(`Talent insert failed: ${talentError?.message ?? "missing id"}`);
    talentId = String(talent.id);

    const { error: availabilityError } = await supabase.from("talent_availability").insert({
      talent_id: talentId,
      event_date: eventDate,
      status: "available",
      notes: "Temporary automated smoke test",
    });
    if (availabilityError) throw new Error(`Availability insert failed: ${availabilityError.message}`);

    const sourceText = `Corporate event in Jakarta on ${eventDate}. Need a female pop singer. Budget Rp10-15 juta.`;
    const structuredBrief: StructuredBrief = {
      eventType: "corporate",
      eventDate,
      city: "Jakarta",
      venue: "Smoke Test Venue",
      audienceSize: 300,
      talentCategory: "female singer",
      genreStyle: ["pop"],
      budgetMin: 10000000,
      budgetMax: 15000000,
      performanceDurationMinutes: 45,
      eventVibe: ["corporate", "pop"],
      specialRequirements: ["female singer"],
      sourceText,
      fieldEvidence: {},
    };

    const { data: brief, error: briefError } = await supabase
      .from("briefs")
      .insert({
        event_type: structuredBrief.eventType,
        event_date: structuredBrief.eventDate,
        city: structuredBrief.city,
        venue: structuredBrief.venue,
        audience_size: structuredBrief.audienceSize,
        talent_category: structuredBrief.talentCategory,
        genre_style: structuredBrief.genreStyle,
        budget_min: structuredBrief.budgetMin,
        budget_max: structuredBrief.budgetMax,
        performance_duration_minutes: structuredBrief.performanceDurationMinutes,
        event_vibe: structuredBrief.eventVibe,
        special_requirements: structuredBrief.specialRequirements,
        source_text: sourceText,
        field_evidence: {},
        status: "new",
      })
      .select("id")
      .single();
    if (briefError || !brief?.id) throw new Error(`Brief insert failed: ${briefError?.message ?? "missing id"}`);
    briefId = String(brief.id);

    const roster = await loadEngineTalents();
    const matches = rankTalents(roster.talents, structuredBrief, 5);
    const smokeMatch = matches.find((item) => item.talent.id === talentId);
    if (!smokeMatch) throw new Error("Matching engine did not return the eligible smoke-test talent");

    const snapshot = await persistMatchSnapshot(briefId, [smokeMatch]);

    const { data: persistedMatch, error: matchReadError } = await supabase
      .from("match_results")
      .select("id,engine_version,generated_at,score,tier")
      .eq("brief_id", briefId)
      .eq("talent_id", talentId)
      .single();
    if (matchReadError || !persistedMatch) throw new Error(`Persisted match read failed: ${matchReadError?.message ?? "missing row"}`);

    const now = new Date().toISOString();
    const { data: requestRow, error: requestError } = await supabase
      .from("availability_requests")
      .insert({
        brief_id: briefId,
        talent_id: talentId,
        match_result_id: persistedMatch.id,
        status: "pending",
        requested_at: now,
      })
      .select("id")
      .single();
    if (requestError || !requestRow?.id) throw new Error(`Availability request insert failed: ${requestError?.message ?? "missing id"}`);

    const { error: responseError } = await supabase
      .from("availability_requests")
      .update({ status: "confirmed", responded_at: new Date().toISOString() })
      .eq("id", requestRow.id);
    if (responseError) throw new Error(`Availability confirmation failed: ${responseError.message}`);

    const { data: confirmedRequest, error: confirmReadError } = await supabase
      .from("availability_requests")
      .select("status,responded_at")
      .eq("id", requestRow.id)
      .single();
    if (confirmReadError || confirmedRequest?.status !== "confirmed") {
      throw new Error(`Availability confirmation read failed: ${confirmReadError?.message ?? "unexpected status"}`);
    }

    return NextResponse.json({
      ok: true,
      database: "connected",
      checks: {
        talentInsert: true,
        availabilityInsert: true,
        briefInsert: true,
        matching: true,
        frozenMatchSnapshot: Boolean(persistedMatch.engine_version && persistedMatch.generated_at),
        availabilityRequest: true,
        liveConfirmation: true,
      },
      match: {
        score: smokeMatch.score,
        tier: smokeMatch.tier,
        engineVersion: snapshot.engineVersion,
      },
      cleanup: "automatic",
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown error";
    console.error("DB smoke test failed", detail);
    return NextResponse.json({ ok: false, error: "DB smoke test failed", detail }, { status: 500 });
  } finally {
    if (briefId) await supabase.from("briefs").delete().eq("id", briefId);
    if (talentId) await supabase.from("talents").delete().eq("id", talentId);
  }
}
