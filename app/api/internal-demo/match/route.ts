import { NextResponse } from "next/server";

import { parseBriefWithAI } from "@/lib/talent-engine/ai-brief";
import { demoTalents } from "@/lib/talent-engine/demo-talents";
import { rankTalents } from "@/lib/talent-engine/matching";

export const runtime = "nodejs";

const scenarios: Record<string, string> = {
  corporate: "Corporate dinner 12 September 2026 di Jakarta, 500 orang, butuh band pop energetic, budget 20-30 juta.",
  wedding: "Wedding 18 September 2026 di Bali, ingin penyanyi wanita pop jazz yang elegant, budget maksimal 35 juta.",
  activation: "Brand activation 25 September 2026 di Bandung, audience muda, butuh MC energetic, budget 10-15 juta.",
  hotel: "Hotel lounge event 18 September 2026 di Jakarta, butuh acoustic duo jazz pop yang hangat dan elegan, budget 8-15 juta.",
  cultural: "Acara budaya perusahaan 12 September 2026 di Jakarta, butuh pertunjukan tradisional kontemporer Indonesia, budget 20-40 juta.",
  booked: "Corporate event 12 September 2026 di Jakarta, butuh band pop alternative premium, budget 30-50 juta.",
  stale: "Private event 18 September 2026 di Jakarta, butuh DJ commercial energetic, budget maksimal 25 juta.",
  tightBudget: "Wedding 18 September 2026 di Jakarta, butuh acoustic duo pop elegan, budget maksimal 7 juta.",
};

function isProduction() {
  return process.env.VERCEL_ENV === "production";
}

async function runMatch(text: string) {
  const { brief, source } = await parseBriefWithAI(text);
  const matches = rankTalents(demoTalents, brief, 5);

  return {
    source,
    brief,
    matches: matches.map((match) => ({
      talent: {
        id: match.talent.id,
        name: match.talent.name,
        category: match.talent.category,
        genres: match.talent.genres,
        baseCity: match.talent.baseCity,
        budgetMin: match.talent.budgetMin,
        budgetMax: match.talent.budgetMax,
        reliabilityScore: match.talent.reliabilityScore,
      },
      score: match.score,
      tier: match.tier,
      breakdown: match.breakdown,
      availabilityStatus: match.availabilityStatus,
      freshness: match.freshness,
      requiresLiveConfirmation: match.requiresLiveConfirmation,
      reasons: match.reasons,
    })),
  };
}

export async function GET(request: Request) {
  if (isProduction()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const url = new URL(request.url);
  const scenario = url.searchParams.get("scenario") ?? "corporate";

  if (scenario === "all") {
    const results = [];
    for (const [name, input] of Object.entries(scenarios)) {
      results.push({ scenario: name, input, ...(await runMatch(input)) });
    }
    return NextResponse.json({ selfTest: true, rosterSize: demoTalents.length, results });
  }

  const text = scenarios[scenario] ?? scenarios.corporate;
  const result = await runMatch(text);
  return NextResponse.json({ selfTest: true, scenario, input: text, ...result });
}

export async function POST(request: Request) {
  if (isProduction()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const text = typeof body?.text === "string" ? body.text.trim() : "";

  if (!text) {
    return NextResponse.json({ error: "Brief text is required" }, { status: 400 });
  }

  return NextResponse.json(await runMatch(text));
}
