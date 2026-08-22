import { createClient } from "@supabase/supabase-js";

import { rankTalents } from "@/lib/talent-engine/matching";
import { loadEngineTalents } from "@/lib/talent-engine/supabase-talents";
import type { StructuredBrief } from "@/lib/talent-engine/types";

type BriefRow = {
  id: string;
  event_type: string | null;
  event_date: string | null;
  city: string | null;
  talent_category: string | null;
  budget_min: number | null;
  budget_max: number | null;
  status: string;
  created_at: string;
};

function getServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) throw new Error("Supabase server environment is not configured");

  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function loadAdminBriefDetail(id: string) {
  const supabase = getServerClient();
  const { data, error } = await supabase
    .from("briefs")
    .select("id,event_type,event_date,city,talent_category,budget_min,budget_max,status,created_at")
    .eq("id", id)
    .single();

  if (error || !data) return null;

  const row = data as BriefRow;
  const brief: StructuredBrief = {
    eventType: row.event_type,
    eventDate: row.event_date,
    city: row.city,
    venue: null,
    audienceSize: null,
    talentCategory: row.talent_category,
    genreStyle: [],
    budgetMin: row.budget_min,
    budgetMax: row.budget_max,
    performanceDurationMinutes: null,
    eventVibe: [],
    specialRequirements: [],
  };

  const roster = await loadEngineTalents();
  const matches = rankTalents(roster.talents, brief, 5);

  return { row, brief, matches };
}
