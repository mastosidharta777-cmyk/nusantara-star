import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("buyer payment completion is backend-derived and distinguishes cash from waived obligations", async () => {
  const sql = await readFile(new URL("../supabase-buyer-payment-completion-v1.sql", import.meta.url), "utf8");
  assert.match(sql, /ns_buyer_payment_completion_v1/);
  assert.match(sql, /obligationsSettled/);
  assert.match(sql, /fullyPaid/);
  assert.match(sql, /reconciliation_status='accepted'/);
  assert.match(sql, /status in \('waived','cancelled'\)/);
});

test("admin UI consumes authoritative completion instead of recomputing fully paid locally", async () => {
  const loader = await readFile(new URL("../lib/admin-brief-detail.ts", import.meta.url), "utf8");
  const ui = await readFile(new URL("../components/admin-booking-actions.tsx", import.meta.url), "utf8");
  assert.match(loader, /ns_buyer_payment_completion_v1/);
  assert.match(ui, /buyerPaymentCompletion\?\.fullyPaid === true/);
  assert.doesNotMatch(ui, /paidTotal >= Number\(booking\.buyer_price\)/);
});
