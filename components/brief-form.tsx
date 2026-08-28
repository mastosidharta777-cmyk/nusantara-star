"use client";

import { useState } from "react";
import { CheckCircle2, Send } from "lucide-react";
import type { Locale } from "@/lib/i18n";

type C = { eyebrow: string; title: string; body: string; contact: string; event: string; talent: string; submit: string; note: string; success: string };
type MatchResult = {
  talent: { id: string; name: string; category: string; genres: string[]; baseCity: string; budgetMin: number; budgetMax: number; reliabilityScore: number };
  score: number;
  availabilityStatus: string;
  freshness: string;
  requiresLiveConfirmation: boolean;
  reasons: string[];
};
type MatchResponse = { source: "ai" | "fallback"; matches: MatchResult[] };

const Field = ({ label, name, type="text", required=false, options, area=false }: { label: string; name: string; type?: string; required?: boolean; options?: string[]; area?: boolean }) => <label className={area ? "md:col-span-2" : ""}><span className="mb-2 block text-[10px] font-bold uppercase tracking-[.17em] text-black/55">{label}{required && " *"}</span>{area ? <textarea name={name} rows={5} className="w-full border border-black/25 bg-transparent p-4 outline-none focus:border-ember"/> : options ? <select required={required} name={name} defaultValue="" className="h-13 w-full border border-black/25 bg-paper px-4 py-3 outline-none focus:border-ember"><option value="" disabled>—</option>{options.map(x => <option key={x}>{x}</option>)}</select> : <input required={required} type={type} name={name} className="h-13 w-full border border-black/25 bg-transparent px-4 py-3 outline-none focus:border-ember"/>}</label>;

const rupiah = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 });

export function BriefForm({ locale, copy: t }: { locale: Locale; copy: C }) {
  const id = locale === "id";
  const [result, setResult] = useState<MatchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submitBrief(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const fd = new FormData(e.currentTarget);
    const value = (name: string) => String(fd.get(name) ?? "").trim();
    const text = [
      `${value("eventType")} pada ${value("date")} di ${value("city")}${value("venue") ? `, venue ${value("venue")}` : ""}.`,
      value("audience") ? `Jumlah audiens ${value("audience")} orang.` : "",
      `Butuh ${value("category")}${value("genre") ? `, genre/style ${value("genre")}` : ""}.`,
      `Budget ${value("budget")}.`,
      value("duration") ? `Durasi tampil ${value("duration")}.` : "",
      value("notes") ? `Catatan: ${value("notes")}.` : "",
    ].filter(Boolean).join(" ");

    try {
      const response = await fetch("/api/internal-demo/match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error ?? "Matching failed");
      setResult(payload);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Matching failed");
    } finally {
      setLoading(false);
    }
  }

  return <section className="px-5 py-16 md:px-10 md:py-24"><div className="mx-auto grid max-w-[1200px] gap-14 lg:grid-cols-[.75fr_1.25fr]"><div className="lg:sticky lg:top-32 lg:self-start"><p className="eyebrow">{t.eyebrow}</p><h1 className="mt-5 font-display text-5xl leading-none md:text-7xl">{t.title}</h1><p className="mt-7 max-w-md leading-7 text-black/55">{t.body}</p><div className="mt-10 border-l-2 border-ember pl-5 text-sm leading-6 text-black/55">{t.note}</div></div>{result ? <div className="space-y-5"><div className="border border-black/15 bg-white p-7"><CheckCircle2 size={36} className="text-ember"/><h2 className="mt-5 font-display text-4xl">{id ? "Rekomendasi awal untuk brief Anda" : "Initial recommendations for your brief"}</h2><p className="mt-3 text-sm leading-6 text-black/55">{id ? "Ini shortlist awal berdasarkan brief, budget, kategori, lokasi, dan data availability. Tim Nusantara Star tetap melakukan konfirmasi final sebelum booking." : "This initial shortlist is based on your brief, budget, category, location and availability data. Nusantara Star will still confirm final availability before booking."}</p><p className="mt-3 text-[10px] font-bold uppercase tracking-[.14em] text-black/40">AI parser: {result.source}</p></div>{result.matches.length === 0 ? <div className="border border-black/15 bg-white p-7 text-sm text-black/55">{id ? "Belum ada talent demo yang memenuhi brief ini. Tim kami perlu melakukan pencarian manual." : "No demo talent currently matches this brief. Manual sourcing is required."}</div> : result.matches.map((match, index) => <article key={match.talent.id} className="border border-black/15 bg-white p-6 md:p-7"><div className="flex items-start justify-between gap-5"><div><p className="text-[10px] font-bold uppercase tracking-[.15em] text-black/40">#{index + 1} · {match.talent.category}</p><h3 className="mt-2 font-display text-3xl">{match.talent.name}</h3><p className="mt-2 text-sm text-black/55">{match.talent.genres.join(" · ")} · {match.talent.baseCity}</p></div><div className="text-right"><div className="font-display text-4xl">{match.score}</div><div className="text-[10px] font-bold uppercase tracking-[.12em] text-black/40">Match</div></div></div><div className="mt-5 grid gap-3 text-sm sm:grid-cols-3"><div><span className="block text-[10px] uppercase tracking-[.12em] text-black/40">Rate</span>{rupiah.format(match.talent.budgetMin)}–{rupiah.format(match.talent.budgetMax)}</div><div><span className="block text-[10px] uppercase tracking-[.12em] text-black/40">Availability</span>{match.availabilityStatus}</div><div><span className="block text-[10px] uppercase tracking-[.12em] text-black/40">Freshness</span>{match.freshness}</div></div><div className="mt-4 flex flex-wrap gap-2">{match.reasons.map(reason => <span key={reason} className="border border-black/15 px-3 py-1 text-xs text-black/55">{reason}</span>)}{match.requiresLiveConfirmation && <span className="border border-amber-400 bg-amber-50 px-3 py-1 text-xs">{id ? "Perlu konfirmasi manager" : "Manager confirmation required"}</span>}</div></article>)}<button onClick={() => setResult(null)} className="h-12 border border-black/25 px-5 text-xs font-bold uppercase tracking-[.12em]">{id ? "Ubah brief" : "Edit brief"}</button></div> : <form onSubmit={submitBrief} className="space-y-14 bg-white p-6 shadow-[0_20px_70px_rgba(0,0,0,.06)] md:p-12"><fieldset><legend className="mb-7 font-display text-3xl">01. {t.contact}</legend><div className="grid gap-6 md:grid-cols-2"><Field label={id?"Nama":"Name"} name="name" required/><Field label={id?"Perusahaan":"Company"} name="company"/><Field label="WhatsApp" name="whatsapp" required/><Field label="Email" name="email" type="email" required/></div></fieldset><fieldset><legend className="mb-7 font-display text-3xl">02. {t.event}</legend><div className="grid gap-6 md:grid-cols-2"><Field label={id?"Jenis acara":"Event type"} name="eventType" required options={["Corporate event","Brand activation","Wedding","Festival","Private event","Other"]}/><Field label={id?"Tanggal acara":"Event date"} name="date" type="date" required/><Field label={id?"Kota":"City"} name="city" required/><Field label="Venue" name="venue"/><Field label={id?"Jumlah audiens":"Audience size"} name="audience" type="number"/></div></fieldset><fieldset><legend className="mb-7 font-display text-3xl">03. {t.talent}</legend><div className="grid gap-6 md:grid-cols-2"><Field label={id?"Kategori talent":"Talent category"} name="category" required options={["Singer","Band","MC / Host","DJ","Traditional arts","Speaker"]}/><Field label="Genre / style" name="genre"/><Field label="Budget" name="budget" required options={["< Rp10 jt","Rp10–25 jt","Rp25–50 jt","Rp50–100 jt","Rp100 jt+"]}/><Field label={id?"Durasi tampil":"Performance duration"} name="duration" options={["15–30 minutes","30–60 minutes","60–90 minutes","90+ minutes"]}/><Field label={id?"Catatan tambahan":"Additional notes"} name="notes" area/></div></fieldset><button disabled={loading} className="flex h-14 w-full items-center justify-center gap-3 bg-ink text-xs font-bold uppercase tracking-[.15em] text-white transition hover:bg-ember disabled:opacity-50">{loading ? (id ? "Mencari talent…" : "Finding talent…") : t.submit}<Send size={16}/></button>{error && <p className="text-sm text-red-700">{error}</p>}</form>}</div></section>;
}
