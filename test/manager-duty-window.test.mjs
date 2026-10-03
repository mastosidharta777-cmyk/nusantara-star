import test from "node:test";
import assert from "node:assert/strict";
import { formatDutyLocal, parseManagerDutyWindow } from "../lib/manager-duty-window.ts";

test("cross-midnight performance must fit inside the manager duty block", () => {
  const base = { eventDate: "2026-10-10", showStartLocal: "23:30", showEndLocal: "00:30", location: "Jakarta Convention Center" };
  assert.deepEqual(parseManagerDutyWindow({ ...base, startLocal: "2026-10-10T21:00", endLocal: "2026-10-11T02:00" }), {
    startLocal: "2026-10-10T21:00", endLocal: "2026-10-11T02:00", location: base.location,
  });
  assert.throws(() => parseManagerDutyWindow({ ...base, startLocal: "2026-10-10T21:00", endLocal: "2026-10-10T23:59" }));
});

test("invalid calendar day and an uncovered start are rejected", () => {
  const base = { eventDate: "2026-10-10", showStartLocal: "19:00", showEndLocal: "20:00", location: "Jakarta venue" };
  assert.throws(() => parseManagerDutyWindow({ ...base, startLocal: "2026-02-30T18:00", endLocal: "2026-10-10T22:00" }));
  assert.throws(() => parseManagerDutyWindow({ ...base, startLocal: "2026-10-10T19:30", endLocal: "2026-10-10T22:00" }));
});

test("stored instants render in the named Indonesian event zone", () => {
  assert.equal(formatDutyLocal("2026-10-10T10:00:00Z", "Asia/Jakarta"), "2026-10-10T17:00");
  assert.equal(formatDutyLocal("2026-10-10T10:00:00Z", "Asia/Makassar"), "2026-10-10T18:00");
  assert.equal(formatDutyLocal("2026-10-10T10:00:00Z", "Asia/Jayapura"), "2026-10-10T19:00");
});
