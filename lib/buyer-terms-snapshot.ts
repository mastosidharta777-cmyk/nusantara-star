export type BuyerTermsDetailedBreakdown = {
  talent_fee: number;
  transport: number;
  accommodation: number;
  technical_rider: number;
  taxes_fees: number;
  other: number;
  other_label: string | null;
};

export type BuyerTermsAggregateBreakdown = {
  talent_fee: number;
  direct_costs: number;
  taxes_fees: number;
};

export type BuyerTermsSnapshot = {
  schema_version: 1;
  deal_id: string;
  brief_id: string;
  proposal_item_id: string;
  event: {
    talent_id: string;
    talent_name: string;
    event_type: string | null;
    event_date: string;
    city: string | null;
    venue: string | null;
  };
  pricing: {
    currency: string;
    buyer_price: number;
    direct_costs: number;
    taxes_and_payment_fees: number;
    breakdown_mode: "detailed" | "aggregate";
    breakdown: BuyerTermsDetailedBreakdown | BuyerTermsAggregateBreakdown;
  };
  payment_schedule: Array<Record<string, unknown>>;
  terms: {
    cancellation_terms: string;
    rider_notes: string | null;
    special_conditions: string | null;
    included_costs: string | null;
    excluded_costs: string | null;
  };
  offer_valid_until: string;
};

function amount(value: unknown) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
}

function normalizeDetailed(value: unknown): BuyerTermsDetailedBreakdown {
  const row = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  return {
    talent_fee: amount(row.talent_fee),
    transport: amount(row.transport),
    accommodation: amount(row.accommodation),
    technical_rider: amount(row.technical_rider),
    taxes_fees: amount(row.taxes_fees),
    other: amount(row.other),
    other_label: typeof row.other_label === "string" && row.other_label.trim() ? row.other_label.trim() : null,
  };
}

export function buildBuyerTermsSnapshot(input: {
  deal: {
    id: string;
    proposal_item_id: string;
    buyer_price: number;
    direct_costs: number | null;
    taxes_and_payment_fees: number | null;
    buyer_payment_schedule: unknown;
    cancellation_terms: string;
    rider_notes: string | null;
    special_conditions: string | null;
  };
  brief: {
    id: string;
    event_type: string | null;
    event_date: string;
    city: string | null;
    venue: string | null;
  };
  talent: { id: string; name: string };
  proposalItem: {
    id: string;
    buyer_price: number;
    currency: string | null;
    price_breakdown: unknown;
    included_costs: string | null;
    excluded_costs: string | null;
  };
  offerValidUntil: string;
}): BuyerTermsSnapshot {
  const buyerPrice = amount(input.deal.buyer_price);
  const directCosts = amount(input.deal.direct_costs);
  const taxesFees = amount(input.deal.taxes_and_payment_fees);
  const detailed = normalizeDetailed(input.proposalItem.price_breakdown);
  const detailedDirect = detailed.transport + detailed.accommodation + detailed.technical_rider + detailed.other;
  const detailedTotal = detailed.talent_fee + detailedDirect + detailed.taxes_fees;
  const detailedMatchesLockedDeal =
    amount(input.proposalItem.buyer_price) === buyerPrice
    && detailedTotal === buyerPrice
    && detailedDirect === directCosts
    && detailed.taxes_fees === taxesFees;

  const aggregate: BuyerTermsAggregateBreakdown = {
    talent_fee: Math.max(0, buyerPrice - directCosts - taxesFees),
    direct_costs: directCosts,
    taxes_fees: taxesFees,
  };

  const schedule = Array.isArray(input.deal.buyer_payment_schedule)
    ? input.deal.buyer_payment_schedule as Array<Record<string, unknown>>
    : [];

  return {
    schema_version: 1,
    deal_id: input.deal.id,
    brief_id: input.brief.id,
    proposal_item_id: input.proposalItem.id,
    event: {
      talent_id: input.talent.id,
      talent_name: input.talent.name,
      event_type: input.brief.event_type,
      event_date: input.brief.event_date,
      city: input.brief.city,
      venue: input.brief.venue,
    },
    pricing: {
      currency: input.proposalItem.currency ?? "IDR",
      buyer_price: buyerPrice,
      direct_costs: directCosts,
      taxes_and_payment_fees: taxesFees,
      breakdown_mode: detailedMatchesLockedDeal ? "detailed" : "aggregate",
      breakdown: detailedMatchesLockedDeal ? detailed : aggregate,
    },
    payment_schedule: schedule,
    terms: {
      cancellation_terms: input.deal.cancellation_terms,
      rider_notes: input.deal.rider_notes,
      special_conditions: input.deal.special_conditions,
      included_costs: input.proposalItem.included_costs,
      excluded_costs: input.proposalItem.excluded_costs,
    },
    offer_valid_until: input.offerValidUntil,
  };
}

export function isBuyerTermsSnapshot(value: unknown): value is BuyerTermsSnapshot {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  const event = row.event;
  const pricing = row.pricing;
  const terms = row.terms;
  return row.schema_version === 1
    && typeof row.deal_id === "string"
    && typeof row.brief_id === "string"
    && typeof row.proposal_item_id === "string"
    && Boolean(event && typeof event === "object" && !Array.isArray(event))
    && Boolean(pricing && typeof pricing === "object" && !Array.isArray(pricing))
    && Array.isArray(row.payment_schedule)
    && Boolean(terms && typeof terms === "object" && !Array.isArray(terms))
    && typeof row.offer_valid_until === "string";
}
