import { createClient } from "@supabase/supabase-js";

export type BuyerPreferenceRow = {
  id: string;
  proposal_id: string;
  proposal_item_id: string;
  talent_id: string;
  priority_rank: number;
  status: "ranked" | "active_priority" | "fallback" | "withdrawn" | "superseded" | "secured";
};

function getServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) throw new Error("Supabase server environment is not configured");
  return createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function loadBuyerPriorityState(briefId: string) {
  const supabase = getServerClient();
  const [preferenceResult, dealResult, bookingResult] = await Promise.all([
    supabase
      .from("buyer_preferences")
      .select("id,proposal_id,proposal_item_id,talent_id,priority_rank,status")
      .eq("brief_id", briefId)
      .eq("is_current", true)
      .order("priority_rank", { ascending: true }),
    supabase.from("deals").select("id,status").eq("brief_id", briefId).maybeSingle(),
    supabase.from("bookings").select("id,status").eq("brief_id", briefId).maybeSingle(),
  ]);

  if (dealResult.error && dealResult.error.code !== "42P01") throw new Error(dealResult.error.message);
  if (bookingResult.error && bookingResult.error.code !== "42P01") throw new Error(bookingResult.error.message);

  if (preferenceResult.error) {
    if (preferenceResult.error.code === "42P01") {
      return { preferences: [] as BuyerPreferenceRow[], locked: Boolean(dealResult.data || bookingResult.data) };
    }
    throw new Error(preferenceResult.error.message);
  }

  return {
    preferences: (preferenceResult.data ?? []) as BuyerPreferenceRow[],
    locked: Boolean(dealResult.data || bookingResult.data),
  };
}
