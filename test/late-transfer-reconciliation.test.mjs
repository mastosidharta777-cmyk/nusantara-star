import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("late transfer reconciliation is explicit, auditable and never auto-secures booking", async () => {
  const sql = await readFile(new URL("../supabase-late-transfer-reconciliation-v1.sql", import.meta.url), "utf8");
  assert.match(sql, /buyer_payment_returns/i);
  assert.match(sql, /ns_accept_late_buyer_transfer_v1/i);
  assert.match(sql, /ns_reject_late_buyer_transfer_v1/i);
  assert.match(sql, /reject_late/i);
  assert.match(sql, /status='refunded',reconciliation_status='rejected'/i);
  assert.match(sql, /Late-transfer return evidence is immutable/i);
  assert.doesNotMatch(sql, /update public\.bookings\s+set\s+status\s*=\s*'secured'/i);
  assert.match(sql, /Post-security payment requires the secured reservation/i);
});

test("admin flow exposes accept and reject decisions with return evidence", async () => {
  const route = await readFile(new URL("../app/api/internal-demo/admin/payment/route.ts", import.meta.url), "utf8");
  const ui = await readFile(new URL("../components/admin-booking-actions.tsx", import.meta.url), "utf8");
  assert.match(route, /accept_late_transfer/);
  assert.match(route, /reject_late_transfer/);
  assert.match(route, /x-ns-admin-verified/);
  assert.match(route, /ns_reject_late_buyer_transfer_v1/);
  assert.match(ui, /Menunggu rekonsiliasi/);
  assert.match(ui, /Dana sudah dikembalikan · Tolak transfer/);
});
