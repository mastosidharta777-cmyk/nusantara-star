import { createClient } from "@supabase/supabase-js";

import type { StructuredBrief } from "@/lib/talent-engine/types";

function getServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error("Supabase server environment is not configured");
  }

  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function persistBrief(brief: StructuredBrief) {
  const supabase = getServerClient();

  const { data, error } = await supabase
    .from("briefs")
    .insert({
      event_type: brief.eventType,
      event_date: brief.eventDate,
      city: brief.city,
      venue: brief.venue,
      audience_size: brief.audienceSize,
      talent_category: brief.talentCategory,
      genre_style: brief.genreStyle,
      budget_min: brief.budgetMin,
      budget_max: brief.budgetMax,
      performance_duration_minutes: brief.performanceDurationMinutes,
      event_vibe: brief.eventVibe,
      special_requirements: brief.specialRequirements,
      source_text: brief.sourceText ?? null,
      field_evidence: brief.fieldEvidence ?? {},
      status: "new",
    })
    .select("id")
    .single();

  if (error || !data?.id) {
    throw new Error(`Brief persistence failed: ${error?.message ?? "missing inserted id"}`);
  }

  return { id: String(data.id) };
}
