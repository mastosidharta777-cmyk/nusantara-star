import fs from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const form = fs.readFileSync("components/collaborative-show-advance-form.tsx", "utf8");
const advance = fs.readFileSync("supabase-show-advance-v1.sql", "utf8");
const collaborative = fs.readFileSync("supabase-show-advance-collaborative-v2.sql", "utf8");

test("final confirmation makes the selected rider explicit to both signed parties", () => {
  assert.match(form, /Rider pada revision ini:/);
  assert.match(form, /Konfirmasi revision \+ rider/);
  assert.match(form, /Final rider/);
  assert.match(form, /data\.approvedRiders\.find/);
});

test("rider remains bound to the Show Advance revision and approved talent rider", () => {
  assert.match(advance, /rider_version_id uuid null references public\.talent_rider_versions/);
  assert.match(advance, /status='admin_approved'/);
  assert.match(advance, /rider_final/);
});

test("collaborative Show Advance preserves revision invalidation and party audit trail", () => {
  assert.match(collaborative, /booking_advance_party_actions/);
  assert.match(collaborative, /submitted','reviewed','confirmed/);
  assert.match(collaborative, /every save increments revision and invalidates review\/confirmations/);
});
