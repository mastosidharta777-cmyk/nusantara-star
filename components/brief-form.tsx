"use client";

import Link from "next/link";
import { useState } from "react";
import { CheckCircle2, Send } from "lucide-react";
import type { Locale } from "@/lib/i18n";

type C = { eyebrow: string; title: string; body: string; contact: string; event: string; talent: string; submit: string; note: string; success: string };
type SelectedTalent = { id: string; name: string; category: string; performanceFormats: string[] } | null;
type DiscoveryCandidate = {
  id: string;
  name: string;
  category: string;
  baseCity: string;
  feeMin: number;
  feeMax: number;
  tier: "strong_match" | "acceptable_alternative";
  availabilityStatus: "available" | "tentative" | "booked" | "unavailable" | "unknown";
  requiresLiveConfirmation: boolean;
};
type SubmitResponse = {
  ok: true;
  briefId?: string;
  requestedTalent?: { id: string; name: string } | null;
  candidates?: DiscoveryCandidate[];
  nextStep?: "admin_curation" | "candidate_review" | "live_talent_confirmation";
};

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

function formatFeeRange(candidate: DiscoveryCandidate, locale: Locale) {
  const formatter = new Intl.NumberFormat(locale === "id" ? "id-ID" : "en-US", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  });
  return `${formatter.format(candidate.feeMin)} – ${formatter.format(candidate.feeMax)}`;
}

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
      setResult({
        ok: true,
        briefId: data?.briefId,
        requestedTalent: data?.requestedTalent ?? null,
        candidates: Array.isArray(data?.candidates) ? data.candidates : [],
        nextStep: data?.nextStep,
      });
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

  if (result) {
    const candidates = result.candidates ?? [];
    const hasCandidates = candidates.length > 0;
    return (
      <section className="px-5 py-16 md:px-10 md:py-24">
        <div className="mx-auto max-w-[820px]">
          <div className="border border-black/15 bg-white p-7 md:p-10">
            <CheckCircle2 size={36} className="text-ember"/>
            <p className="eyebrow mt-6">{id ? "Brief diterima" : "Brief received"}</p>
            <h1 className="mt-4 font-display text-4xl leading-tight md:text-6xl">{hasCandidates
              ? (id ? "Kandidat awal sudah ditemukan untuk acara Anda." : "Preliminary candidates found for your event.")
              : (id ? "Brief Anda sudah masuk ke tim Nusantara Star." : "Your brief is now with the Nusantara Star team.")}</h1>
            <p className="mt-6 max-w-2xl text-sm leading-7 text-black/55">{hasCandidates
              ? (id ? "Pilihan ini dicocokkan otomatis dari kategori, kota, kebutuhan acara, dan budget yang Anda kirim. Kisaran fee berasal dari data indikatif talent; availability pada tanggal acara, rider, ketentuan, dan penawaran final tetap dikonfirmasi langsung dengan talent/manager." : "These options were matched automatically from your category, city, event needs and budget. Fee ranges come from each talent's indicative data; date-specific availability, rider, terms and the final offer still require direct confirmation with the talent/manager.")
              : (id ? "Belum ada kandidat yang lolos filter otomatis. Tim kami akan meninjau kebutuhan acara dan menyiapkan alternatif yang paling sesuai." : "No candidate passed the automatic filters yet. Our team will review your event needs and prepare the most suitable alternatives.")}</p>
            {hasCandidates ? (
              <div className="mt-8 space-y-4">
                <p className="text-[10px] font-bold uppercase tracking-[.17em] text-black/45">{id ? `${candidates.length} kandidat awal` : `${candidates.length} preliminary candidate${candidates.length === 1 ? "" : "s"}`}</p>
                {candidates.map((candidate, index) => (
                  <article key={candidate.id} className="border border-black/15 p-5 md:p-6">
                    <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-[.14em] text-ember">{candidate.tier === "strong_match"
                          ? (id ? "Paling sesuai" : "Best match")
                          : (id ? "Alternatif sesuai" : "Suitable alternative")}</p>
                        <h2 className="mt-2 font-display text-3xl">{index + 1}. {candidate.name}</h2>
                        <p className="mt-2 text-xs text-black/50">{candidate.category} · {candidate.baseCity}</p>
                      </div>
                      <div className="md:text-right">
                        <p className="text-[10px] font-bold uppercase tracking-[.14em] text-black/40">{id ? "Kisaran fee indikatif" : "Indicative fee range"}</p>
                        <p className="mt-2 font-semibold">{formatFeeRange(candidate, locale)}</p>
                      </div>
                    </div>
                    <div className="mt-5 border-t border-black/10 pt-4">
                      <p className="text-xs leading-6 text-black/55">{id ? "Availability untuk tanggal acara belum final dan wajib dikonfirmasi langsung." : "Availability for the event date is not final and must be confirmed directly."}</p>
                      <Link href={`/${locale}/talent/${candidate.id}`} className="mt-4 inline-block border border-black px-4 py-2 text-[10px] font-bold uppercase tracking-[.1em]">{id ? "Lihat profil" : "View profile"}</Link>
                    </div>
                  </article>
                ))}
              </div>
            ) : null}
            <p className="mt-6 max-w-2xl text-sm font-semibold text-black/65">{id ? "Belum ada talent yang dikonfirmasi atau dibooking pada tahap ini." : "No talent is confirmed or booked at this stage."}</p>
            {result.briefId ? <p className="mt-6 text-xs text-black/40">{id ? "Referensi" : "Reference"}: {result.briefId}</p> : null}
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href={`/${locale}/talent`} className="bg-ink px-5 py-3 text-xs font-bold uppercase tracking-[.1em] text-white">{id ? "Jelajahi talent" : "Browse talent"}</Link>
              <button type="button" onClick={() => setResult(null)} className="border border-black px-5 py-3 text-xs font-bold uppercase tracking-[.1em]">{id ? "Ubah brief" : "Edit brief"}</button>
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
            {loading ? (isSelectedInquiry ? (id ? "Mengirim permintaan…" : "Sending request…") : (id ? "Mengirim brief…" : "Sending brief…")) : (isSelectedInquiry ? (id ? "Cek Ketersediaan & Minta Penawaran" : "Check Availability & Request Offer") : t.submit)}
            <Send size={16}/>
          </button>
          {error && <p className="text-sm text-red-700">{error}</p>}
        </form>
      </div>
    </section>
  );
}
