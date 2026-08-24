import { createClient } from "@supabase/supabase-js";

export type DealReviewRow = {
  id: string;
  brief_id: string;
  status: "draft" | "review_required" | "approved" | "locked";
  buyer_price: number;
  talent_payable: number;
  direct_costs: number | null;
  taxes_and_payment_fees: number | null;
  contribution: number | null;
  booking_reference_date: string | null;
  invoice_reference_date: string | null;
  direct_cost_due_date: string | null;
  tax_fee_due_date: string | null;
  funding_gap_amount: number | null;
  funding_gap_status: "safe" | "gap" | "unknown";
  talent_terms_status: string;
  buyer_terms_status: string;
  unresolved_issues: string[];
  exception_status: "none" | "requested" | "approved" | "rejected";
  exception_reason: string | null;
};

function getServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) throw new Error("Supabase server environment is not configured");
  return createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function loadDealReviewData(briefId: string) {
  const supabase = getServerClient();
  const { data, error } = await supabase
    .from("deals")
    .select("id,brief_id,status,buyer_price,talent_payable,direct_costs,taxes_and_payment_fees,contribution,booking_reference_date,invoice_reference_date,direct_cost_due_date,tax_fee_due_date,funding_gap_amount,funding_gap_status,talent_terms_status,buyer_terms_status,unresolved_issues,exception_status,exception_reason")
    .eq("brief_id", briefId)
    .maybeSingle();
  if (error) {
    if (error.code === "42P01") return null;
    throw new Error(error.message);
  }
  if (!data) return null;
  return {
    ...(data as Omit<DealReviewRow, "buyer_price" | "talent_payable" | "direct_costs" | "taxes_and_payment_fees" | "contribution" | "funding_gap_amount">),
    buyer_price: Number(data.buyer_price),
    talent_payable: Number(data.talent_payable),
    direct_costs: data.direct_costs == null ? null : Number(data.direct_costs),
    taxes_and_payment_fees: data.taxes_and_payment_fees == null ? null : Number(data.taxes_and_payment_fees),
    contribution: data.contribution == null ? null : Number(data.contribution),
    funding_gap_amount: data.funding_gap_amount == null ? null : Number(data.funding_gap_amount),
  } as DealReviewRow;
}
