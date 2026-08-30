import type { SupabaseClient } from "@supabase/supabase-js";

export async function commercialIntegrityReady(supabase: SupabaseClient) {
  const { data, error } = await supabase.rpc("ns_commercial_integrity_ready_v1");
  return !error && data === true;
}
