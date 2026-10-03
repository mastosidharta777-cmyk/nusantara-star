import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  dutyWindowsOverlap,
  holdExpiryWithinBounds,
} from "../lib/schedule-reservation.ts";

test("half-open duty windows reject overlap but allow adjacent bookings", () => {
  const first = { startAt: "2026-10-02T10:00:00Z", endAt: "2026-10-02T15:00:00Z" };
  assert.equal(dutyWindowsOverlap(first, {
    startAt: "2026-10-02T14:59:59Z",
    endAt: "2026-10-02T18:00:00Z",
  }), true);
  assert.equal(dutyWindowsOverlap(first, {
    startAt: "2026-10-02T15:00:00Z",
    endAt: "2026-10-02T18:00:00Z",
  }), false);
});

test("cross-midnight duty windows compare as absolute instants", () => {
  assert.equal(dutyWindowsOverlap(
    { startAt: "2026-10-02T15:00:00Z", endAt: "2026-10-02T20:00:00Z" },
    { startAt: "2026-10-02T19:00:00Z", endAt: "2026-10-02T23:00:00Z" },
  ), true);
});

test("hold expiry cannot outlive the offer or reach past duty start", () => {
  const base = {
    now: "2026-10-01T02:00:00Z",
    offerValidUntil: "2026-10-01T12:00:00Z",
    dutyStartAt: "2026-10-02T10:00:00Z",
  };
  assert.equal(holdExpiryWithinBounds({ ...base, expiresAt: "2026-10-01T11:59:59Z" }), true);
  assert.equal(holdExpiryWithinBounds({ ...base, expiresAt: "2026-10-01T12:00:01Z" }), false);
  assert.equal(holdExpiryWithinBounds({ ...base, expiresAt: "2026-10-01T01:59:59Z" }), false);
});

test("draft migration contains the database-level atomicity and SQL-bypass gates", async () => {
  const sql = await readFile(new URL("../supabase-booking-schedule-hold-foundation-v1.sql", import.meta.url), "utf8");
  assert.match(sql, /exclude using gist\s*\(\s*talent_id with =,\s*duty_window with &&/is);
  assert.match(sql, /where \(status in \('held','secured'\)\)/i);
  assert.match(sql, /pg_advisory_xact_lock/i);
  assert.match(sql, /enable row level security/i);
  assert.match(sql, /revoke all on table public\.booking_schedule_reservations from public, anon, authenticated/i);
  assert.match(sql, /revoke all on table public\.booking_schedule_reservations from public, anon, authenticated, service_role/i);
  assert.match(sql, /grant select on table public\.booking_schedule_reservations to service_role/i);
  assert.match(sql, /Schedule reservation transitions must use an authorized RPC/i);
  assert.match(sql, /perform public\.ns_expire_untouched_holds_v1\(d\.talent_id\)/i);
});
