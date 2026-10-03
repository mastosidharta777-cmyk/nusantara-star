export const INDONESIAN_EVENT_TIMEZONES = {
  "Asia/Jakarta": 7,
  "Asia/Makassar": 8,
  "Asia/Jayapura": 9,
} as const;

export type IndonesianEventTimeZone = keyof typeof INDONESIAN_EVENT_TIMEZONES;

function parseDateOnly(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new Error("Payment due date must use YYYY-MM-DD");
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const check = new Date(Date.UTC(year, month - 1, day));
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) {
    throw new Error("Payment due date must be a real calendar date");
  }
  return { year, month, day };
}

/** Mirrors PostgreSQL `(due_date + time '23:59:59') at time zone event_timezone`. */
export function paymentRequestCutoffUtc(dueDate: string, eventTimeZone: IndonesianEventTimeZone) {
  const { year, month, day } = parseDateOnly(dueDate);
  const offsetHours = INDONESIAN_EVENT_TIMEZONES[eventTimeZone];
  if (offsetHours === undefined) throw new Error("Unsupported Indonesian event time zone");
  return new Date(Date.UTC(year, month - 1, day, 23 - offsetHours, 59, 59)).toISOString();
}

export function classifyBuyerTransfer(input: { paidAt: string; requestExpiresAt: string }) {
  const paidAt = Date.parse(input.paidAt);
  const expiresAt = Date.parse(input.requestExpiresAt);
  if (!Number.isFinite(paidAt) || !Number.isFinite(expiresAt)) throw new Error("Transfer timing requires valid instants");
  return paidAt <= expiresAt ? "on_time" : "late";
}

export function paymentRequestCanBeIssued(input: {
  now: string;
  requestExpiresAt: string;
  holdExpiresAt: string;
  offerValidUntil: string;
}) {
  const now = Date.parse(input.now);
  const cutoff = Date.parse(input.requestExpiresAt);
  const hold = Date.parse(input.holdExpiresAt);
  const offer = Date.parse(input.offerValidUntil);
  if (![now, cutoff, hold, offer].every(Number.isFinite)) throw new Error("Payment request bounds require valid instants");
  return cutoff > now && cutoff <= hold && cutoff <= offer;
}
