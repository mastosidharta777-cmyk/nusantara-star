import { getAvailabilityFreshness } from "./availability";
import type { EngineTalent } from "./types";

export type CalendarReminder = {
  talentId: string;
  talentName: string;
  freshness: "needs_confirmation" | "stale";
  priority: "normal" | "high";
  messageId: string;
  messageEn: string;
};

export function buildCalendarReminders(talents: EngineTalent[], now = new Date()): CalendarReminder[] {
  return talents.flatMap((talent) => {
    const freshness = getAvailabilityFreshness(talent.lastCalendarUpdatedAt, now);
    if (freshness === "fresh") return [];

    return [{
      talentId: talent.id,
      talentName: talent.name,
      freshness,
      priority: freshness === "stale" ? "high" : "normal",
      messageId: `Kalender availability ${talent.name} belum diperbarui. Mohon perbarui status tanggal yang available, tentative, booked, atau unavailable agar rekomendasi booking tetap akurat.`,
      messageEn: `${talent.name}'s availability calendar needs an update. Please refresh available, tentative, booked, or unavailable dates so booking recommendations stay accurate.`,
    }];
  });
}
