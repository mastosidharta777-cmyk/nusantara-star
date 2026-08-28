import { createClient } from "@supabase/supabase-js";
import { createR2PresignedUrl } from "@/lib/r2-presign";

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

type ProposalRow = {
  id: string;
  brief_id: string;
  version: number;
  status: string;
  expires_at: string | null;
  sent_at: string | null;
};

type WhyFitSnapshot = { id?: string[]; en?: string[] };
type MediaSnapshot = { id: string; provider: string; storage_key: string; title: string | null; description: string | null; asset_type: string };

type ProposalItemRow = {
  id: string;
  talent_id: string;
  buyer_price: number;
  currency: string;
  availability_status: string;
  included_costs: string | null;
  excluded_costs: string | null;
  payment_terms: string | null;
  rider_exceptions: string | null;
  offer_valid_until: string | null;
  talent_name_snapshot: string;
  talent_category_snapshot: string;
  talent_base_city_snapshot: string | null;
  talent_genres_snapshot: string[] | null;
  talent_bio_snapshot: string | null;
  talent_profile_image_url_snapshot: string | null;
  match_score_snapshot: number | null;
  match_tier_snapshot: string | null;
  why_fit_snapshot: WhyFitSnapshot | null;
  media_snapshot: MediaSnapshot[] | null;
};

type BuyerSelectionRow = {
  talent_id: string;
  status: string;
};

function getServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) throw new Error("Supabase server environment is not configured");
  return createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function markBuyerProposalViewed(proposalId: string) {
  const supabase = getServerClient();
  const now = new Date().toISOString();
  const { error } = await supabase.from("proposals").update({ status: "viewed", viewed_at: now, updated_at: now }).eq("id", proposalId).eq("status", "sent");
  if (error) throw new Error(error.message);
}

export async function loadBuyerProposal(briefId: string) {
  const supabase = getServerClient();
  const [{ data: brief, error: briefError }, { data: proposal, error: proposalError }, { data: selection, error: selectionError }] = await Promise.all([
    supabase.from("briefs").select("id,event_type,event_date,city,venue,audience_size,talent_category,budget_min,budget_max,status").eq("id", briefId).single(),
    supabase
      .from("proposals")
      .select("id,brief_id,version,status,expires_at,sent_at")
      .eq("brief_id", briefId)
      .in("status", ["sent", "viewed", "selected", "revision_requested", "expired"])
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase.from("buyer_selections").select("talent_id,status").eq("brief_id", briefId).eq("status", "selected").maybeSingle(),
  ]);

  if (briefError || !brief) return null;
  if (proposalError) throw new Error(proposalError.message);
  if (selectionError) throw new Error(selectionError.message);

  if (!proposal) {
    return { brief: brief as BriefRow, proposal: null, talents: [], selectedTalentId: selection ? (selection as BuyerSelectionRow).talent_id : null };
  }

  const proposalRow = proposal as ProposalRow;
  if (proposalRow.status === "expired" || (proposalRow.expires_at && new Date(proposalRow.expires_at).getTime() <= Date.now())) {
    if (proposalRow.status !== "expired") await supabase.from("proposals").update({ status: "expired", updated_at: new Date().toISOString() }).eq("id", proposalRow.id).in("status", ["sent", "viewed"]);
    return { brief: brief as BriefRow, proposal: { ...proposalRow, status: "expired" }, talents: [], selectedTalentId: selection ? (selection as BuyerSelectionRow).talent_id : null };
  }
  if (proposalRow.status === "revision_requested") {
    return { brief: brief as BriefRow, proposal: proposalRow, talents: [], selectedTalentId: selection ? (selection as BuyerSelectionRow).talent_id : null };
  }

  const { data: items, error: itemError } = await supabase
    .from("proposal_items")
    .select("id,talent_id,buyer_price,currency,availability_status,included_costs,excluded_costs,payment_terms,rider_exceptions,offer_valid_until,talent_name_snapshot,talent_category_snapshot,talent_base_city_snapshot,talent_genres_snapshot,talent_bio_snapshot,talent_profile_image_url_snapshot,match_score_snapshot,match_tier_snapshot,why_fit_snapshot,media_snapshot")
    .eq("proposal_id", proposalRow.id)
    .order("match_score_snapshot", { ascending: false });
  if (itemError) throw new Error(itemError.message);

  const selectedTalentId = selection ? (selection as BuyerSelectionRow).talent_id : null;
  const talents = ((items ?? []) as ProposalItemRow[]).map((item) => {
    const whyFit = item.why_fit_snapshot ?? {};
    const media = Array.isArray(item.media_snapshot) ? item.media_snapshot.flatMap((asset) => {
      if (asset?.provider !== "cloudflare_r2" || !asset.storage_key) return [];
      return [{ id: asset.id, title: asset.title, description: asset.description, asset_type: asset.asset_type, url: createR2PresignedUrl("GET", asset.storage_key, 3600) }];
    }) : [];
    return {
      id: item.talent_id,
      proposalItemId: item.id,
      name: item.talent_name_snapshot,
      category: item.talent_category_snapshot,
      base_city: item.talent_base_city_snapshot,
      genres: item.talent_genres_snapshot ?? [],
      bio: item.talent_bio_snapshot,
      profile_image_url: item.talent_profile_image_url_snapshot,
      buyer_price: Number(item.buyer_price),
      currency: item.currency,
      availability_status: item.availability_status,
      included_costs: item.included_costs,
      excluded_costs: item.excluded_costs,
      payment_terms: item.payment_terms,
      rider_exceptions: item.rider_exceptions,
      offer_valid_until: item.offer_valid_until,
      score: item.match_score_snapshot,
      tier: item.match_tier_snapshot,
      why_fit: { id: Array.isArray(whyFit.id) ? whyFit.id : [], en: Array.isArray(whyFit.en) ? whyFit.en : [] },
      media,
    };
  });

  return { brief: brief as BriefRow, proposal: proposalRow, talents, selectedTalentId };
}
