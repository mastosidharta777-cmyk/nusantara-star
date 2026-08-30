"use client";

import Link from "next/link";
import { useState } from "react";
import { CheckCircle2, Send } from "lucide-react";
import type { Locale } from "@/lib/i18n";

type C = { eyebrow: string; title: string; body: string; contact: string; event: string; talent: string; submit: string; note: string; success: string };
type SelectedTalent = { id: string; name: string; category: string; performanceFormats: string[] } | null;
type Recommendation = { id: string; name: string; category: string; genres: string[]; baseCity: string; tier: "strong_match" | "acceptable_alternative"; reasons: string[]; availability: "needs_confirmation" | "check_required" };
type SubmitResponse = { ok: true; briefId?: string; requestedTalent?: { id: string; name: string } | null; recommendations: Recommendation[] };

type FieldProps = {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  options?: string[];
  area?: boolean;
  defaultValue?: string;
};

const Field = ({ label, name, type = "text", required = false, options, area = false, defaultValue }: FieldProps) => (
  <label className={area ? "md:col-span-2" : ""}>
    <span className="mb-2 block text-[10px] font-bold uppercase tracking-[.17em] text-black/55">{label}{required && " *"}</span>
    {area ? (
      <textarea name={name} defaultValue={defaultValue} rows={5} className="w-full border border-black/25 bg-transparent p-4 outline-none focus:border-ember"/>
    ) : options ? (
      <select required={required} name={name} defaultValue={defaultValue ?? ""} className="h-13 w-full border border-black/25 bg-paper px-4 py-3 outline-none focus:border-ember">
        <option value="" disabled>—</option>
        {options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    ) : (
      <input required={required} defaultValue={defaultValue} type={type} name={name} className="h-13 w-full border border-black/25 bg-transparent px-4 py-3 outline-none focus:border-ember"/>
    )}
  </label>
);

export function BriefForm({ locale, copy: t, selectedTalent = null, initialCategory }: { locale: Locale; copy: C; selectedTalent?: SelectedTalent; initialCategory?: string }) {
  const id = locale === "id";
  const isSelectedInquiry = Boolean(selectedTalent);
  const [result, setResult] = useState<SubmitResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submitBrief(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const fd = new FormData(e.currentTarget);
    const value = (name: string) => String(fd.get(name) ?? "").trim();
    const payload = {
      name: value("name"),
      company: value("company"),
      whatsapp: value("whatsapp"),
      email: value("email"),
      eventType: value("eventType"),
      date: value("date"),
      city: value("city"),
      venue: value("venue"),
      audience: value("audience"),
      category: isSelectedInquiry ? selectedTalent?.category ?? "" : value("category"),
      genre: isSelectedInquiry ? "" : value("genre"),
      performanceFormat: isSelectedInquiry ? value("performanceFormat") : "",
      budget: value("budget"),
      duration: value("duration"),
      notes: value("notes"),
      website: value("website"),
      requestedTalentId: selectedTalent?.id ?? "",
    };

    try {
      const response = await fetch("/api/brief", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error ?? (id ? "Permintaan gagal dikirim" : "Request submission failed"));
      setResult({ ok: true, briefId: data?.briefId, requestedTalent: data?.requestedTalent ?? null, recommendations: data?.recommendations ?? [] });
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      setError(err instanceof Error ? err.message : (id ? "Permintaan gagal dikirim" : "Request submission failed"));
    } finally {
      setLoading(false);
    }
  }

  const categoryDefault = initialCategory || "";
  const pageEyebrow = isSelectedInquiry ? (id ? "Permintaan talent" : "Talent inquiry") : t.eyebrow;
  const pageTitle = isSelectedInquiry ? (id ? `Cek ketersediaan ${selectedTalent?.name}.` : `Check ${selectedTalent?.name} availability.`) : t.title;
  const pageBody = isSelectedInquiry
    ? (id ? "Isi detail acara untuk meminta pengecekan ketersediaan dan penawaran khusus acara. Anda belum melakukan booking pada tahap ini." : "Share your event details to request an availability check and event-specific offer. This is not a booking yet.")
    : t.body;
  const pageNote = isSelectedInquiry
    ? (id ? "Harga talent tidak ditampilkan sebagai rate publik. Setelah detail acara diterima, Nusantara Star akan mengonfirmasi availability, event-specific fee, rider, dan ketentuan kepada talent/manager." : "Talent pricing is not shown as a public rate. Nusantara Star will confirm availability, event-specific fee, rider and terms with the talent/manager after receiving your event details.")
    : t.note;

  if (result && isSelectedInquiry) {
    return (
      <section className="px-5 py-16 md:px-10 md:py-24">
        <div className="mx-auto max-w-[820px]">
          <div className="border border-black/15 bg-white p-7 md:p-10">
            <CheckCircle2 size={36} className="text-ember"/>
            <p className="eyebrow mt-6">{id ? "Permintaan diterima" : "Request received"}</p>
            <h1 className="mt-4 font-display text-4xl leading-tight md:text-6xl">{id ? `Permintaan untuk ${result.requestedTalent?.name ?? selectedTalent?.name} sudah tercatat.` : `Your request for ${result.requestedTalent?.name ?? selectedTalent?.name} has been recorded.`}</h1>
            <p className="mt-6 max-w-2xl text-sm leading-7 text-black/55">{id ? "Ketersediaan dan penawaran belum final. Nusantara Star akan melakukan live confirmation dengan talent/manager berdasarkan tanggal, lokasi, format penampilan, durasi, kebutuhan acara, dan budget yang Anda kirim." : "Availability and pricing are not final yet. Nusantara Star will confirm directly with the talent/manager based on your event date, location, performance format, duration, requirements and submitted budget."}</p>
            {result.briefId ? <p className="mt-6 text-xs text-black/40">{id ? "Referensi" : "Reference"}: {result.briefId}</p> : null}
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href={`/${locale}/talent/${selectedTalent?.id}`} className="border border-black px-5 py-3 text-xs font-bold uppercase tracking-[.1em]">{id ? "Kembali ke profil" : "Back to profile"}</Link>
              <Link href={`/${locale}/talent`} className="bg-ink px-5 py-3 text-xs font-bold uppercase tracking-[.1em] text-white">{id ? "Lihat talent lain" : "Browse other talent"}</Link>
            </div>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="px-5 py-16 md:px-10 md:py-24">
      <div className="mx-auto grid max-w-[1200px] gap-14 lg:grid-cols-[.75fr_1.25fr]">
        <div className="lg:sticky lg:top-32 lg:self-start">
          <p className="eyebrow">{pageEyebrow}</p>
          <h1 className="mt-5 font-display text-5xl leading-none md:text-7xl">{pageTitle}</h1>
          <p className="mt-7 max-w-md leading-7 text-black/55">{pageBody}</p>
          {selectedTalent ? (
            <div className="mt-8 border border-black/10 bg-white p-5">
              <p className="text-[10px] font-bold uppercase tracking-[.14em] text-black/40">{id ? "Talent dipilih" : "Selected talent"}</p>
              <p className="mt-2 font-display text-2xl">{selectedTalent.name}</p>
              <p className="mt-2 text-xs text-black/45">{selectedTalent.category}</p>
            </div>
          ) : null}
          <div className="mt-10 border-l-2 border-ember pl-5 text-sm leading-6 text-black/55">{pageNote}</div>
        </div>

        {result ? (
          <div className="space-y-5">
            <div className="border border-black/15 bg-white p-7 md:p-10">
              <CheckCircle2 size={36} className="text-ember"/>
              <h2 className="mt-5 font-display text-4xl">{t.success}</h2>
              <p className="mt-4 max-w-xl text-sm leading-6 text-black/55">{id ? "Kandidat di bawah adalah hasil awal berdasarkan eligibility dan kecocokan brief. Ini bukan konfirmasi availability, harga final, atau booking." : "The candidates below are initial results based on eligibility and brief fit. They are not availability confirmations, final prices, or bookings."}</p>
              {result.briefId ? <p className="mt-5 text-xs text-black/40">{id ? "Referensi" : "Reference"}: {result.briefId}</p> : null}
            </div>
            {result.recommendations.length ? result.recommendations.map((rec, index) => (
              <article key={rec.id} className="border border-black/15 bg-white p-6 md:p-7">
                <div className="flex items-start justify-between gap-5">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[.15em] text-black/40">#{index + 1} · {rec.category}</p>
                    <h3 className="mt-2 font-display text-3xl">{rec.name}</h3>
                    <p className="mt-2 text-sm text-black/55">{rec.genres.join(" · ")}{rec.baseCity ? ` · ${rec.baseCity}` : ""}</p>
                  </div>
                  <span className="border border-ember/30 bg-ember/5 px-3 py-2 text-[10px] font-bold uppercase tracking-[.12em] text-ember">{rec.tier === "strong_match" ? (id ? "Sangat cocok" : "Strong match") : (id ? "Alternatif cocok" : "Good alternative")}</span>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">{rec.reasons.map((reason) => <span key={reason} className="border border-black/15 px-3 py-1 text-xs text-black/55">{reason}</span>)}</div>
                <p className="mt-5 text-xs font-semibold text-amber-700">{id ? "Availability: perlu konfirmasi talent/manager" : "Availability: talent/manager confirmation required"}</p>
                <Link href={`/${locale}/talent/${rec.id}`} className="mt-5 inline-block border border-black px-4 py-2 text-xs font-bold uppercase tracking-[.1em]">{id ? "Lihat profil" : "View profile"}</Link>
              </article>
            )) : (
              <div className="border border-black/15 bg-white p-7">
                <p className="text-sm font-semibold">{id ? "Belum ada roster nyata yang memenuhi eligibility brief ini." : "No real roster talent currently passes this brief's eligibility."}</p>
                <p className="mt-2 text-sm leading-6 text-black/50">{id ? "Anda tetap dapat menjelajahi roster publik atau tim Nusantara Star melakukan sourcing manual." : "You can still browse the public roster or Nusantara Star can source manually."}</p>
                <Link href={`/${locale}/talent`} className="mt-5 inline-block text-sm font-semibold underline">{id ? "Jelajahi talent" : "Browse talent"}</Link>
              </div>
            )}
            <button onClick={() => setResult(null)} className="h-12 border border-black/25 px-5 text-xs font-bold uppercase tracking-[.12em]">{id ? "Ubah pencarian" : "Edit search"}</button>
          </div>
        ) : (
          <form onSubmit={submitBrief} className="space-y-14 bg-white p-6 shadow-[0_20px_70px_rgba(0,0,0,.06)] md:p-12">
            <input name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden"/>
            <fieldset>
              <legend className="mb-7 font-display text-3xl">01. {t.contact}</legend>
              <div className="grid gap-6 md:grid-cols-2">
                <Field label={id ? "Nama" : "Name"} name="name" required/>
                <Field label={id ? "Perusahaan" : "Company"} name="company"/>
                <Field label="WhatsApp" name="whatsapp" required/>
                <Field label="Email" name="email" type="email" required/>
              </div>
            </fieldset>
            <fieldset>
              <legend className="mb-7 font-display text-3xl">02. {t.event}</legend>
              <div className="grid gap-6 md:grid-cols-2">
                <Field label={id ? "Jenis acara" : "Event type"} name="eventType" required options={["Corporate event", "Brand activation", "Wedding", "Festival", "Private event", "Other"]}/>
                <Field label={id ? "Tanggal acara" : "Event date"} name="date" type="date" required/>
                <Field label={id ? "Kota" : "City"} name="city" required/>
                <Field label="Venue" name="venue"/>
                <Field label={id ? "Jumlah audiens" : "Audience size"} name="audience" type="number"/>
              </div>
            </fieldset>
            {isSelectedInquiry ? (
              <fieldset>
                <legend className="mb-7 font-display text-3xl">03. {id ? "Detail permintaan" : "Request details"}</legend>
                <div className="grid gap-6 md:grid-cols-2">
                  {selectedTalent?.performanceFormats.length ? <Field label={id ? "Format penampilan" : "Performance format"} name="performanceFormat" required options={selectedTalent.performanceFormats}/> : null}
                  <Field label={id ? "Budget yang disiapkan untuk talent" : "Budget allocated for talent"} name="budget" required options={["< Rp10 jt", "Rp10–25 jt", "Rp25–50 jt", "Rp50–100 jt", "Rp100 jt+"]}/>
                  <Field label={id ? "Durasi tampil" : "Performance duration"} name="duration" options={["15–30 minutes", "30–60 minutes", "60–90 minutes", "90+ minutes"]}/>
                  <Field label={id ? "Kebutuhan / catatan tambahan" : "Requirements / additional notes"} name="notes" area/>
                </div>
              </fieldset>
            ) : (
              <fieldset>
                <legend className="mb-7 font-display text-3xl">03. {t.talent}</legend>
                <div className="grid gap-6 md:grid-cols-2">
                  <Field label={id ? "Kategori talent" : "Talent category"} name="category" required defaultValue={categoryDefault} options={["Singer", "Solo", "Band", "MC / Host", "DJ", "Traditional arts", "Traditional/Ethnic", "Speaker"]}/>
                  <Field label="Genre / style" name="genre"/>
                  <Field label={id ? "Budget acara / talent" : "Event / talent budget"} name="budget" required options={["< Rp10 jt", "Rp10–25 jt", "Rp25–50 jt", "Rp50–100 jt", "Rp100 jt+"]}/>
                  <Field label={id ? "Durasi tampil" : "Performance duration"} name="duration" options={["15–30 minutes", "30–60 minutes", "60–90 minutes", "90+ minutes"]}/>
                  <Field label={id ? "Catatan tambahan" : "Additional notes"} name="notes" area/>
                </div>
              </fieldset>
            )}
            <button disabled={loading} className="flex h-14 w-full items-center justify-center gap-3 bg-ink text-xs font-bold uppercase tracking-[.15em] text-white transition hover:bg-ember disabled:opacity-50">
              {loading ? (isSelectedInquiry ? (id ? "Mengirim permintaan…" : "Sending request…") : (id ? "Mencari talent…" : "Finding talent…")) : (isSelectedInquiry ? (id ? "Cek Ketersediaan & Minta Penawaran" : "Check Availability & Request Offer") : t.submit)}
              <Send size={16}/>
            </button>
            {error && <p className="text-sm text-red-700">{error}</p>}
          </form>
        )}
      </div>
    </section>
  );
}
