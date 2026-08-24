import { createClient } from "@supabase/supabase-js";

import type { AvailabilityFreshness, AvailabilityStatus, MatchBreakdown, MatchTier } from "@/lib/talent-engine/types";

export const MATCH_ENGINE_VERSION = "matching-v1.2-frozen-snapshot";

type SnapshotMatch = {
  talent: { id: string };
  score: number;
  tier: MatchTier;
  breakdown: MatchBreakdown;
  availabilityStatus: AvailabilityStatus | "unknown";
  freshness: AvailabilityFreshness;
  requiresLiveConfirmation: boolean;
  reasons: string[];
};

function getServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) throw new Error("Supabase server environment is not configured");
  return createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function persistMatchSnapshot(briefId: string, matches: SnapshotMatch[]) {
  if (!matches.length) {
    return { count: 0, engineVersion: MATCH_ENGINE_VERSION, generatedAt: null, frozen: false };
  }

  const supabase = getServerClient();

  // A generated matching snapshot is immutable. Admin review may change review
  // flags on the rows, but calling the matching engine again must not silently
  // rewrite the score/reasons/version already shown for this brief.
  const { data: existingFrozen, error: existingError } = await supabase
    .from("match_results")
    .select("talent_id,engine_version,generated_at")
    .eq("brief_id", briefId)
    .not("engine_version", "is", null)
    .not("generated_at", "is", null);

  if (existingError) throw new Error(`Match snapshot read failed: ${existingError.message}`);
  if ((existingFrozen ?? []).length > 0) {
    const generatedAt = existingFrozen
      ?.map((row) => (typeof row.generated_at === "string" ? row.generated_at : null))
      .filter((value): value is string => Boolean(value))
      .sort()
      .at(-1) ?? null;
    const engineVersion =
      existingFrozen?.find((row) => typeof row.engine_version === "string")?.engine_version ?? MATCH_ENGINE_VERSION;

    return {
      count: existingFrozen?.length ?? 0,
      engineVersion,
      generatedAt,
      frozen: true,
    };
  }

  const generatedAt = new Date().toISOString();
  const rows = matches.map((match) => ({
    brief_id: briefId,
    talent_id: match.talent.id,
    score: match.score,
    tier: match.tier,
    availability_status: match.availabilityStatus,
    availability_freshness: match.freshness,
    requires_live_confirmation: match.requiresLiveConfirmation,
    score_breakdown: match.breakdown,
    reasons: match.reasons,
    engine_version: MATCH_ENGINE_VERSION,
    generated_at: generatedAt,
  }));

  // Upsert is intentional only for upgrading legacy review rows that do not yet
  // carry engine_version/generated_at. Once frozen metadata exists, the early
  // return above prevents regeneration from overwriting the snapshot.
  const { error } = await supabase.from("match_results").upsert(rows, { onConflict: "brief_id,talent_id" });
  if (error) throw new Error(`Match snapshot persistence failed: ${error.message}`);

  return {
    count: rows.length,
    engineVersion: MATCH_ENGINE_VERSION,
    generatedAt,
    frozen: false,
  };
}
