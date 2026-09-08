import { createClient } from "@supabase/supabase-js";

export type BuyerPaymentMilestone = {
  milestone_type?: string;
  sequence_no?: number;
  calculation_type?: string;
  percentage?: number | null;
  amount?: number | null;
  due_basis?: string;
  due_offset_days?: number | null;
  custom_due_date?: string | null;
};

function getServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) throw new Error("Supabase server environment is not configured");
  return createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function loadBuyerTerms(bookingId: string) {
  const supabase = getServerClient();
  const { data: booking, error: bookingError } = await supabase
    .from("bookings")
    .select("id,brief_id,deal_id,talent_id,status,event_date,venue,city,buyer_price,talent_payable,direct_cost,buyer_terms_accepted_at,buyer_terms_accepted_deal_id,buyer_terms_acceptance_source")
    .eq("id", bookingId)
    .maybeSingle();
  if (bookingError || !booking || !booking.deal_id) return null;

  const { data: deal, error: dealError } = await supabase
    .from("deals")
    .select("id,brief_id,proposal_item_id,talent_offer_id,talent_id,status,buyer_price,talent_payable,direct_costs,buyer_payment_schedule,cancellation_terms,rider_notes,special_conditions,buyer_terms_status,talent_terms_status,funding_gap_status,unresolved_issues,exception_status")
    .eq("id", booking.deal_id)
    .maybeSingle();
  if (dealError || !deal || deal.brief_id !== booking.brief_id || deal.talent_id !== booking.talent_id) return null;

  const [briefResult, talentResult, itemResult, offerResult] = await Promise.all([
    supabase.from("briefs").select("id,status,event_type,event_date,city,venue").eq("id", booking.brief_id).maybeSingle(),
    supabase.from("talents").select("id,name").eq("id", booking.talent_id).maybeSingle(),
    supabase.from("proposal_items").select("id,included_costs,excluded_costs").eq("id", deal.proposal_item_id).maybeSingle(),
    supabase.from("talent_offers").select("id,brief_id,talent_id,status,availability_status,quote_valid_until").eq("id", deal.talent_offer_id).maybeSingle(),
  ]);
  if (briefResult.error || talentResult.error || itemResult.error || offerResult.error) throw new Error("Buyer terms source data could not be loaded");
  if (!briefResult.data || !talentResult.data || !offerResult.data) return null;

  const milestones = Array.isArray(deal.buyer_payment_schedule) ? deal.buyer_payment_schedule as BuyerPaymentMilestone[] : [];
  const quoteValidUntil = offerResult.data.quote_valid_until as string | null;
  const quoteMs = quoteValidUntil ? new Date(quoteValidUntil).getTime() : Number.NaN;
  const offerCurrent = offerResult.data.brief_id === booking.brief_id
    && offerResult.data.talent_id === booking.talent_id
    && offerResult.data.status === "confirmed"
    && offerResult.data.availability_status === "confirmed"
    && Number.isFinite(quoteMs)
    && quoteMs > Date.now();
  const chainSnapshotValid = booking.buyer_price === deal.buyer_price
    && booking.talent_payable === deal.talent_payable
    && Number(booking.direct_cost ?? 0) === Number(deal.direct_costs ?? 0)
    && booking.event_date === briefResult.data.event_date;
  const accepted = Boolean(
    booking.buyer_terms_accepted_at
    && booking.buyer_terms_accepted_deal_id === deal.id
    && booking.buyer_terms_acceptance_source === "signed_buyer_link"
    && deal.buyer_terms_status === "accepted",
  );
  const unresolvedIssues = Array.isArray(deal.unresolved_issues) ? deal.unresolved_issues : [];
  const commercialStateReady = deal.talent_terms_status === "confirmed"
    && deal.funding_gap_status === "safe"
    && (unresolvedIssues.length === 0 || deal.exception_status === "approved")
    && ["recommended", "accepted"].includes(deal.buyer_terms_status);
  const stageReady = accepted
    ? ["terms_agreed", "booked"].includes(briefResult.data.status)
    : briefResult.data.status === "buyer_selected" && booking.status === "pending_security";
  const termsReady = deal.status === "locked"
    && chainSnapshotValid
    && commercialStateReady
    && stageReady
    && milestones.length > 0
    && Boolean(deal.cancellation_terms?.trim())
    && offerCurrent;

  return {
    booking,
    deal,
    brief: briefResult.data,
    talent: talentResult.data,
    proposalItem: itemResult.data,
    offer: offerResult.data,
    milestones,
    offerCurrent,
    accepted,
    termsReady,
  };
}
