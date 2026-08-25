import { createClient } from "@supabase/supabase-js";

import type { AvailabilityStatus, EngineTalent, TalentActType, TalentGender } from "./types";

type TalentRow = {
  id: string;
  name: string;
  category: string;
  act_type: string | null;
  gender: string | null;
  genres: string[] | null;
  music_styles: string[] | null;
  vibe_tags: string[] | null;
  capability_tags: string[] | null;
  base_city: string | null;
  service_cities: string[] | null;
  performance_formats: string[] | null;
  event_types: string[] | null;
  audience_tags: string[] | null;
  budget_min: number | null;
  budget_max: number | null;
  reliability_score: number | null;
  last_calendar_updated_at: string | null;
  status: string;
};

type AvailabilityRow = {
  talent_id: string;
  event_date: string;
  status: AvailabilityStatus;
};

function getServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) return null;
  return createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

function normalizeGender(value: string | null): TalentGender {
  if (value === "female" || value === "male" || value === "mixed") return value;
  return "unknown";
}

function normalizeActType(value: string | null): TalentActType {
  if (value === "original_artist" || value === "cover_entertainment") return value;
  return null;
}

function isOperationalTalent(row: TalentRow) {
  return !row.name.toUpperCase().startsWith("SECURE-SMOKE-");
}

export async function loadEngineTalents(): Promise<{ talents: EngineTalent[]; source: "supabase" }> {
  const supabase = getServerClient();
  if (!supabase) throw new Error("Supabase server environment is not configured");

  const [{ data: talentData, error: talentError }, { data: availabilityData, error: availabilityError }] = await Promise.all([
    supabase
      .from("talents")
      .select("id,name,category,act_type,gender,genres,music_styles,vibe_tags,capability_tags,base_city,service_cities,performance_formats,event_types,audience_tags,budget_min,budget_max,reliability_score,last_calendar_updated_at,status")
      .in("status", ["curated", "verified"]),
    supabase.from("talent_availability").select("talent_id,event_date,status"),
  ]);

  if (talentError || availabilityError || !talentData) {
    throw new Error(`Supabase talent load failed: ${talentError?.message ?? availabilityError?.message ?? "unknown error"}`);
  }

  const availabilityByTalent = new Map<string, AvailabilityRow[]>();
  for (const row of (availabilityData ?? []) as AvailabilityRow[]) {
    const current = availabilityByTalent.get(row.talent_id) ?? [];
    current.push(row);
    availabilityByTalent.set(row.talent_id, current);
  }

  const talents: EngineTalent[] = (talentData as TalentRow[]).filter(isOperationalTalent).map((row) => ({
    id: row.id,
    name: row.name,
    category: row.category,
    actType: normalizeActType(row.act_type),
    gender: normalizeGender(row.gender),
    genres: row.genres ?? [],
    musicStyles: row.music_styles ?? [],
    vibeTags: row.vibe_tags ?? [],
    capabilityTags: row.capability_tags ?? [],
    baseCity: row.base_city ?? "",
    serviceCities: row.service_cities ?? [],
    performanceFormats: row.performance_formats ?? [],
    eventTypes: row.event_types ?? [],
    audienceTags: row.audience_tags ?? [],
    budgetMin: Number(row.budget_min ?? 0),
    budgetMax: Number(row.budget_max ?? 0),
    reliabilityScore: Number(row.reliability_score ?? 70),
    lastCalendarUpdatedAt: row.last_calendar_updated_at ?? "1970-01-01T00:00:00.000Z",
    availability: (availabilityByTalent.get(row.id) ?? []).map((entry) => ({ date: entry.event_date, status: entry.status })),
    isDemo: false,
  }));

  return { talents, source: "supabase" };
}
