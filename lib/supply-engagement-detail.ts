import { createClient } from "@supabase/supabase-js";

export type SupplyEngagementDetail = {
  id: string;
  work_order_reference: string;
  supply_type: "professional" | "production_partner";
  supply_name_snapshot: string;
  service_label_snapshot: string;
  project_name: string;
  event_date: string | null;
  city: string | null;
  scope_of_work: string;
  deliverables: string[];
  agreed_fee: number;
  currency: string;
  payment_terms: string;
  status: string;
  supplier_response_note: string | null;
};

export async function loadSupplyEngagementDetail(id: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase server environment is not configured");
  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await supabase
    .from("supply_engagements")
    .select("id,work_order_reference,supply_type,supply_name_snapshot,service_label_snapshot,project_name,event_date,city,scope_of_work,deliverables,agreed_fee,currency,payment_terms,status,supplier_response_note")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as SupplyEngagementDetail | null;
}
