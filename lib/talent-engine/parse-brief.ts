import type { StructuredBrief } from "./types";

const cityCandidates = ["Jakarta", "Bandung", "Surabaya", "Bali", "Yogyakarta", "Bogor", "Tangerang", "Malang"];
const categoryCandidates = ["Penyanyi", "Band", "MC", "DJ", "Acoustic", "Traditional", "Special Performer"];
const genreCandidates = ["Pop", "Jazz", "Soul", "R&B", "Rock", "Dangdut", "Koplo", "House", "Dance", "Acoustic", "Traditional", "Ethnic Contemporary"];
const eventCandidates = ["Corporate", "Wedding", "Brand Activation", "Private Event", "Festival", "Hotel", "MICE", "Conference", "Gala Dinner", "Community", "Government", "Cultural Event"];
const vibeCandidates = ["Elegant", "Energetic", "Upbeat", "Sophisticated", "Intimate", "Premium", "Young", "Formal", "Festive", "Warm", "Modern"];

function firstMatch(text: string, candidates: string[]) {
  const lower = text.toLowerCase();
  return candidates.find((item) => lower.includes(item.toLowerCase())) ?? null;
}

function allMatches(text: string, candidates: string[]) {
  const lower = text.toLowerCase();
  return candidates.filter((item) => lower.includes(item.toLowerCase()));
}

function parseRupiahValue(raw: string) {
  const value = Number(raw.replace(/[^0-9.,]/g, "").replace(/\./g, "").replace(",", "."));
  if (!Number.isFinite(value)) return null;
  const lower = raw.toLowerCase();
  if (lower.includes("jt") || lower.includes("juta")) return Math.round(value * 1_000_000);
  if (lower.includes("m") || lower.includes("miliar")) return Math.round(value * 1_000_000_000);
  return Math.round(value);
}

function parseBudget(text: string) {
  const range = text.match(/(?:rp\s*)?(\d+(?:[.,]\d+)?)\s*(?:-|–|sampai|sd|s\/d)\s*(?:rp\s*)?(\d+(?:[.,]\d+)?)\s*(jt|juta|m|miliar)/i);
  if (range) {
    const unit = range[3];
    return {
      budgetMin: parseRupiahValue(`${range[1]} ${unit}`),
      budgetMax: parseRupiahValue(`${range[2]} ${unit}`),
    };
  }

  const single = text.match(/(?:budget|bujet|sekitar|max(?:imal)?|hingga)?\s*(?:rp\s*)?(\d+(?:[.,]\d+)?)\s*(jt|juta|m|miliar)/i);
  if (single) {
    const value = parseRupiahValue(`${single[1]} ${single[2]}`);
    return { budgetMin: null, budgetMax: value };
  }

  return { budgetMin: null, budgetMax: null };
}

function parseDate(text: string) {
  const iso = text.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
  if (iso) return iso[0];

  const months: Record<string, string> = {
    januari: "01", februari: "02", maret: "03", april: "04", mei: "05", juni: "06",
    juli: "07", agustus: "08", september: "09", oktober: "10", november: "11", desember: "12",
  };
  const natural = text.toLowerCase().match(/\b(\d{1,2})\s+(januari|februari|maret|april|mei|juni|juli|agustus|september|oktober|november|desember)(?:\s+(20\d{2}))?/);
  if (!natural || !natural[3]) return null;
  return `${natural[3]}-${months[natural[2]]}-${natural[1].padStart(2, "0")}`;
}

function parseAudience(text: string) {
  const match = text.match(/(\d{2,6})\s*(?:pax|orang|tamu|audience|peserta)/i);
  return match ? Number(match[1]) : null;
}

function parseDuration(text: string) {
  const match = text.match(/(\d{1,3})\s*(?:menit|min|minutes)/i);
  return match ? Number(match[1]) : null;
}

export function parseBriefText(text: string): StructuredBrief {
  const budget = parseBudget(text);
  return {
    eventType: firstMatch(text, eventCandidates),
    eventDate: parseDate(text),
    city: firstMatch(text, cityCandidates),
    venue: null,
    audienceSize: parseAudience(text),
    talentCategory: firstMatch(text, categoryCandidates),
    genreStyle: allMatches(text, genreCandidates),
    budgetMin: budget.budgetMin,
    budgetMax: budget.budgetMax,
    performanceDurationMinutes: parseDuration(text),
    eventVibe: allMatches(text, vibeCandidates),
    specialRequirements: [],
    sourceText: text,
  };
}
