import { availabilityConfidence } from "./availability";
import type { EngineTalent, MatchBreakdown, StructuredBrief, TalentMatch } from "./types";

function normalize(value: string) {
  return value.trim().toLowerCase();
}

function canonicalCategory(value: string | null | undefined) {
  if (!value) return null;
  const v = normalize(value);
  if (/(singer|penyanyi|vocalist|vokalis)/.test(v)) return "singer";
  if (/(band|group)/.test(v)) return "band";
  if (/(mc|host|master of ceremony)/.test(v)) return "mc";
  if (/\bdj\b|disc jockey/.test(v)) return "dj";
  if (/(traditional|tradisional|cultural|budaya)/.test(v)) return "traditional";
  if (/(acoustic|duo|trio)/.test(v)) return "acoustic";
  if (/(speaker|pembicara)/.test(v)) return "speaker";
  if (/(special performer|specialty performer)/.test(v)) return "special performer";
  return v;
}

function requestedGender(brief: StructuredBrief): "female" | "male" | null {
  const text = normalize([brief.talentCategory ?? "", brief.sourceText ?? "", ...brief.specialRequirements].join(" "));
  if (/(female|woman|women|perempuan|wanita)/.test(text)) return "female";
  if (/(male|man|men|laki-laki|pria)/.test(text)) return "male";
  return null;
}

function intersects(a: string[], b: string[]) {
  const bSet = new Set(b.map(normalize));
  return a.some((item) => bSet.has(normalize(item)));
}

function budgetScore(talent: EngineTalent, brief: StructuredBrief) {
  if (brief.budgetMin == null && brief.budgetMax == null) return 70;
  const min = brief.budgetMin ?? brief.budgetMax ?? 0;
  const max = brief.budgetMax ?? brief.budgetMin ?? Number.MAX_SAFE_INTEGER;
  const overlap = Math.max(0, Math.min(talent.budgetMax, max) - Math.max(talent.budgetMin, min));
  if (overlap > 0) return 100;
  if (talent.budgetMin <= max * 1.1 && talent.budgetMax >= min * 0.9) return 65;
  return 20;
}

function categoryGenreScore(talent: EngineTalent, brief: StructuredBrief) {
  let score = 50;
  const requested = canonicalCategory(brief.talentCategory);
  const actual = canonicalCategory(talent.category);
  if (requested) score = requested === actual ? 100 : 0;
  if (brief.genreStyle.length > 0 && intersects(talent.genres, brief.genreStyle)) {
    score = Math.max(score, requested === actual ? 100 : 35);
  }
  return score;
}

function eventFitScore(talent: EngineTalent, brief: StructuredBrief) {
  if (!brief.eventType) return 70;
  const target = normalize(brief.eventType);
  return talent.eventTypes.some((type) => {
    const candidate = normalize(type);
    return candidate === target || target.includes(candidate) || candidate.includes(target);
  })
    ? 100
    : 55;
}

function locationScore(talent: EngineTalent, brief: StructuredBrief) {
  if (!brief.city) return 70;
  const target = normalize(brief.city);
  if (normalize(talent.baseCity) === target) return 100;
  if (talent.serviceCities.map(normalize).includes(target)) return 85;
  return 35;
}

function audienceVibeScore(talent: EngineTalent, brief: StructuredBrief) {
  const tags = [...brief.eventVibe, ...brief.genreStyle];
  if (tags.length === 0) return 70;
  return intersects(talent.audienceTags, tags) ? 100 : 60;
}

export function scoreTalent(talent: EngineTalent, brief: StructuredBrief, now = new Date()): TalentMatch {
  const availability = availabilityConfidence(talent, brief.eventDate, now);
  const blockedReasons: string[] = [];
  const reasons: string[] = [];

  if (availability.hardBlocked) {
    blockedReasons.push(`Tidak tersedia pada ${brief.eventDate ?? "tanggal acara"}`);
  }

  const requestedCategory = canonicalCategory(brief.talentCategory);
  const talentCategory = canonicalCategory(talent.category);
  if (requestedCategory && requestedCategory !== talentCategory) {
    blockedReasons.push(`Kategori tidak sesuai: meminta ${brief.talentCategory}`);
  }

  const gender = requestedGender(brief);
  if (gender && talent.gender && talent.gender !== "unknown" && talent.gender !== "mixed" && talent.gender !== gender) {
    blockedReasons.push(`Gender talent tidak sesuai: meminta ${gender}`);
  }

  const breakdown: MatchBreakdown = {
    availability: availability.score,
    budget: budgetScore(talent, brief),
    categoryGenre: categoryGenreScore(talent, brief),
    eventFit: eventFitScore(talent, brief),
    location: locationScore(talent, brief),
    reliability: talent.reliabilityScore,
    audienceVibe: audienceVibeScore(talent, brief),
  };

  const score = Math.round(
    breakdown.availability * 0.25 +
      breakdown.budget * 0.2 +
      breakdown.categoryGenre * 0.2 +
      breakdown.eventFit * 0.1 +
      breakdown.location * 0.1 +
      breakdown.reliability * 0.1 +
      breakdown.audienceVibe * 0.05,
  );

  if (breakdown.budget >= 90) reasons.push("budget sesuai");
  if (breakdown.categoryGenre >= 90) reasons.push("kategori/genre sesuai");
  if (breakdown.location >= 85) reasons.push("lokasi terjangkau");
  if (breakdown.eventFit >= 90) reasons.push("cocok untuk jenis acara");
  if (talent.reliabilityScore >= 85) reasons.push("reliability tinggi");
  if (availability.freshness !== "fresh") reasons.push("availability perlu dikonfirmasi ulang");

  return {
    talent,
    score: blockedReasons.length > 0 ? 0 : score,
    breakdown,
    availabilityStatus: availability.status,
    freshness: availability.freshness,
    requiresLiveConfirmation: availability.requiresLiveConfirmation,
    reasons,
    blockedReasons,
  };
}

export function rankTalents(talents: EngineTalent[], brief: StructuredBrief, limit = 5, now = new Date()) {
  return talents
    .map((talent) => scoreTalent(talent, brief, now))
    .filter((match) => match.blockedReasons.length === 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
