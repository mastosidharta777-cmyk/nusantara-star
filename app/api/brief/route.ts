import { NextResponse } from "next/server";
import { persistBrief } from "@/lib/brief-persistence";
import { persistMatchSnapshot } from "@/lib/match-persistence";
import { parseBriefWithAI } from "@/lib/talent-engine/ai-brief";
import { rankTalents } from "@/lib/talent-engine/matching";
import { loadEngineTalents } from "@/lib/talent-engine/supabase-talents";
import type { StructuredBrief } from "@/lib/talent-engine/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function textValue(value: unknown, max = 500) { return typeof value === "string" ? value.trim().slice(0, max) : ""; }
function validEmail(value: string) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value); }
function validWhatsapp(value: string) { return value.replace(/\D/g, "").length >= 8; }

function normalizedBudgetLabel(value: string) {
  return value.replace(/\s+/g, " ").replace(/[–—]/g, "-").trim();
}

function parseBudgetBand(value: string): { min: number | null; max: number | null } | null {
  switch (normalizedBudgetLabel(value)) {
    case "< Rp10 jt": return { min: null, max: 10_000_000 };
    case "Rp10-25 jt": return { min: 10_000_000, max: 25_000_000 };
    case "Rp25-50 jt": return { min: 25_000_000, max: 50_000_000 };
    case "Rp50-100 jt": return { min: 50_000_000, max: 100_000_000 };
    case "Rp100 jt+": return { min: 100_000_000, max: null };
    default: return null;
  }
}

function parseAudience(value: string) {
  if (!value) return null;
  const n = Number(value);
  return Number.isSafeInteger(n) && n >= 0 && n <= 10_000_000 ? n : null;
}

function parseDurationBand(value: string) {
  if (!value) return null;
  const normalized = value.replace(/[–—]/g, "-");
  if (/^15-30\s*minutes?$/i.test(normalized)) return 30;
  if (/^30-60\s*minutes?$/i.test(normalized)) return 60;
  if (/^60-90\s*minutes?$/i.test(normalized)) return 90;
  if (/^90\+\s*minutes?$/i.test(normalized)) return 90;
  return null;
}

function mergeExplicitStyles(aiStyles: string[], genre: string) {
  const explicit = genre.split(/[;,]+/).map((item) => item.trim()).filter(Boolean);
  return [...new Set([...explicit, ...aiStyles].map((item) => item.trim()).filter(Boolean))];
}

function applyStructuredFormTruth(
  parsed: StructuredBrief,
  input: {
    eventType: string;
    date: string;
    city: string;
    venue: string;
    audience: string;
    category: string;
    genre: string;
    budget: string;
    duration: string;
    sourceText: string;
  },
  budgetBand: { min: number | null; max: number | null },
): StructuredBrief {
  const evidence = { ...(parsed.fieldEvidence ?? {}) } as NonNullable<StructuredBrief["fieldEvidence"]>;
  const audienceSize = parseAudience(input.audience);
  const durationMinutes = parseDurationBand(input.duration);

  evidence.eventType = { status: "explicit", sourceExcerpt: input.eventType };
  evidence.eventDate = { status: "normalized", sourceExcerpt: input.date };
  evidence.city = { status: "explicit", sourceExcerpt: input.city };
  evidence.venue = input.venue ? { status: "explicit", sourceExcerpt: input.venue } : { status: "missing", sourceExcerpt: null };
  evidence.audienceSize = audienceSize != null ? { status: "normalized", sourceExcerpt: input.audience } : { status: "missing", sourceExcerpt: null };
  evidence.talentCategory = { status: "explicit", sourceExcerpt: input.category };
  evidence.genreStyle = input.genre ? { status: "explicit", sourceExcerpt: input.genre } : (evidence.genreStyle ?? { status: "missing", sourceExcerpt: null });
  evidence.budgetMin = budgetBand.min != null ? { status: "normalized", sourceExcerpt: input.budget } : { status: "missing", sourceExcerpt: null };
  evidence.budgetMax = budgetBand.max != null ? { status: "normalized", sourceExcerpt: input.budget } : { status: "missing", sourceExcerpt: null };
  evidence.performanceDurationMinutes = durationMinutes != null ? { status: "normalized", sourceExcerpt: input.duration } : { status: "missing", sourceExcerpt: null };

  return {
    ...parsed,
    eventType: input.eventType,
    eventDate: input.date,
    city: input.city,
    venue: input.venue || null,
    audienceSize,
    talentCategory: input.category,
    genreStyle: mergeExplicitStyles(parsed.genreStyle ?? [], input.genre),
    budgetMin: budgetBand.min,
    budgetMax: budgetBand.max,
    performanceDurationMinutes: durationMinutes,
    sourceText: input.sourceText,
    fieldEvidence: evidence,
  };
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") return NextResponse.json({ error: "Data brief tidak valid" }, { status: 400 });
    if (textValue((body as Record<string, unknown>).website, 200)) return NextResponse.json({ ok: true, received: true }, { status: 202 });

    const input = body as Record<string, unknown>;
    const name = textValue(input.name, 120), company = textValue(input.company, 160), whatsapp = textValue(input.whatsapp, 50), email = textValue(input.email, 180).toLowerCase();
    const eventType = textValue(input.eventType, 120), date = textValue(input.date, 20), city = textValue(input.city, 120), venue = textValue(input.venue, 180), audience = textValue(input.audience, 30);
    const category = textValue(input.category, 120), genre = textValue(input.genre, 180), budget = textValue(input.budget, 80), duration = textValue(input.duration, 80), notes = textValue(input.notes, 1500);
    const requestedTalentId = textValue(input.requestedTalentId, 100);

    if (!name || !whatsapp || !email || !eventType || !date || !city || !category || !budget) return NextResponse.json({ error: "Mohon lengkapi semua kolom wajib" }, { status: 400 });
    if (!validEmail(email)) return NextResponse.json({ error: "Format email tidak valid" }, { status: 400 });
    if (!validWhatsapp(whatsapp)) return NextResponse.json({ error: "Nomor WhatsApp tidak valid" }, { status: 400 });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({ error: "Tanggal acara tidak valid" }, { status: 400 });
    const budgetBand = parseBudgetBand(budget);
    if (!budgetBand) return NextResponse.json({ error: "Pilihan budget tidak valid" }, { status: 400 });
    if (audience && parseAudience(audience) == null) return NextResponse.json({ error: "Jumlah audiens tidak valid" }, { status: 400 });
    if (duration && parseDurationBand(duration) == null) return NextResponse.json({ error: "Pilihan durasi tampil tidak valid" }, { status: 400 });

    const roster = await loadEngineTalents();
    const requestedTalent = requestedTalentId ? roster.talents.find(t => t.id === requestedTalentId) ?? null : null;
    if (requestedTalentId && !requestedTalent) {
      return NextResponse.json({ error: "Talent yang dipilih tidak valid atau tidak lagi tersedia untuk inquiry" }, { status: 400 });
    }
    const requestMode = requestedTalent ? "direct_talent" as const : "discovery" as const;

    const sourceText = [
      `${eventType} pada ${date} di ${city}${venue ? `, venue ${venue}` : ""}.`,
      audience ? `Jumlah audiens ${audience} orang.` : "",
      `Butuh ${category}${genre ? `, genre/style ${genre}` : ""}.`,
      `Budget ${budget}.`,
      duration ? `Durasi tampil ${duration}.` : "",
      requestedTalent ? `Buyer secara eksplisit memilih talent ${requestedTalent.name} dari profil Nusantara Star.` : "",
      notes ? `Catatan: ${notes}.` : "",
    ].filter(Boolean).join(" ");

    const { brief: aiBrief } = await parseBriefWithAI(sourceText);
    const brief = applyStructuredFormTruth(aiBrief, { eventType, date, city, venue, audience, category, genre, budget, duration, sourceText }, budgetBand);
    const matches = requestedTalent ? [] : rankTalents(roster.talents, brief, 5);
    const persisted = await persistBrief(
      brief,
      { name, company: company || null, whatsapp, email },
      { requestMode, requestedTalentId: requestedTalent?.id ?? null },
    );
    if (!requestedTalent) await persistMatchSnapshot(persisted.id, matches);

    const recommendations = matches.map(match => {
      const reasons: string[] = [];
      if (match.breakdown.categoryGenre >= 80) reasons.push("Kategori/genre sesuai");
      if (brief.city && match.talent.baseCity.trim().toLowerCase() === brief.city.trim().toLowerCase()) reasons.push("Berbasis di kota acara");
      if (match.breakdown.eventFit >= 90) reasons.push("Cocok untuk jenis acara");
      if ((match.breakdown.taxonomyFit ?? 0) >= 85) reasons.push("Format/style sesuai brief");
      return {
        id: match.talent.id,
        name: match.talent.name,
        category: match.talent.category,
        genres: match.talent.genres,
        baseCity: match.talent.baseCity,
        tier: match.tier,
        reasons: reasons.slice(0, 3),
        availability: match.requiresLiveConfirmation ? "needs_confirmation" : "check_required",
      };
    });

    return NextResponse.json({
      ok: true,
      received: true,
      briefId: persisted.id,
      requestMode,
      requestedTalent: requestedTalent ? { id: requestedTalent.id, name: requestedTalent.name } : null,
      recommendations,
    }, { status: 201 });
  } catch (error) {
    console.error("Public brief submission failed", error instanceof Error ? error.message : String(error));
    return NextResponse.json({ error: "Brief belum dapat dikirim. Silakan coba lagi." }, { status: 500 });
  }
}
