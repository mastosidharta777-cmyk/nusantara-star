import { NextResponse } from "next/server";
import { persistBrief } from "@/lib/brief-persistence";
import { persistMatchSnapshot } from "@/lib/match-persistence";
import { parseBriefWithAI } from "@/lib/talent-engine/ai-brief";
import { rankTalents } from "@/lib/talent-engine/matching";
import { loadEngineTalents } from "@/lib/talent-engine/supabase-talents";
import type { EngineTalent } from "@/lib/talent-engine/types";

export const runtime = "nodejs";
const scenarios: Record<string, string> = {
  corporate: "Corporate dinner 12 September 2026 di Jakarta, 500 orang, butuh band pop energetic, budget 20-30 juta.",
  wedding: "Wedding 18 September 2026 di Bali, ingin penyanyi wanita pop jazz yang elegant, budget maksimal 35 juta.",
  activation: "Brand activation 25 September 2026 di Bandung, audience muda, butuh MC energetic, budget 10-15 juta.",
  hotel: "Hotel lounge event 18 September 2026 di Jakarta, butuh acoustic duo jazz pop yang hangat dan elegan, budget 8-15 juta.",
};
function isProduction() { return process.env.VERCEL_ENV === "production"; }
function testRoster(): EngineTalent[] {
  const now = new Date().toISOString();
  return [
    {
      id: "test-cover-rock", name: "Test Cover Rock", category: "Band", actType: "cover_performer",
      willingToPerformCovers: true, acceptsSongRequests: true,
      genres: ["Rock", "Pop"], musicStyles: ["Top 40", "Rock", "Indonesian Hits", "International Hits"],
      vibeTags: ["Upbeat", "Party", "High Energy"], capabilityTags: ["Singalong", "Danceable"],
      baseCity: "Jakarta", serviceCities: ["Jakarta", "Tangerang", "Bogor"], performanceFormats: ["Acoustic", "Full Band"],
      eventTypes: ["Corporate", "Wedding", "Private Party", "Brand Activation"], audienceTags: ["Corporate", "Party"],
      budgetMin: 15000000, budgetMax: 25000000, reliabilityScore: 92, lastCalendarUpdatedAt: now,
      availability: [{ date: "2026-09-20", status: "available" }], isDemo: true,
    },
    {
      id: "test-cover-pop", name: "Test Cover Pop Acoustic", category: "Band", actType: "cover_performer",
      willingToPerformCovers: true, acceptsSongRequests: false,
      genres: ["Pop"], musicStyles: ["Top 40", "Pop", "Indonesian Hits"],
      vibeTags: ["Elegant", "Warm", "Upbeat"], capabilityTags: ["Singalong", "Custom Setlist"],
      baseCity: "Jakarta", serviceCities: ["Jakarta", "Bandung"], performanceFormats: ["Acoustic", "Semi Acoustic"],
      eventTypes: ["Corporate", "Wedding", "Hotel"], audienceTags: ["Elegant", "Corporate"],
      budgetMin: 10000000, budgetMax: 18000000, reliabilityScore: 88, lastCalendarUpdatedAt: now,
      availability: [{ date: "2026-09-20", status: "available" }], isDemo: true,
    },
    {
      id: "test-original", name: "Test Original Artist", category: "Band", actType: "original_artist",
      willingToPerformCovers: false, acceptsSongRequests: false,
      genres: ["Rock", "Alternative"], musicStyles: ["Rock"], vibeTags: ["High Energy"], capabilityTags: [],
      baseCity: "Jakarta", serviceCities: ["Jakarta"], performanceFormats: ["Full Band"],
      eventTypes: ["Festival", "Corporate"], audienceTags: ["Young"], budgetMin: 20000000, budgetMax: 30000000,
      reliabilityScore: 90, lastCalendarUpdatedAt: now, availability: [{ date: "2026-09-20", status: "available" }], isDemo: true,
    },
  ];
}
function safeError(error: unknown) {
  const message = error instanceof Error ? error.message : "Unknown error";
  console.error("Internal demo match failed", message);
  return NextResponse.json({ error: "Internal demo match failed", detail: message }, { status: 500 });
}
async function runMatch(text: string, useTestRoster = false) {
  const [{ brief, source }, roster] = await Promise.all([parseBriefWithAI(text), loadEngineTalents()]);
  const talents = useTestRoster ? testRoster() : roster.talents;
  const matches = rankTalents(talents, brief, 5);
  return {
    source,
    rosterSource: useTestRoster ? "synthetic_test" : roster.source,
    rosterSize: talents.length,
    brief,
    matches: matches.map((match) => ({
      talent: {
        id: match.talent.id, name: match.talent.name, category: match.talent.category, actType: match.talent.actType,
        willingToPerformCovers: match.talent.willingToPerformCovers, acceptsSongRequests: match.talent.acceptsSongRequests,
        genres: match.talent.genres, musicStyles: match.talent.musicStyles, performanceFormats: match.talent.performanceFormats,
        vibeTags: match.talent.vibeTags, capabilityTags: match.talent.capabilityTags, baseCity: match.talent.baseCity,
        bookingLimitations: match.talent.bookingLimitations,
        budgetMin: match.talent.budgetMin, budgetMax: match.talent.budgetMax, reliabilityScore: match.talent.reliabilityScore,
      },
      score: match.score, tier: match.tier, breakdown: match.breakdown, availabilityStatus: match.availabilityStatus,
      freshness: match.freshness, requiresLiveConfirmation: match.requiresLiveConfirmation, reasons: match.reasons,
    })),
  };
}
export async function GET(request: Request) {
  if (isProduction()) return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
    const url = new URL(request.url);
    const customText = url.searchParams.get("text")?.trim() ?? "";
    const useTestRoster = url.searchParams.get("testRoster") === "1";
    if (customText) {
      const result = await runMatch(customText, useTestRoster);
      return NextResponse.json({ selfTest: false, input: customText, ...result });
    }
    const scenario = url.searchParams.get("scenario") ?? "corporate";
    const text = scenarios[scenario] ?? scenarios.corporate;
    const result = await runMatch(text, useTestRoster);
    return NextResponse.json({ selfTest: true, scenario, input: text, ...result });
  } catch (error) { return safeError(error); }
}
export async function POST(request: Request) {
  if (isProduction()) return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
    const body = await request.json().catch(() => null);
    const text = typeof body?.text === "string" ? body.text.trim() : "";
    if (!text) return NextResponse.json({ error: "Brief text is required" }, { status: 400 });
    const result = await runMatch(text, false);
    const persisted = await persistBrief(result.brief);
    const snapshot = await persistMatchSnapshot(persisted.id, result.matches);
    return NextResponse.json({ ...result, briefId: persisted.id, persisted: true, matchSnapshot: snapshot });
  } catch (error) { return safeError(error); }
}
