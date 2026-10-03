import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  classifyBuyerTransfer,
  paymentRequestCanBeIssued,
  paymentRequestCutoffUtc,
} from "../lib/payment-request-cutoff.ts";

test("contractual due date ends at 23:59:59 in each supported event zone", () => {
  assert.equal(paymentRequestCutoffUtc("2026-10-10", "Asia/Jakarta"), "2026-10-10T16:59:59.000Z");
  assert.equal(paymentRequestCutoffUtc("2026-10-10", "Asia/Makassar"), "2026-10-10T15:59:59.000Z");
  assert.equal(paymentRequestCutoffUtc("2026-10-10", "Asia/Jayapura"), "2026-10-10T14:59:59.000Z");
  assert.throws(() => paymentRequestCutoffUtc("2026-02-30", "Asia/Jakarta"));
});

test("request cutoff must remain inside both the live hold and offer", () => {
  const base = {
    now: "2026-10-09T10:00:00Z",
    requestExpiresAt: "2026-10-10T16:59:59Z",
    holdExpiresAt: "2026-10-10T16:59:59Z",
    offerValidUntil: "2026-10-10T17:00:00Z",
  };
  assert.equal(paymentRequestCanBeIssued(base), true);
  assert.equal(paymentRequestCanBeIssued({ ...base, holdExpiresAt: "2026-10-10T16:59:58Z" }), false);
  assert.equal(paymentRequestCanBeIssued({ ...base, offerValidUntil: "2026-10-10T16:59:58Z" }), false);
});

test("the cutoff instant is inclusive and a later transfer requires reconciliation", () => {
  const requestExpiresAt = "2026-10-10T16:59:59Z";
  assert.equal(classifyBuyerTransfer({ paidAt: requestExpiresAt, requestExpiresAt }), "on_time");
  assert.equal(classifyBuyerTransfer({ paidAt: "2026-10-10T17:00:00Z", requestExpiresAt }), "late");
});

test("draft migration closes RPC and direct-SQL bypasses without auto-securing late money", async () => {
  const sql = await readFile(new URL("../supabase-payment-request-cutoff-v1.sql", import.meta.url), "utf8");
  assert.match(sql, /request_expires_at timestamptz/i);
  assert.match(sql, /request_expires_at > v_now[\s\S]*request_expires_at <= r\.hold_expires_at[\s\S]*request_expires_at <= r\.offer_valid_until/i);
  assert.match(sql, /v_paid_at <= p\.request_expires_at/i);
  assert.match(sql, /'pending_reconciliation'/i);
  assert.match(sql, /Late buyer transfer requires accepted reconciliation before paid status/i);
  assert.match(sql, /Buyer payment cannot become paid without an issued payment request/i);
  assert.match(sql, /status = 'pending',[\s\S]*receipt_timing = 'late',[\s\S]*reconciliation_status = 'pending'/i);
  assert.doesNotMatch(sql, /update public\.bookings\s+set status = 'secured'/i);
  assert.match(sql, /ns_payment_transition_authorizations/i);
  assert.match(sql, /revoke all on table public\.ns_payment_transition_authorizations[\s\S]*service_role/i);
  assert.match(sql, /revoke all on function public\.ns_accept_late_buyer_transfer_v1/i);

  const accessLink = await readFile(new URL("../app/api/internal-demo/admin/access-link/route.ts", import.meta.url), "utf8");
  assert.match(accessLink, /requestSnapshot\?\.expires_at/);
  assert.match(accessLink, /Payment request has expired/);

  const buyerPage = await readFile(new URL("../app\/\[locale\]\/payment\/\[id\]\/page.tsx", import.meta.url), "utf8");
  assert.match(buyerPage, /snapshot\.expires_at/);
  assert.match(buyerPage, /Instructions are disabled/);
});
