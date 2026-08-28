"use client";

import { useState } from "react";
import { CheckCircle2, Send } from "lucide-react";
import type { Locale } from "@/lib/i18n";

type C = { eyebrow: string; title: string; body: string; contact: string; event: string; talent: string; submit: string; note: string; success: string };
type SubmitResponse = { ok: true; briefId?: string };

const Field = ({ label, name, type="text", required=false, options, area=false }: { label: string; name: string; type?: string; required?: boolean; options?: string[]; area?: boolean }) => <label className={area ? "md:col-span-2" : ""}><span className="mb-2 block text-[10px] font-bold uppercase tracking-[.17em] text-black/55">{label}{required && " *"}</span>{area ? <textarea name={name} rows={5} className="w-full border border-black/25 bg-transparent p-4 outline-none focus:border-ember"/> : options ? <select required={required} name={name} defaultValue="" className="h-13 w-full border border-black/25 bg-paper px-4 py-3 outline-none focus:border-ember"><option value="" disabled>—</option>{options.map(x => <option key={x}>{x}</option>)}</select> : <input required={required} type={type} name={name} className="h-13 w-full border border-black/25 bg-transparent px-4 py-3 outline-none focus:border-ember"/>}</label>;

export function BriefForm({ locale, copy: t }: { locale: Locale; copy: C }) {
  const id = locale === "id";
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
      name: value("name"), company: value("company"), whatsapp: value("whatsapp"), email: value("email"),
      eventType: value("eventType"), date: value("date"), city: value("city"), venue: value("venue"), audience: value("audience"),
      category: value("category"), genre: value("genre"), budget: value("budget"), duration: value("duration"), notes: value("notes"),
      website: value("website"),
    };

    try {
      const response = await fetch("/api/brief", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error ?? (id ? "Brief gagal dikirim" : "Brief submission failed"));
      setResult({ ok: true, briefId: data?.briefId });
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      setError(err instanceof Error ? err.message : (id ? "Brief gagal dikirim" : "Brief submission failed"));
    } finally {
      setLoading(false);
    }
  }

  return <section className="px-5 py-16 md:px-10 md:py-24"><div className="mx-auto grid max-w-[1200px] gap-14 lg:grid-cols-[.75fr_1.25fr]"><div className="lg:sticky lg:top-32 lg:self-start"><p className="eyebrow">{t.eyebrow}</p><h1 className="mt-5 font-display text-5xl leading-none md:text-7xl">{t.title}</h1><p className="mt-7 max-w-md leading-7 text-black/55">{t.body}</p><div className="mt-10 border-l-2 border-ember pl-5 text-sm leading-6 text-black/55">{t.note}</div></div>{result ? <div className="border border-black/15 bg-white p-7 md:p-10"><CheckCircle2 size={36} className="text-ember"/><h2 className="mt-5 font-display text-4xl">{t.success}</h2><p className="mt-4 max-w-xl text-sm leading-6 text-black/55">{id ? "Brief Anda sudah tersimpan. AI membantu menstrukturkan kebutuhan dan menyiapkan pencocokan internal. Tim Nusantara Star akan meninjau kandidat, mengonfirmasi ketersediaan dan ketentuan dengan talent/manager, lalu mengirim pilihan yang sudah disetujui." : "Your brief has been saved. AI structures the requirements and prepares internal matching. Nusantara Star will review candidates, confirm availability and terms with the talent/manager, then send approved options."}</p>{result.briefId ? <p className="mt-6 border border-black/10 bg-black/[0.025] p-4 text-xs text-black/55"><span className="font-semibold text-black">{id ? "Referensi brief" : "Brief reference"}:</span> {result.briefId}</p> : null}<p className="mt-5 text-xs leading-5 text-black/45">{id ? "Tidak ada harga, shortlist, atau komitmen booking yang dianggap final sebelum proses konfirmasi dan persetujuan selesai." : "No price, shortlist, or booking commitment is final before confirmation and approval are completed."}</p><button onClick={() => setResult(null)} className="mt-7 h-12 border border-black/25 px-5 text-xs font-bold uppercase tracking-[.12em]">{id ? "Kirim brief lain" : "Send another brief"}</button></div> : <form onSubmit={submitBrief} className="space-y-14 bg-white p-6 shadow-[0_20px_70px_rgba(0,0,0,.06)] md:p-12"><input name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden"/><fieldset><legend className="mb-7 font-display text-3xl">01. {t.contact}</legend><div className="grid gap-6 md:grid-cols-2"><Field label={id?"Nama":"Name"} name="name" required/><Field label={id?"Perusahaan":"Company"} name="company"/><Field label="WhatsApp" name="whatsapp" required/><Field label="Email" name="email" type="email" required/></div></fieldset><fieldset><legend className="mb-7 font-display text-3xl">02. {t.event}</legend><div className="grid gap-6 md:grid-cols-2"><Field label={id?"Jenis acara":"Event type"} name="eventType" required options={["Corporate event","Brand activation","Wedding","Festival","Private event","Other"]}/><Field label={id?"Tanggal acara":"Event date"} name="date" type="date" required/><Field label={id?"Kota":"City"} name="city" required/><Field label="Venue" name="venue"/><Field label={id?"Jumlah audiens":"Audience size"} name="audience" type="number"/></div></fieldset><fieldset><legend className="mb-7 font-display text-3xl">03. {t.talent}</legend><div className="grid gap-6 md:grid-cols-2"><Field label={id?"Kategori talent":"Talent category"} name="category" required options={["Singer","Band","MC / Host","DJ","Traditional arts","Speaker"]}/><Field label="Genre / style" name="genre"/><Field label="Budget" name="budget" required options={["< Rp10 jt","Rp10–25 jt","Rp25–50 jt","Rp50–100 jt","Rp100 jt+"]}/><Field label={id?"Durasi tampil":"Performance duration"} name="duration" options={["15–30 minutes","30–60 minutes","60–90 minutes","90+ minutes"]}/><Field label={id?"Catatan tambahan":"Additional notes"} name="notes" area/></div></fieldset><button disabled={loading} className="flex h-14 w-full items-center justify-center gap-3 bg-ink text-xs font-bold uppercase tracking-[.15em] text-white transition hover:bg-ember disabled:opacity-50">{loading ? (id ? "Mengirim brief…" : "Submitting brief…") : t.submit}<Send size={16}/></button>{error && <p className="text-sm text-red-700">{error}</p>}</form>}</div></section>;
}
