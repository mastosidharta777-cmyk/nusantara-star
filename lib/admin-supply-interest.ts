import { createClient } from "@supabase/supabase-js";

import { isSupplyType, type SupplyType } from "@/lib/supply-onboarding";

export type SupplyInterestStatus = "new" | "invited" | "archived";

export type AdminSupplyInterest = {
  id: string;
  applicant_name: string | null;
  email: string;
  portfolio_url: string | null;
  supply_type: SupplyType;
  status: SupplyInterestStatus;
  created_at: string;
  onboarding_talent_id: string | null;
  invited_at: string | null;
};

function getServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) throw new Error("Supabase server environment is not configured");
  return createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

// The fallback keeps the admin dashboard usable in the short deploy-to-migration window.
export async function loadSupplyInterestInbox() {
  const { data, error } = await getServerClient()
    .from("supply_interest_submissions")
    .select("id,applicant_name,email,portfolio_url,supply_type,status,created_at,onboarding_talent_id,invited_at")
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    return { ready: false as const, items: [] as AdminSupplyInterest[] };
  }

  const items = (data ?? []).flatMap((row) => {
    if (!isSupplyType(row.supply_type) || !["new", "invited", "archived"].includes(row.status)) return [];
    return [{
      id: row.id,
      applicant_name: row.applicant_name,
      email: row.email,
      portfolio_url: row.portfolio_url,
      supply_type: row.supply_type,
      status: row.status as SupplyInterestStatus,
      created_at: row.created_at,
      onboarding_talent_id: row.onboarding_talent_id,
      invited_at: row.invited_at,
    }];
  });

  return { ready: true as const, items };
}
