import { createClient } from "@supabase/supabase-js";

import { rankTalents } from "@/lib/talent-engine/matching";
import { loadEngineTalents } from "@/lib/talent-engine/supabase-talents";
import type {
  AvailabilityFreshness,
  AvailabilityStatus,
  MatchBreakdown,
  MatchTier,
  StructuredBrief,
} from "@/lib/talent-engine/types";

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
  source_text: string | null;
  field_evidence: Record<string, unknown> | null;
  status: string;
  created_at: string;
};

type PersistedMatch = {
  talent_id: string;
  score: number;
  tier: string;
  availability_status: string;
  availability_freshness: string;
  requires_live_confirmation: boolean;
  score_breakdown: MatchBreakdown | null;
  reasons: string[] | null;
  engine_version: string | null;
  generated_at: string | null;
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

export type DealMilestone = {
  milestone_type: string;
  sequence_no: number;
  calculation_type: "percentage" | "fixed_amount" | "remaining_balance";
  percentage: number | null;
  amount: number | null;
  due_basis: "booking_date" | "event_date" | "event_completion" | "invoice_date" | "custom_date";
  due_offset_days: number;
  custom_due_date?: string | null;
  refundable: boolean | null;
  cancellation_note: string | null;
  notes?: string | null;
};

type CommercialTerms = {
  buyer_price: number;
  talent_payable: number;
  direct_costs: number;
  taxes_and_payment_fees: number;
  payment_terms: string | null;
  buyer_payment_terms: string | null;
  talent_payment_terms: string | null;
  buyer_payment_schedule: DealMilestone[];
  talent_payment_schedule: DealMilestone[];
  cancellation_terms: string | null;
  rider_notes: string | null;
  special_conditions: string | null;
  notes: string | null;
  status: string;
};

type TalentPolicyTemplate = DealMilestone & {
  id: string;
  negotiable: boolean;
};

type BookingRecord = {
  id: string;
  status: string;
  event_date: string;
  venue: string | null;
  city: string | null;
  buyer_price: number | null;
  talent_payable: number | null;
  direct_cost: number | null;
  buyer_terms_accepted_at: string | null;
  financial_security_type: string | null;
  financial_security_status: string;
  financial_security_reference: string | null;
  secured_at: string | null;
};

type PaymentRecord = {
  id: string;
  payment_type: string | null;
  amount: number;
  provider: string | null;
  provider_reference: string | null;
  status: string;
  paid_at: string | null;
  created_at: string;
};

type PaymentMilestone = {
  id: string;
  party: "buyer" | "talent";
  milestone_type: string;
  sequence_no: number;
  calculation_type: string;
  percentage: number | null;
  amount: number | null;
  due_basis: string;
  due_offset_days: number;
  custom_due_date: string | null;
  refundable: boolean | null;
  cancellation_note: string | null;
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
  const [{ data, error }, persistedMatchesResult, availabilityRequestsResult, buyerSelectionResult, commercialTermsResult, bookingResult] = await Promise.all([
    supabase
      .from("briefs")
      .select("id,event_type,event_date,city,venue,audience_size,talent_category,genre_style,budget_min,budget_max,performance_duration_minutes,event_vibe,special_requirements,source_text,field_evidence,status,created_at")
      .eq("id", id)
      .single(),
    supabase
      .from("match_results")
      .select("talent_id,score,tier,availability_status,availability_freshness,requires_live_confirmation,score_breakdown,reasons,engine_version,generated_at,admin_approved,admin_rejected")
      .eq("brief_id", id),
    supabase.from("availability_requests").select("id,talent_id,status").eq("brief_id", id),
    supabase.from("buyer_selections").select("talent_id,status").eq("brief_id", id).eq("status", "selected").maybeSingle(),
    supabase
      .from("commercial_terms")
      .select("buyer_price,talent_payable,direct_costs,taxes_and_payment_fees,payment_terms,buyer_payment_terms,talent_payment_terms,buyer_payment_schedule,talent_payment_schedule,cancellation_terms,rider_notes,special_conditions,notes,status")
      .eq("brief_id", id)
      .maybeSingle(),
    supabase
      .from("bookings")
      .select("id,status,event_date,venue,city,buyer_price,talent_payable,direct_cost,buyer_terms_accepted_at,financial_security_type,financial_security_status,financial_security_reference,secured_at")
      .eq("brief_id", id)
      .maybeSingle(),
  ]);

  if (error || !data) return null;
  if (persistedMatchesResult.error) throw new Error(persistedMatchesResult.error.message);
  if (availabilityRequestsResult.error) throw new Error(availabilityRequestsResult.error.message);
  if (buyerSelectionResult.error) throw new Error(buyerSelectionResult.error.message);
  if (commercialTermsResult.error) throw new Error(commercialTermsResult.error.message);
  if (bookingResult.error) throw new Error(bookingResult.error.message);

  const booking = (bookingResult.data ?? null) as BookingRecord | null;
  let payments: PaymentRecord[] = [];
  let paymentMilestones: PaymentMilestone[] = [];
  if (booking) {
    const [paymentResult, milestoneResult] = await Promise.all([
      supabase
        .from("payments")
        .select("id,payment_type,amount,provider,provider_reference,status,paid_at,created_at")
        .eq("booking_id", booking.id)
        .order("created_at", { ascending: true }),
      supabase
        .from("payment_milestones")
        .select("id,party,milestone_type,sequence_no,calculation_type,percentage,amount,due_basis,due_offset_days,custom_due_date,refundable,cancellation_note,status")
        .eq("booking_id", booking.id)
        .order("party", { ascending: true })
        .order("sequence_no", { ascending: true }),
    ]);
    if (paymentResult.error) throw new Error(paymentResult.error.message);
    if (milestoneResult.error) throw new Error(milestoneResult.error.message);
    payments = (paymentResult.data ?? []) as PaymentRecord[];
    paymentMilestones = (milestoneResult.data ?? []) as PaymentMilestone[];
  }

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
    sourceText: row.source_text ?? undefined,
    fieldEvidence: (row.field_evidence ?? undefined) as StructuredBrief["fieldEvidence"],
  };

  const roster = await loadEngineTalents();
  const persistedRows = (persistedMatchesResult.data ?? []) as PersistedMatch[];
  const frozenRows = persistedRows.filter((item) => Boolean(item.engine_version && item.generated_at));
  const usesPersistedSnapshot = frozenRows.length > 0;

  const matches = usesPersistedSnapshot
    ? frozenRows.flatMap((item) => {
        const talent = roster.talents.find((candidate) => candidate.id === item.talent_id);
        if (!talent || !item.score_breakdown) return [];
        return [
          {
            talent,
            score: item.score,
            tier: item.tier as MatchTier,
            breakdown: item.score_breakdown,
            availabilityStatus: item.availability_status as AvailabilityStatus | "unknown",
            freshness: item.availability_freshness as AvailabilityFreshness,
            requiresLiveConfirmation: item.requires_live_confirmation,
            reasons: item.reasons ?? [],
            blockedReasons: [] as string[],
          },
        ];
      })
    : rankTalents(roster.talents, brief, 5);

  const persistedMap = new Map(persistedRows.map((item) => [item.talent_id, item]));
  const requestMap = new Map(
    ((availabilityRequestsResult.data ?? []) as AvailabilityRequest[]).map((item) => [item.talent_id, item]),
  );
  const buyerSelection = (buyerSelectionResult.data ?? null) as BuyerSelection | null;
  const selectedTalent = buyerSelection ? roster.talents.find((talent) => talent.id === buyerSelection.talent_id) ?? null : null;

  let talentPolicyTemplates: TalentPolicyTemplate[] = [];
  if (selectedTalent) {
    const { data: policyData, error: policyError } = await supabase
      .from("talent_payment_policy_templates")
      .select("id,milestone_type,sequence_no,calculation_type,percentage,amount,due_basis,due_offset_days,refundable,cancellation_note,negotiable,notes")
      .eq("talent_id", selectedTalent.id)
      .eq("is_active", true)
      .order("sequence_no", { ascending: true });
    if (policyError) throw new Error(policyError.message);
    talentPolicyTemplates = (policyData ?? []) as TalentPolicyTemplate[];
  }

  const generatedAt = usesPersistedSnapshot
    ? frozenRows.map((item) => item.generated_at).filter(Boolean).sort().at(-1) ?? null
    : null;
  const engineVersion = usesPersistedSnapshot ? frozenRows.find((item) => item.engine_version)?.engine_version ?? null : null;

  return {
    row,
    brief,
    selectedTalent,
    talentPolicyTemplates,
    commercialTerms: (commercialTermsResult.data ?? null) as CommercialTerms | null,
    booking,
    payments,
    paymentMilestones,
    matchSnapshot: {
      source: usesPersistedSnapshot ? ("persisted" as const) : ("legacy_live_fallback" as const),
      engineVersion,
      generatedAt,
    },
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
