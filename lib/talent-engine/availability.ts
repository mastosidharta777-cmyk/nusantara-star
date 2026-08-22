import type { AvailabilityEntry, AvailabilityFreshness, AvailabilityStatus, EngineTalent } from "./types";

const DAY_MS = 24 * 60 * 60 * 1000;

export function getAvailabilityFreshness(lastUpdatedAt: string, now = new Date()): AvailabilityFreshness {
  const updated = new Date(lastUpdatedAt);
  if (Number.isNaN(updated.getTime())) return "stale";

  const ageDays = Math.floor((now.getTime() - updated.getTime()) / DAY_MS);
  if (ageDays <= 7) return "fresh";
  if (ageDays <= 14) return "needs_confirmation";
  return "stale";
}

export function getDateAvailability(entries: AvailabilityEntry[], eventDate: string | null): AvailabilityStatus | "unknown" {
  if (!eventDate) return "unknown";
  return entries.find((entry) => entry.date === eventDate)?.status ?? "unknown";
}

export function availabilityConfidence(talent: EngineTalent, eventDate: string | null, now = new Date()) {
  const freshness = getAvailabilityFreshness(talent.lastCalendarUpdatedAt, now);
  const status = getDateAvailability(talent.availability, eventDate);

  if (status === "booked" || status === "unavailable") {
    return { score: 0, freshness, status, requiresLiveConfirmation: false, hardBlocked: true };
  }

  let score = 0;
  if (status === "available") score = 100;
  else if (status === "tentative") score = 55;
  else score = 35;

  if (freshness === "needs_confirmation") score = Math.min(score, 60);
  if (freshness === "stale") score = Math.min(score, 30);

  return {
    score,
    freshness,
    status,
    // Calendar availability is only a pre-filter. Every candidate must be
    // reconfirmed live with the talent/manager before a buyer-facing shortlist is final.
    requiresLiveConfirmation: true,
    hardBlocked: false,
  };
}
