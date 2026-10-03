import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL("../supabase-booking-reservation-security-v1.sql", import.meta.url);

test("manual PO and exception evidence require the exact live held reservation", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  assert.match(sql, /ns_record_manual_booking_security_v1/i);
  assert.match(sql, /booking_id = b\.id and status = 'held' for update/i);
  assert.match(sql, /r\.hold_expires_at <= v_now[\s\S]*r\.offer_valid_until <= v_now/i);
  assert.match(sql, /financial_security_recorded_by = v_recorded_by/i);
  assert.match(sql, /authorized_exception'[\s\S]*d\.exception_status <> 'approved'/i);
  assert.match(sql, /booking_manual_security_approvals/i);
  assert.match(sql, /Approved PO\/credit amount is below the initial booking security requirement/i);
  assert.match(sql, /Manual booking security approvals are immutable/i);
  assert.match(sql, /alter table public\.booking_manual_security_approvals enable row level security/i);
  assert.match(sql, /revoke all on table public\.booking_manual_security_approvals[\s\S]*service_role/i);
});

test("securing converts the same reservation and booking in one transaction", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  assert.match(sql, /begin;/i);
  assert.match(sql, /pg_advisory_xact_lock/i);
  assert.match(sql, /booking_schedule_reservation_id = r\.id/i);
  assert.match(sql, /receipt_timing = 'on_time'[\s\S]*receipt_timing = 'late' and reconciliation_status = 'accepted'/i);
  assert.match(sql, /update public\.booking_schedule_reservations set\s*status = 'secured'/i);
  assert.match(sql, /update public\.bookings set\s*status = 'secured'/i);
  assert.match(sql, /update public\.briefs set status = 'booked'/i);
  assert.match(sql, /commit;/i);
});

test("direct SQL cannot forge manual security or secured booking state", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  assert.match(sql, /ns_booking_transition_authorizations/i);
  assert.match(sql, /revoke all on table public\.ns_booking_transition_authorizations[\s\S]*service_role/i);
  assert.match(sql, /Booking financial security must use an authorized RPC/i);
  assert.match(sql, /Booking secured transition must use the atomic reservation RPC/i);
  assert.match(sql, /Secured booking lifecycle requires the exact secured duty reservation/i);
  assert.match(sql, /Brief booked transition must use the atomic secured-booking RPC/i);
  assert.match(sql, /Booked brief requires the exact secured duty reservation/i);
});

test("admin manual-security route delegates evidence to the database RPC", async () => {
  const route = await readFile(new URL("../app/api/internal-demo/admin/booking/route.ts", import.meta.url), "utf8");
  assert.match(route, /ns_record_manual_booking_security_v1/);
  assert.doesNotMatch(route, /\.update\(\{ financial_security_type: securityType/);
  assert.match(route, /x-ns-admin-verified/);
  assert.match(route, /x-ns-admin-user/);
  assert.match(route, /bookingReservationSecurityReady/);
  assert.match(route, /p_approved_amount: approvedAmount/);
  assert.match(route, /p_evidence_note: evidenceNote/);
});
