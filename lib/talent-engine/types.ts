export type AvailabilityStatus = "available" | "tentative" | "booked" | "unavailable";
export type AvailabilityFreshness = "fresh" | "needs_confirmation" | "stale";
export type TalentGender = "female" | "male" | "mixed" | "unknown";

export type AvailabilityEntry = {
  date: string; // YYYY-MM-DD
  status: AvailabilityStatus;
};

export type EngineTalent = {
  id: string;
  name: string;
  category: string;
  gender?: TalentGender;
  genres: string[];
  baseCity: string;
  serviceCities: string[];
  performanceFormats: string[];
  eventTypes: string[];
  audienceTags: string[];
  budgetMin: number;
  budgetMax: number;
  reliabilityScore: number;
  lastCalendarUpdatedAt: string;
  availability: AvailabilityEntry[];
  isDemo: boolean;
};

export type StructuredBrief = {
  eventType: string | null;
  eventDate: string | null;
  city: string | null;
  venue: string | null;
  audienceSize: number | null;
  talentCategory: string | null;
  genreStyle: string[];
  budgetMin: number | null;
  budgetMax: number | null;
  performanceDurationMinutes: number | null;
  eventVibe: string[];
  specialRequirements: string[];
  sourceText?: string;
};

export type MatchBreakdown = {
  availability: number;
  budget: number;
  categoryGenre: number;
  eventFit: number;
  location: number;
  reliability: number;
  audienceVibe: number;
};

export type TalentMatch = {
  talent: EngineTalent;
  score: number;
  breakdown: MatchBreakdown;
  availabilityStatus: AvailabilityStatus | "unknown";
  freshness: AvailabilityFreshness;
  requiresLiveConfirmation: boolean;
  reasons: string[];
  blockedReasons: string[];
};
