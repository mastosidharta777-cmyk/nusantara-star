import { createClient } from "@supabase/supabase-js";

export type TalentPaymentPolicyTemplate = {
  id: string;
  talent_id: string;
  milestone_type: string;
  sequence_no: number;
  calculation_type: string;
  percentage: number | null;
  amount: number | null;
  due_basis: string;
  due_offset_days: number;
  refundable: boolean | null;
  cancellation_note: string | null;
  negotiable: boolean;
  is_active: boolean;
  notes: string | null;
};

export type TalentMedia = {
  id: string;
  talent_id: string;
  media_type: string;
  provider: string;
  media_url: string;
  title: string | null;
  description: string | null;
  buyer_visible: boolean;
  is_active: boolean;
  sort_order: number;
};

type TalentRow = {
  id: string;
  name: string;
  category: string;
  base_city: string | null;
  budget_min: number | null;
  budget_max: number | null;
  last_calendar_updated_at: string | null;
  status: string;
};

function getServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) return null;
  return createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function loadAdminTalentDetail(talentId: string) {
  const supabase = getServerClient();
  if (!supabase) throw new Error("Supabase server environment is not configured");

  const [{ data: talent, error: talentError }, { data: policies, error: policyError }, { data: media, error: mediaError }] = await Promise.all([
    supabase.from("talents").select("id,name,category,base_city,budget_min,budget_max,last_calendar_updated_at,status").eq("id", talentId).maybeSingle(),
    supabase.from("talent_payment_policy_templates").select("*").eq("talent_id", talentId).eq("is_active", true).order("sequence_no", { ascending: true }),
    supabase.from("talent_media").select("*").eq("talent_id", talentId).eq("is_active", true).order("sort_order", { ascending: true }),
  ]);

  if (talentError) throw new Error(`Talent load failed: ${talentError.message}`);
  if (!talent) return null;
  if (policyError) throw new Error(`Talent payment policy load failed: ${policyError.message}`);
  if (mediaError) throw new Error(`Talent media load failed: ${mediaError.message}`);

  return {
    talent: talent as TalentRow,
    paymentPolicies: (policies ?? []) as TalentPaymentPolicyTemplate[],
    media: (media ?? []) as TalentMedia[],
  };
}
