import { createClient } from "@supabase/supabase-js";

export type OperationsChecklistItem = {
  id: string;
  checkpoint_code: "H-14" | "H-7" | "H-3" | "H-1";
  item_key: string;
  label: string;
  due_date: string;
  status: "pending" | "done" | "not_applicable";
  notes: string | null;
  completed_at: string | null;
};

export type OperationsIncident = {
  id: string;
  incident_type: string;
  summary: string;
  details: string | null;
  status: "open" | "resolved";
  occurred_at: string;
  resolved_at: string | null;
  resolution_notes: string | null;
};

export type TalentSettlement = {
  id: string;
  amount: number;
  currency: string;
  provider: string | null;
  provider_reference: string;
  status: "paid" | "reversed";
  paid_at: string;
  notes: string | null;
};

function getServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) throw new Error("Supabase server environment is not configured");
  return createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function loadOperationsData(bookingId: string | null) {
  if (!bookingId) return { checklist: [] as OperationsChecklistItem[], incidents: [] as OperationsIncident[], settlements: [] as TalentSettlement[] };
  const supabase = getServerClient();
  const [checklistResult, incidentsResult, settlementsResult] = await Promise.all([
    supabase.from("pre_show_checklist_items").select("id,checkpoint_code,item_key,label,due_date,status,notes,completed_at").eq("booking_id", bookingId).order("due_date", { ascending: true }).order("item_key", { ascending: true }),
    supabase.from("incidents").select("id,incident_type,summary,details,status,occurred_at,resolved_at,resolution_notes").eq("booking_id", bookingId).order("occurred_at", { ascending: false }),
    supabase.from("talent_settlements").select("id,amount,currency,provider,provider_reference,status,paid_at,notes").eq("booking_id", bookingId).order("paid_at", { ascending: true }),
  ]);
  if (checklistResult.error) throw new Error(checklistResult.error.message);
  if (incidentsResult.error) throw new Error(incidentsResult.error.message);
  if (settlementsResult.error) throw new Error(settlementsResult.error.message);
  return {
    checklist: (checklistResult.data ?? []) as OperationsChecklistItem[],
    incidents: (incidentsResult.data ?? []) as OperationsIncident[],
    settlements: (settlementsResult.data ?? []) as TalentSettlement[],
  };
}
