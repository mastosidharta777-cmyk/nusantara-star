export type DutyWindow = {
  startAt: string;
  endAt: string;
};

function instant(value: string, label: string) {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error(`${label} must be a valid instant`);
  return parsed;
}

export function assertDutyWindow(window: DutyWindow) {
  const start = instant(window.startAt, "Duty start");
  const end = instant(window.endAt, "Duty end");
  if (start >= end) throw new Error("Duty start must be before duty end");
  return { start, end };
}

/** Mirrors PostgreSQL's [start,end) tstzrange overlap semantics. */
export function dutyWindowsOverlap(left: DutyWindow, right: DutyWindow) {
  const a = assertDutyWindow(left);
  const b = assertDutyWindow(right);
  return a.start < b.end && b.start < a.end;
}

export function holdExpiryWithinBounds(input: {
  now: string;
  expiresAt: string;
  offerValidUntil: string;
  dutyStartAt: string;
}) {
  const now = instant(input.now, "Current time");
  const expiry = instant(input.expiresAt, "Hold expiry");
  const offerExpiry = instant(input.offerValidUntil, "Offer expiry");
  const dutyStart = instant(input.dutyStartAt, "Duty start");
  return expiry > now && expiry <= offerExpiry && expiry <= dutyStart;
}
