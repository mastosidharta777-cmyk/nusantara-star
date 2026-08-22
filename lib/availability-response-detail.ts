import { createClient } from "@supabase/supabase-js";

function getServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) throw new Error("Supabase server environment is not configured");
  return createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function loadAvailabilityResponseDetail(id: string) {
  const supabase = getServerClient();
  const { data: request, error } = await supabase
    .from("availability_requests")
    .select("id,brief_id,talent_id,status,requested_at,responded_at")
    .eq("id", id)
    .single();

  if (error || !request) return null;

  const [briefResult, talentResult] = await Promise.all([
    supabase
      .from("briefs")
      .select("id,event_type,event_date,city,venue,talent_category,budget_min,budget_max,status")
      .eq("id", request.brief_id)
      .single(),
    supabase
      .from("talents")
      .select("id,name,category,base_city,manager_name")
      .eq("id", request.talent_id)
      .single(),
  ]);

  if (briefResult.error || !briefResult.data) throw new Error(briefResult.error?.message ?? "Brief not found");
  if (talentResult.error || !talentResult.data) throw new Error(talentResult.error?.message ?? "Talent not found");

  return {
    request,
    brief: briefResult.data,
    talent: talentResult.data,
  };
}
