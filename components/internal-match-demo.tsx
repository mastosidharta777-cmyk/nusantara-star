"use client";

import { useState } from "react";

type MatchResult = {
  talent: {
    id: string;
    name: string;
    category: string;
    genres: string[];
    baseCity: string;
    budgetMin: number;
    budgetMax: number;
    reliabilityScore: number;
  };
  score: number;
  availabilityStatus: string;
  freshness: string;
  requiresLiveConfirmation: boolean;
  reasons: string[];
};

type Brief = {
  eventType?: string | null;
  eventDate?: string | null;
  city?: string | null;
  venue?: string | null;
  audienceSize?: number | null;
  talentCategory?: string | null;
  genreStyle?: string[];
  budgetMin?: number | null;
  budgetMax?: number | null;
  performanceDurationMinutes?: number | null;
  eventVibe?: string[];
  specialRequirements?: string[];
};

type ApiResult = { source: "ai" | "fallback"; brief: Brief; matches: MatchResult[] };

const examples = [
  { label: "Corporate dinner", text: "Corporate dinner 12 September 2026 di Jakarta, 500 orang, butuh band pop energetic, budget 20-30 juta." },
  { label: "Wedding", text: "Wedding 18 September 2026 di Bali, ingin penyanyi wanita pop jazz yang elegant, budget maksimal 35 juta." },
  { label: "Brand activation", text: "Brand activation 25 September 2026 di Bandung, audience muda, butuh MC energetic, budget 10-15 juta." },
  { label: "Hotel", text: "Hotel lounge event 18 September 2026 di Jakarta, butuh acoustic duo jazz pop yang hangat dan elegan, budget 8-15 juta." },
  { label: "Cultural event", text: "Acara budaya perusahaan 12 September 2026 di Jakarta, butuh pertunjukan tradisional kontemporer Indonesia, budget 20-40 juta." },
];

const rupiah = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 });
const show = (value: unknown) => value == null || value === "" ? "Belum disebut" : String(value);

export function InternalMatchDemo() {
  const [text, setText] = useState(examples[0].text);
  const [data, setData] = useState<ApiResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function run() {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/internal-demo/match", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error ?? "Match failed");
      setData(payload);
    } catch (e) { setError(e instanceof Error ? e.message : "Match failed"); }
    finally { setLoading(false); }
  }

  return <div className="mx-auto max-w-6xl px-5 py-12 md:px-10 md:py-16">
    <div className="mb-10">
      <p className="text-[10px] font-bold uppercase tracking-[.2em] text-black/45">Demo Internal · Data Simulasi</p>
      <h1 className="mt-3 font-display text-5xl md:text-7xl">AI Talent Matching</h1>
      <p className="mt-5 max-w-2xl leading-7 text-black/55">Tulis kebutuhan acara seperti biasa. AI membaca brief, lalu sistem memilih talent simulasi yang paling sesuai.</p>
    </div>

    <div className="grid gap-8 lg:grid-cols-[.85fr_1.15fr]">
      <section className="border border-black/15 bg-white p-6 md:p-8">
        <label className="text-[10px] font-bold uppercase tracking-[.17em] text-black/55">Kebutuhan acara</label>
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={8} className="mt-3 w-full border border-black/20 bg-transparent p-4 leading-7 outline-none focus:border-black" />
        <p className="mt-4 text-xs font-bold uppercase tracking-[.15em] text-black/40">Coba contoh</p>
        <div className="mt-3 flex flex-wrap gap-2">{examples.map((example) => <button key={example.label} onClick={() => { setText(example.text); setData(null); }} className="border border-black/15 px-3 py-2 text-xs hover:bg-black hover:text-white">{example.label}</button>)}</div>
        <button onClick={run} disabled={loading || !text.trim()} className="mt-6 h-13 w-full bg-black px-5 text-xs font-bold uppercase tracking-[.15em] text-white disabled:opacity-40">{loading ? "AI sedang membaca…" : "Cari Talent"}</button>
        {error && <p className="mt-4 text-sm text-red-700">{error}</p>}
      </section>

      <section className="space-y-5">
        {!data && <div className="border border-dashed border-black/20 p-10 text-sm text-black/45">Masukkan brief lalu klik <b>Cari Talent</b>.</div>}
        {data && <>
          <div className="border border-black/15 bg-white p-5">
            <div className="flex items-center justify-between gap-4"><h2 className="font-display text-2xl">Yang dipahami AI</h2><span className="text-[10px] font-bold uppercase tracking-[.14em] text-black/45">{data.source === "ai" ? "Groq AI aktif" : "Fallback"}</span></div>
            <div className="mt-5 grid gap-4 text-sm sm:grid-cols-2">
              <div><span className="block text-[10px] uppercase tracking-[.12em] text-black/40">Acara</span>{show(data.brief.eventType)}</div>
              <div><span className="block text-[10px] uppercase tracking-[.12em] text-black/40">Tanggal</span>{show(data.brief.eventDate)}</div>
              <div><span className="block text-[10px] uppercase tracking-[.12em] text-black/40">Kota</span>{show(data.brief.city)}</div>
              <div><span className="block text-[10px] uppercase tracking-[.12em] text-black/40">Talent</span>{show(data.brief.talentCategory)}</div>
              <div><span className="block text-[10px] uppercase tracking-[.12em] text-black/40">Genre / style</span>{data.brief.genreStyle?.join(", ") || "Belum disebut"}</div>
              <div><span className="block text-[10px] uppercase tracking-[.12em] text-black/40">Budget</span>{data.brief.budgetMin != null || data.brief.budgetMax != null ? `${data.brief.budgetMin != null ? rupiah.format(data.brief.budgetMin) : "—"} – ${data.brief.budgetMax != null ? rupiah.format(data.brief.budgetMax) : "—"}` : "Belum disebut"}</div>
            </div>
          </div>

          <div className="flex items-end justify-between"><h2 className="font-display text-3xl">Rekomendasi</h2><span className="text-xs text-black/45">{data.matches.length} talent ditemukan</span></div>
          {data.matches.length === 0 && <div className="border border-black/15 bg-white p-6 text-sm text-black/55">Belum ada talent simulasi yang memenuhi constraint utama. Ini lebih baik daripada sistem memaksakan rekomendasi yang salah.</div>}
          {data.matches.map((match, index) => <article key={match.talent.id} className="border border-black/15 bg-white p-5 md:p-6">
            <div className="flex items-start justify-between gap-6"><div><p className="text-[10px] font-bold uppercase tracking-[.17em] text-black/40">#{index + 1} · {match.talent.category}</p><h3 className="mt-2 font-display text-3xl">{match.talent.name}</h3><p className="mt-2 text-sm text-black/55">{match.talent.genres.join(" · ")} · {match.talent.baseCity}</p></div><div className="text-right"><div className="font-display text-4xl">{match.score}</div><div className="text-[10px] font-bold uppercase tracking-[.12em] text-black/40">Score</div></div></div>
            <div className="mt-5 grid gap-3 text-sm sm:grid-cols-3"><div><span className="block text-[10px] uppercase tracking-[.12em] text-black/40">Rate</span>{rupiah.format(match.talent.budgetMin)}–{rupiah.format(match.talent.budgetMax)}</div><div><span className="block text-[10px] uppercase tracking-[.12em] text-black/40">Availability</span>{match.availabilityStatus}</div><div><span className="block text-[10px] uppercase tracking-[.12em] text-black/40">Data kalender</span>{match.freshness}</div></div>
            <div className="mt-4 flex flex-wrap gap-2">{match.reasons.map((reason) => <span key={reason} className="border border-black/15 px-3 py-1 text-xs text-black/55">{reason}</span>)}{match.requiresLiveConfirmation && <span className="border border-amber-400 bg-amber-50 px-3 py-1 text-xs">Perlu konfirmasi manager</span>}</div>
          </article>)}
        </>}
      </section>
    </div>
  </div>;
}
