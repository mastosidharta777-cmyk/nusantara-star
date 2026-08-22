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
      talent_category: brief.talentCategory,
      budget_min: brief.budgetMin,
      budget_max: brief.budgetMax,
      status: "new",
    })
    .select("id")
    .single();

  if (error || !data?.id) {
    throw new Error(`Brief persistence failed: ${error?.message ?? "missing inserted id"}`);
  }

  return { id: String(data.id) };
}
