import { NextResponse } from "next/server";

import { parseBriefWithAI } from "@/lib/talent-engine/ai-brief";
import { rankTalents } from "@/lib/talent-engine/matching";
import { loadEngineTalents } from "@/lib/talent-engine/supabase-talents";

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

function safeError(error: unknown) {
  const message = error instanceof Error ? error.message : "Unknown error";
  console.error("Internal demo match failed", message);

  return NextResponse.json(
    {
      error: "Internal demo match failed",
      detail: message,
      env: {
        hasSupabaseUrl: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
        hasSupabaseServiceRoleKey: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
        vercelEnv: process.env.VERCEL_ENV ?? null,
      },
    },
    { status: 500 },
  );
}

async function runMatch(text: string) {
  const [{ brief, source }, roster] = await Promise.all([parseBriefWithAI(text), loadEngineTalents()]);
  const matches = rankTalents(roster.talents, brief, 5);

  return {
    source,
    rosterSource: roster.source,
    rosterSize: roster.talents.length,
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

  try {
    const url = new URL(request.url);
    const scenario = url.searchParams.get("scenario") ?? "corporate";

    if (scenario === "all") {
      const results = [];
      for (const [name, input] of Object.entries(scenarios)) {
        results.push({ scenario: name, input, ...(await runMatch(input)) });
      }
      return NextResponse.json({ selfTest: true, results });
    }

    const text = scenarios[scenario] ?? scenarios.corporate;
    const result = await runMatch(text);
    return NextResponse.json({ selfTest: true, scenario, input: text, ...result });
  } catch (error) {
    return safeError(error);
  }
}

export async function POST(request: Request) {
  if (isProduction()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const body = await request.json().catch(() => null);
    const text = typeof body?.text === "string" ? body.text.trim() : "";

    if (!text) {
      return NextResponse.json({ error: "Brief text is required" }, { status: 400 });
    }

    return NextResponse.json(await runMatch(text));
  } catch (error) {
    return safeError(error);
  }
}
