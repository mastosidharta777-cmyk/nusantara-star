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
  delivery_due_at: string | null;
  supplier_delivery_url: string | null;
  supplier_delivery_note: string | null;
  supplier_delivery_submitted_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  delivery_actions: SupplyEngagementDeliveryAction[];
};

export type SupplyEngagementDeliveryAction = {
  id: string;
  actor: "supplier" | "admin";
  action: "work_started" | "delivery_submitted" | "revision_requested" | "delivery_accepted";
  note: string | null;
  delivery_url: string | null;
  created_at: string;
};

export async function loadSupplyEngagementDetail(id: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase server environment is not configured");
  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await supabase
    .from("supply_engagements")
    .select("id,work_order_reference,supply_type,supply_name_snapshot,service_label_snapshot,project_name,event_date,city,scope_of_work,deliverables,agreed_fee,currency,payment_terms,status,supplier_response_note,delivery_due_at,supplier_delivery_url,supplier_delivery_note,supplier_delivery_submitted_at,started_at,completed_at")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const { data: actions, error: actionsError } = await supabase
    .from("supply_engagement_delivery_actions")
    .select("id,actor,action,note,delivery_url,created_at")
    .eq("engagement_id", id)
    .order("created_at", { ascending: true });
  if (actionsError) throw new Error(actionsError.message);
  return { ...data, delivery_actions: actions ?? [] } as SupplyEngagementDetail;
}
