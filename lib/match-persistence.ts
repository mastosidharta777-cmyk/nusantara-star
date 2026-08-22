import { createClient } from "@supabase/supabase-js";

import type { AvailabilityFreshness, AvailabilityStatus, MatchBreakdown, MatchTier } from "@/lib/talent-engine/types";

export const MATCH_ENGINE_VERSION = "matching-v1.1-integrity";

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
  if (!matches.length) return { count: 0, engineVersion: MATCH_ENGINE_VERSION };

  const supabase = getServerClient();
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

  const { error } = await supabase.from("match_results").upsert(rows, { onConflict: "brief_id,talent_id" });
  if (error) throw new Error(`Match snapshot persistence failed: ${error.message}`);

  return { count: rows.length, engineVersion: MATCH_ENGINE_VERSION };
}
