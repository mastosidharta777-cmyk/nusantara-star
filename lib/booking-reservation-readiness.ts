import type { SupabaseClient } from "@supabase/supabase-js";

export async function bookingReservationSecurityReady(supabase: SupabaseClient) {
  const { data, error } = await supabase.rpc("ns_booking_reservation_security_ready_v1");
  return !error && data === true;
}

export async function bookingCreationReady(supabase: SupabaseClient) {
  const { data, error } = await supabase.rpc("ns_booking_creation_ready_v1");
  return !error && data === true;
}

export async function lateTransferReconciliationReady(supabase: SupabaseClient) {
  const { data, error } = await supabase.rpc("ns_late_transfer_reconciliation_ready_v1");
  return !error && data === true;
}
