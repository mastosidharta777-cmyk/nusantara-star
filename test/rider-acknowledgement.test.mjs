import fs from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const form = fs.readFileSync("components/collaborative-show-advance-form.tsx", "utf8");
const loader = fs.readFileSync("lib/collaborative-show-advance.ts", "utf8");
const route = fs.readFileSync("app/api/show-advance/party/route.ts", "utf8");
const advance = fs.readFileSync("supabase-show-advance-v1.sql", "utf8");

test("final confirmation makes the selected rider explicit to both signed parties", () => {
  assert.match(form, /Rider pada revision ini:/);
  assert.match(form, /Konfirmasi revision \+ rider/);
  assert.match(form, /Final rider/);
  assert.match(form, /data\.approvedRiders\.find/);
});

test("only an approved rider for the booked talent is exposed in the collaborative flow", () => {
  assert.match(loader, /from\("talent_rider_versions"\)/);
  assert.match(loader, /\.eq\("talent_id", booking\.talent_id\)/);
  assert.match(loader, /\.eq\("status", "admin_approved"\)/);
  assert.match(loader, /rider_version_id/);
});

test("party confirmation stays signed-link scoped and revision based", () => {
  assert.match(route, /verifyAccessToken\(token, scope, bookingId\)/);
  assert.match(route, /ns_confirm_booking_advance_party_v2/);
  assert.match(loader, /confirmed_revision_no === advance\.revision_no/);
  assert.match(loader, /advance\.buyer_confirmed_at/);
  assert.match(loader, /advance\.talent_confirmed_at/);
});

test("pre-show still carries the H-7 final rider checkpoint", () => {
  assert.match(advance, /'H-7','rider_final','Final rider \/ technical requirements reconfirmed'/);
});
