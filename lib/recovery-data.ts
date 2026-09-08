import { createClient } from "@supabase/supabase-js";

export type RecoveryCase = {
  id: string;
  original_booking_id: string;
  incident_id: string;
  recovery_brief_id: string;
  original_talent_id: string;
  status: "matching" | "confirming" | "buyer_selection" | "replacement_selected" | "reconciling" | "replacement_secured" | "closed_no_replacement" | "void";
  trigger_reason: string;
  requirements_snapshot: Record<string, unknown>;
  original_booking_snapshot: Record<string, unknown>;
  match_engine_version: string | null;
  matching_generated_at: string | null;
  match_count: number | null;
  selected_replacement_talent_id: string | null;
  replacement_booking_id: string | null;
  financial_reconciliation_status: "pending" | "ready" | "completed" | "not_required";
  financial_reconciliation_notes: string | null;
  opened_at: string;
  replacement_secured_at: string | null;
  closed_at: string | null;
};

function getServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) throw new Error("Supabase server environment is not configured");
  return createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

const fields = "id,original_booking_id,incident_id,recovery_brief_id,original_talent_id,status,trigger_reason,requirements_snapshot,original_booking_snapshot,match_engine_version,matching_generated_at,match_count,selected_replacement_talent_id,replacement_booking_id,financial_reconciliation_status,financial_reconciliation_notes,opened_at,replacement_secured_at,closed_at";

export async function loadRecoveryCaseForBooking(bookingId: string | null): Promise<RecoveryCase | null> {
  if (!bookingId) return null;
  const supabase = getServerClient();
  const { data, error } = await supabase.from("recovery_cases").select(fields).eq("original_booking_id", bookingId).neq("status", "void").order("opened_at", { ascending: false }).limit(1).maybeSingle();
  if (error) throw new Error(`Recovery case load failed: ${error.message}`);
  return (data as RecoveryCase | null) ?? null;
}

export async function loadRecoveryCaseForBrief(briefId: string): Promise<RecoveryCase | null> {
  const supabase = getServerClient();
  const { data, error } = await supabase.from("recovery_cases").select(fields).eq("recovery_brief_id", briefId).maybeSingle();
  if (error) throw new Error(`Recovery brief link load failed: ${error.message}`);
  return (data as RecoveryCase | null) ?? null;
}
