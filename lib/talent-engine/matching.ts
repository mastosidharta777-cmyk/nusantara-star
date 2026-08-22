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

function tokenSet(values: string[]) {
  return new Set(
    values
      .flatMap((value) => normalize(value).split(/[^a-z0-9&]+/i))
      .map((value) => value.trim())
      .filter((value) => value.length > 1),
  );
}

function genreCoverage(talentGenres: string[], requestedGenres: string[]) {
  if (requestedGenres.length === 0) return null;
  const talentTokens = tokenSet(talentGenres);
  const requestedTokens = [...tokenSet(requestedGenres)];
  if (requestedTokens.length === 0) return null;
  const matched = requestedTokens.filter((token) => talentTokens.has(token)).length;
  return matched / requestedTokens.length;
}

function flexibleIntersects(a: string[], b: string[]) {
  const aTokens = tokenSet(a);
  const bTokens = tokenSet(b);
  return [...bTokens].some((token) => aTokens.has(token));
}

function budgetScore(talent: EngineTalent, brief: StructuredBrief) {
  if (brief.budgetMin == null && brief.budgetMax == null) return 70;

  if (brief.budgetMin == null && brief.budgetMax != null) {
    if (talent.budgetMin <= brief.budgetMax) return 100;
    if (talent.budgetMin <= brief.budgetMax * 1.1) return 65;
    return 20;
  }

  if (brief.budgetMax == null && brief.budgetMin != null) {
    if (talent.budgetMax >= brief.budgetMin) return 100;
    if (talent.budgetMax >= brief.budgetMin * 0.9) return 65;
    return 20;
  }

  const min = brief.budgetMin ?? 0;
  const max = brief.budgetMax ?? Number.MAX_SAFE_INTEGER;
  const overlap = Math.max(0, Math.min(talent.budgetMax, max) - Math.max(talent.budgetMin, min));
  if (overlap > 0) return 100;
  if (talent.budgetMin <= max * 1.1 && talent.budgetMax >= min * 0.9) return 65;
  return 20;
}

function categoryGenreScore(talent: EngineTalent, brief: StructuredBrief) {
  const requested = canonicalCategory(brief.talentCategory);
  const actual = canonicalCategory(talent.category);
  const categoryMatched = !requested || requested === actual;
  const coverage = genreCoverage(talent.genres, brief.genreStyle);

  if (!categoryMatched) return 0;
  if (!requested && coverage == null) return 70;
  if (coverage == null) return 90;
  if (coverage >= 0.75) return 100;
  if (coverage >= 0.4) return 80;
  return 60;
}

function eventFitScore(talent: EngineTalent, brief: StructuredBrief) {
  const context = normalize([brief.eventType ?? "", brief.venue ?? "", brief.sourceText ?? ""].join(" "));
  if (!context.trim()) return 70;

  return talent.eventTypes.some((type) => {
    const candidate = normalize(type);
    if (candidate === context || context.includes(candidate) || candidate.includes(context)) return true;
    if (candidate === "hotel" && /(hotel|lounge|resort)/.test(context)) return true;
    if (candidate === "corporate" && /(corporate|perusahaan|gala dinner)/.test(context)) return true;
    if (candidate === "private event" && /(private event|private party|acara privat)/.test(context)) return true;
    if (candidate === "cultural event" && /(cultural|culture|budaya|tradisional)/.test(context)) return true;
    if (candidate === "brand activation" && /(brand activation|activation|aktivasi)/.test(context)) return true;
    return false;
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
  return flexibleIntersects(talent.audienceTags, tags) ? 100 : 60;
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
  if (!availability.hardBlocked) reasons.push("live confirmation wajib sebelum shortlist final");

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
