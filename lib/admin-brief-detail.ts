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
  status: string;
  created_at: string;
};

type PersistedMatch = {
  talent_id: string;
  admin_approved: boolean;
  admin_rejected: boolean;
};

type AvailabilityRequest = {
  id: string;
  talent_id: string;
  status: string;
};

type BuyerSelection = {
  talent_id: string;
  status: string;
};

type CommercialTerms = {
  buyer_price: number;
  talent_payable: number;
  direct_costs: number;
  taxes_and_payment_fees: number;
  payment_terms: string | null;
  cancellation_terms: string | null;
  notes: string | null;
  status: string;
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
  const [{ data, error }, persistedMatchesResult, availabilityRequestsResult, buyerSelectionResult, commercialTermsResult] = await Promise.all([
    supabase
      .from("briefs")
      .select("id,event_type,event_date,city,venue,audience_size,talent_category,genre_style,budget_min,budget_max,performance_duration_minutes,event_vibe,special_requirements,status,created_at")
      .eq("id", id)
      .single(),
    supabase.from("match_results").select("talent_id,admin_approved,admin_rejected").eq("brief_id", id),
    supabase.from("availability_requests").select("id,talent_id,status").eq("brief_id", id),
    supabase.from("buyer_selections").select("talent_id,status").eq("brief_id", id).eq("status", "selected").maybeSingle(),
    supabase
      .from("commercial_terms")
      .select("buyer_price,talent_payable,direct_costs,taxes_and_payment_fees,payment_terms,cancellation_terms,notes,status")
      .eq("brief_id", id)
      .maybeSingle(),
  ]);

  if (error || !data) return null;
  if (persistedMatchesResult.error) throw new Error(persistedMatchesResult.error.message);
  if (availabilityRequestsResult.error) throw new Error(availabilityRequestsResult.error.message);
  if (buyerSelectionResult.error) throw new Error(buyerSelectionResult.error.message);
  if (commercialTermsResult.error) throw new Error(commercialTermsResult.error.message);

  const row = data as BriefRow;
  const brief: StructuredBrief = {
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
  };

  const roster = await loadEngineTalents();
  const matches = rankTalents(roster.talents, brief, 5);
  const persistedMap = new Map(
    ((persistedMatchesResult.data ?? []) as PersistedMatch[]).map((item) => [item.talent_id, item]),
  );
  const requestMap = new Map(
    ((availabilityRequestsResult.data ?? []) as AvailabilityRequest[]).map((item) => [item.talent_id, item]),
  );
  const buyerSelection = (buyerSelectionResult.data ?? null) as BuyerSelection | null;
  const selectedTalent = buyerSelection ? roster.talents.find((talent) => talent.id === buyerSelection.talent_id) ?? null : null;

  return {
    row,
    brief,
    selectedTalent,
    commercialTerms: (commercialTermsResult.data ?? null) as CommercialTerms | null,
    matches: matches.map((match) => {
      const persisted = persistedMap.get(match.talent.id);
      const request = requestMap.get(match.talent.id);
      const decision = persisted?.admin_approved ? "approved" : persisted?.admin_rejected ? "rejected" : "pending";
      return {
        ...match,
        decision: decision as "approved" | "rejected" | "pending",
        availabilityRequestId: request?.id ?? null,
        availabilityRequestStatus: request?.status ?? null,
      };
    }),
  };
}
