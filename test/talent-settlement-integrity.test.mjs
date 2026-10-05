import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("talent settlement is bound to exact locked milestone and backend-derived amount", async () => {
  const sql = await readFile(new URL("../supabase-talent-settlement-integrity-v1.sql", import.meta.url), "utf8");
  assert.match(sql, /payment_milestone_id/);
  assert.match(sql, /party='talent'/);
  assert.match(sql, /ns_record_talent_milestone_settlement_v1/);
  assert.match(sql, /event_completion.*completed/s);
  assert.match(sql, /event_date\/custom_date define the contractual deadline/);
  assert.doesNotMatch(sql, /current_date < b\.event_date \+ m\.due_offset_days/);
  assert.match(sql, /uq_talent_settlement_paid_milestone/);
});

test("admin settlement route no longer accepts a browser-supplied payout amount", async () => {
  const route = await readFile(new URL("../app/api/internal-demo/admin/settlement/route.ts", import.meta.url), "utf8");
  const ui = await readFile(new URL("../components/admin-operations.tsx", import.meta.url), "utf8");
  assert.match(route, /paymentMilestoneId/);
  assert.match(route, /ns_record_talent_milestone_settlement_v1/);
  assert.doesNotMatch(route, /body\?\.amount/);
  assert.match(ui, /paymentMilestoneId: settlementMilestoneId/);
  assert.doesNotMatch(ui, /settlementAmount/);
});
