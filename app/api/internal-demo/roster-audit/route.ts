import { NextResponse } from "next/server";

import { parseBriefWithAI } from "@/lib/talent-engine/ai-brief";
import { scoreTalent } from "@/lib/talent-engine/matching";
import { loadEngineTalents } from "@/lib/talent-engine/supabase-talents";

export const runtime = "nodejs";

const sampleBrief =
  "Cari band cover untuk corporate di Jakarta tanggal 20 September 2026, budget 15-25 juta, Top 40 Rock, bisa acoustic saat dinner lalu full band, upbeat, singalong.";

function isProduction() {
  return process.env.VERCEL_ENV === "production";
}

export async function GET() {
  if (isProduction()) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    const [{ brief, source }, roster] = await Promise.all([parseBriefWithAI(sampleBrief), loadEngineTalents()]);

    const talents = roster.talents.map((talent) => {
      const result = scoreTalent(talent, brief);
      const missing: string[] = [];
      if (!talent.actType) missing.push("act_type");
      if (!talent.musicStyles?.length) missing.push("music_styles");
      if (!talent.performanceFormats?.length) missing.push("performance_formats");
      if (!talent.vibeTags?.length) missing.push("vibe_tags");
      if (!talent.capabilityTags?.length) missing.push("capability_tags");
      if (!talent.serviceCities?.length) missing.push("service_cities");
      if (!talent.budgetMin || !talent.budgetMax) missing.push("budget_range");
      if (!talent.availability?.length) missing.push("availability");

      return {
        id: talent.id,
        name: talent.name,
        category: talent.category,
        actType: talent.actType,
        genres: talent.genres,
        musicStyles: talent.musicStyles,
        performanceFormats: talent.performanceFormats,
        vibeTags: talent.vibeTags,
        capabilityTags: talent.capabilityTags,
        baseCity: talent.baseCity,
        serviceCities: talent.serviceCities,
        eventTypes: talent.eventTypes,
        bookingLimitations: talent.bookingLimitations,
        budgetMin: talent.budgetMin,
        budgetMax: talent.budgetMax,
        availability: talent.availability,
        lastCalendarUpdatedAt: talent.lastCalendarUpdatedAt,
        missing,
        score: result.score,
        tier: result.tier,
        blockedReasons: result.blockedReasons,
        breakdown: result.breakdown,
      };
    });

    return NextResponse.json({
      ok: true,
      source,
      rosterSource: roster.source,
      rosterSize: talents.length,
      sampleBrief,
      brief,
      talents,
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown error";
    console.error("Roster audit failed", detail);
    return NextResponse.json({ error: "Roster audit failed", detail }, { status: 500 });
  }
}
