import { createClient } from "@supabase/supabase-js";

import { rankTalents } from "@/lib/talent-engine/matching";
import { loadEngineTalents } from "@/lib/talent-engine/supabase-talents";
import type { StructuredBrief } from "@/lib/talent-engine/types";

type BriefRow = {
  id: string;
  event_type: string | null;
  event_date: string | null;
  city: string | null;
  venue: string | null;
  audience_size: number | null;
  talent_category: string | null;
  genre_style: string[] | null;
  budget_min: number | null;
  budget_max: number | null;
  performance_duration_minutes: number | null;
  event_vibe: string[] | null;
  special_requirements: string[] | null;
  source_text: string | null;
};

export type PublicBriefCandidate = {
  id: string;
  name: string;
  category: string;
  baseCity: string;
  feeMin: number;
  feeMax: number;
  tier: "strong_match" | "acceptable_alternative";
  availabilityStatus: "available" | "tentative" | "booked" | "unavailable" | "unknown";
  requiresLiveConfirmation: boolean;
};

export type PublicBriefResult = {
  ok: true;
  briefId: string;
  candidates: PublicBriefCandidate[];
  nextStep: "candidate_review" | "admin_curation";
  brief: {
    eventType: string;
    eventDate: string;
    city: string;
    venue: string;
    audienceSize: number | null;
    category: string;
    genreStyle: string[];
    budget: string;
    duration: string;
  };
};

function budgetLabel(row: BriefRow) {
  if (row.budget_min == null && row.budget_max === 10_000_000) return "< Rp10 jt";
  if (row.budget_min === 10_000_000 && row.budget_max === 25_000_000) return "Rp10–25 jt";
  if (row.budget_min === 25_000_000 && row.budget_max === 50_000_000) return "Rp25–50 jt";
  if (row.budget_min === 50_000_000 && row.budget_max === 100_000_000) return "Rp50–100 jt";
  if (row.budget_min === 100_000_000 && row.budget_max == null) return "Rp100 jt+";
  return "Belum ditentukan";
}

function durationLabel(minutes: number | null) {
  if (minutes === 30) return "15–30 menit";
  if (minutes === 60) return "30–60 menit";
  if (minutes === 90) return "60–90 menit";
  return "Belum ditentukan";
}

function getServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) throw new Error("Supabase server environment is not configured");
  return createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

function toStructuredBrief(row: BriefRow): StructuredBrief {
  return {
    eventType: row.event_type,
    eventDate: row.event_date,
    city: row.city,
    venue: row.venue,
    audienceSize: row.audience_size,
    talentCategory: row.talent_category,
    genreStyle: row.genre_style ?? [],
    budgetMin: row.budget_min,
    budgetMax: row.budget_max,
    performanceDurationMinutes: row.performance_duration_minutes,
    eventVibe: row.event_vibe ?? [],
    specialRequirements: row.special_requirements ?? [],
    sourceText: row.source_text ?? undefined,
  };
}

export async function loadPublicBriefResult(briefId: string): Promise<PublicBriefResult | null> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(briefId)) return null;

  const supabase = getServerClient();
  const { data, error } = await supabase
    .from("briefs")
    .select("id,event_type,event_date,city,venue,audience_size,talent_category,genre_style,budget_min,budget_max,performance_duration_minutes,event_vibe,special_requirements,source_text")
    .eq("id", briefId)
    .eq("request_mode", "discovery")
    .maybeSingle();

  if (error) throw new Error(`Public brief result load failed: ${error.message}`);
  if (!data) return null;

  const roster = await loadEngineTalents();
  const candidates = rankTalents(roster.talents, toStructuredBrief(data as BriefRow), 3).map((match) => ({
    id: match.talent.id,
    name: match.talent.name,
    category: match.talent.category,
    baseCity: match.talent.baseCity,
    feeMin: match.talent.budgetMin,
    feeMax: match.talent.budgetMax,
    tier: match.tier === "strong_match" ? "strong_match" as const : "acceptable_alternative" as const,
    availabilityStatus: match.availabilityStatus,
    requiresLiveConfirmation: match.requiresLiveConfirmation,
  }));

  return {
    ok: true,
    briefId: data.id,
    candidates,
    nextStep: candidates.length ? "candidate_review" : "admin_curation",
    brief: {
      eventType: data.event_type ?? "Belum ditentukan",
      eventDate: data.event_date ?? "Belum ditentukan",
      city: data.city ?? "Belum ditentukan",
      venue: data.venue ?? "Belum ditentukan",
      audienceSize: data.audience_size,
      category: data.talent_category ?? "Belum ditentukan",
      genreStyle: data.genre_style ?? [],
      budget: budgetLabel(data as BriefRow),
      duration: durationLabel(data.performance_duration_minutes),
    },
  };
}
