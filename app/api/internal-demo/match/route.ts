import { NextResponse } from "next/server";

import { parseBriefWithAI } from "@/lib/talent-engine/ai-brief";
import { demoTalents } from "@/lib/talent-engine/demo-talents";
import { rankTalents } from "@/lib/talent-engine/matching";

export const runtime = "nodejs";

const sampleBrief =
  "Corporate dinner di Jakarta tanggal 30 Agustus 2026, butuh female singer pop, budget 20-30 juta, suasana elegan.";

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
      breakdown: match.breakdown,
      availabilityStatus: match.availabilityStatus,
      freshness: match.freshness,
      requiresLiveConfirmation: match.requiresLiveConfirmation,
      reasons: match.reasons,
    })),
  };
}

export async function GET() {
  if (isProduction()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const result = await runMatch(sampleBrief);
  return NextResponse.json({ selfTest: true, ...result });
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
