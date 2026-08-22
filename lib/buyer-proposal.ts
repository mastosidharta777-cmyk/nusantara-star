import { createClient } from "@supabase/supabase-js";

type BriefRow = {
  id: string;
  event_type: string | null;
  event_date: string | null;
  city: string | null;
  venue: string | null;
  audience_size: number | null;
  talent_category: string | null;
  budget_min: number | null;
  budget_max: number | null;
  status: string;
};

type ProposalMatchRow = {
  talent_id: string;
  score: number;
  tier: string;
  admin_approved: boolean;
};

type TalentRow = {
  id: string;
  name: string;
  category: string;
  base_city: string | null;
  genres: string[] | null;
  budget_min: number | null;
  budget_max: number | null;
  bio: string | null;
  profile_image_url: string | null;
};

type AvailabilityRequestRow = {
  talent_id: string;
  status: string;
};

function getServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) throw new Error("Supabase server environment is not configured");
  return createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function loadBuyerProposal(briefId: string) {
  const supabase = getServerClient();
  const [{ data: brief, error: briefError }, { data: matches, error: matchError }, { data: requests, error: requestError }] = await Promise.all([
    supabase.from("briefs").select("id,event_type,event_date,city,venue,audience_size,talent_category,budget_min,budget_max,status").eq("id", briefId).single(),
    supabase.from("match_results").select("talent_id,score,tier,admin_approved").eq("brief_id", briefId).eq("admin_approved", true),
    supabase.from("availability_requests").select("talent_id,status").eq("brief_id", briefId).eq("status", "confirmed"),
  ]);

  if (briefError || !brief) return null;
  if (matchError) throw new Error(matchError.message);
  if (requestError) throw new Error(requestError.message);

  const confirmedTalentIds = new Set(((requests ?? []) as AvailabilityRequestRow[]).map((item) => item.talent_id));
  const approvedConfirmed = ((matches ?? []) as ProposalMatchRow[]).filter((item) => confirmedTalentIds.has(item.talent_id));

  if (approvedConfirmed.length === 0) {
    return { brief: brief as BriefRow, talents: [] as Array<TalentRow & { score: number; tier: string }> };
  }

  const talentIds = approvedConfirmed.map((item) => item.talent_id);
  const { data: talents, error: talentError } = await supabase
    .from("talents")
    .select("id,name,category,base_city,genres,budget_min,budget_max,bio,profile_image_url")
    .in("id", talentIds);
  if (talentError) throw new Error(talentError.message);

  const matchMap = new Map(approvedConfirmed.map((item) => [item.talent_id, item]));
  const ordered = ((talents ?? []) as TalentRow[])
    .map((talent) => {
      const match = matchMap.get(talent.id)!;
      return { ...talent, score: match.score, tier: match.tier };
    })
    .sort((a, b) => b.score - a.score);

  return { brief: brief as BriefRow, talents: ordered };
}
