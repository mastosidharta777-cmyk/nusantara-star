"use client";

import { useState } from "react";
import { CalendarDays, ChevronRight, MapPin, Sparkles } from "lucide-react";

type FieldProps = {
  label: string;
  name: string;
  placeholder?: string;
  type?: string;
  required?: boolean;
  options?: { label: string; value: string }[];
  textarea?: boolean;
};

function Field({ label, name, placeholder, type = "text", required = false, options, textarea = false }: FieldProps) {
  return (
    <label className="block">
      <span className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.14em] text-black/45">
        {label}{required ? " *" : ""}
      </span>
      {textarea ? (
        <textarea
          name={name}
          rows={5}
          placeholder={placeholder}
          className="w-full border border-black/15 bg-white px-4 py-3.5 text-sm outline-none transition focus:border-black/55"
        />
      ) : options ? (
        <select
          name={name}
          required={required}
          defaultValue=""
          className="w-full border border-black/15 bg-white px-4 py-3.5 text-sm outline-none transition focus:border-black/55"
        >
          <option value="" disabled>Pilih</option>
          {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      ) : (
        <input
          name={name}
          type={type}
          required={required}
          placeholder={placeholder}
          className="w-full border border-black/15 bg-white px-4 py-3.5 text-sm outline-none transition focus:border-black/55"
        />
      )}
    </label>
  );
}

function SectionTitle({ no, title, desc }: { no: string; title: string; desc: string }) {
  return (
    <div className="mb-6 border-b border-black/10 pb-5">
      <div className="flex items-start gap-4">
        <span className="mt-0.5 text-xs font-semibold tracking-[0.15em] text-[#a53b22]">{no}</span>
        <div>
          <h2 className="text-xl font-semibold tracking-[-0.02em] md:text-2xl">{title}</h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-black/45">{desc}</p>
        </div>
      </div>
    </div>
  );
}

export function ClientBriefForm() {
  const [submitted, setSubmitted] = useState(false);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitted(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  if (submitted) {
    return (
      <section className="mx-auto max-w-[860px] px-5 py-16 md:px-8 md:py-24">
        <div className="border border-black/10 bg-white p-7 md:p-10">
          <div className="flex h-11 w-11 items-center justify-center rounded-full border border-black/10 bg-[#f5f3ee]">
            <Sparkles size={18} />
          </div>
          <p className="mt-7 text-xs font-semibold uppercase tracking-[0.16em] text-[#a53b22]">Brief diterima</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-[-0.04em] md:text-5xl">Kami akan kurasi talent yang paling tepat.</h1>
          <p className="mt-5 max-w-2xl text-sm leading-7 text-black/55">
            Tim Nusantara Star akan memeriksa kebutuhan acara, budget, kecocokan talent, dan availability sebelum mengirimkan rekomendasi.
          </p>
          <button onClick={() => setSubmitted(false)} className="mt-8 border border-black px-5 py-3 text-xs font-semibold uppercase tracking-[0.12em]">
            Ubah brief
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="bg-[#f5f3ee] px-5 py-12 text-[#171713] md:px-8 md:py-20">
      <div className="mx-auto max-w-[1180px]">
        <div className="grid gap-10 lg:grid-cols-[0.72fr_1.28fr] lg:gap-16">
          <aside className="lg:sticky lg:top-28 lg:self-start">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#a53b22]">Nusantara Star · Client Brief</p>
            <h1 className="mt-5 max-w-lg text-5xl font-semibold leading-[0.98] tracking-[-0.05em] md:text-6xl">
              Ceritakan acara Anda. Kami carikan talent yang tepat.
            </h1>
            <p className="mt-6 max-w-md text-sm leading-7 text-black/55">
              Tidak perlu membuka puluhan profil. Kirim satu brief, lalu kami kurasi kandidat yang relevan berdasarkan acara, budget, lokasi, dan kebutuhan Anda.
            </p>

            <div className="mt-8 space-y-3 border-t border-black/10 pt-6 text-sm text-black/55">
              <div className="flex items-center gap-3"><CalendarDays size={16} /><span>Live availability akan dikonfirmasi sebelum final.</span></div>
              <div className="flex items-center gap-3"><MapPin size={16} /><span>Rekomendasi mempertimbangkan lokasi dan kebutuhan acara.</span></div>
            </div>
          </aside>

          <form onSubmit={handleSubmit} className="border border-black/10 bg-white p-5 shadow-[0_18px_60px_rgba(0,0,0,0.05)] md:p-8 lg:p-10">
            <section>
              <SectionTitle no="01" title="Kontak Klien" desc="Untuk mengirim rekomendasi dan menghubungi Anda jika ada detail yang perlu dikonfirmasi." />
              <div className="grid gap-5 md:grid-cols-2">
                <Field label="Nama" name="client_name" placeholder="Nama lengkap" required />
                <Field label="Perusahaan / Organisasi" name="company" placeholder="Opsional" />
                <Field label="WhatsApp" name="whatsapp" placeholder="08xxxxxxxxxx" required />
                <Field label="Email" name="email" type="email" placeholder="nama@perusahaan.com" required />
              </div>
            </section>

            <section className="mt-10">
              <SectionTitle no="02" title="Detail Acara" desc="Informasi dasar ini dipakai untuk menyaring talent yang relevan dan realistis." />
              <div className="grid gap-5 md:grid-cols-2">
                <Field label="Jenis Acara" name="event_type" required options={[
                  { label: "Corporate Event", value: "corporate_event" },
                  { label: "Brand Activation", value: "brand_activation" },
                  { label: "Wedding", value: "wedding" },
                  { label: "Private Event", value: "private_event" },
                  { label: "MICE / Conference", value: "mice" },
                  { label: "Hotel / Hospitality", value: "hospitality" },
                  { label: "Lainnya", value: "other" },
                ]} />
                <Field label="Tanggal Acara" name="event_date" type="date" required />
                <Field label="Kota" name="city" placeholder="Contoh: Jakarta" required />
                <Field label="Venue" name="venue" placeholder="Nama venue / area, jika sudah ada" />
                <Field label="Perkiraan Jumlah Audiens" name="audience_size" type="number" placeholder="Contoh: 500" />
                <Field label="Durasi Tampil" name="performance_duration" options={[
                  { label: "15–30 menit", value: "15-30" },
                  { label: "30–60 menit", value: "30-60" },
                  { label: "60–90 menit", value: "60-90" },
                  { label: "Lebih dari 90 menit", value: "90+" },
                ]} />
              </div>
            </section>

            <section className="mt-10">
              <SectionTitle no="03" title="Kebutuhan Talent" desc="Pilih kategori utama. Tim kami tetap dapat menawarkan alternatif jika ada pilihan yang lebih cocok." />
              <div className="grid gap-5 md:grid-cols-2">
                <Field label="Kategori Talent" name="talent_category" required options={[
                  { label: "Band", value: "band" },
                  { label: "Solo Singer", value: "solo_singer" },
                  { label: "Acoustic / Duo / Trio", value: "acoustic" },
                  { label: "DJ", value: "dj" },
                  { label: "MC / Host", value: "mc_host" },
                  { label: "Traditional & Cultural", value: "traditional_cultural" },
                  { label: "Specialty Performer", value: "specialty_performer" },
                ]} />
                <Field label="Genre / Style" name="genre_style" placeholder="Contoh: pop, jazz, upbeat, elegant" />
                <Field label="Vibe Acara" name="event_vibe" placeholder="Contoh: premium, intimate, energetic" />
                <Field label="Preferensi Khusus" name="talent_preference" placeholder="Opsional: karakter, usia, format panggung" />
              </div>
            </section>

            <section className="mt-10">
              <SectionTitle no="04" title="Budget & Catatan" desc="Budget membantu kami menghindari rekomendasi yang tidak realistis dan mempercepat negosiasi." />
              <div className="grid gap-5 md:grid-cols-2">
                <Field label="Budget Minimum" name="budget_min" type="number" placeholder="Rp" />
                <Field label="Budget Maksimum" name="budget_max" type="number" placeholder="Rp" required />
                <div className="md:col-span-2">
                  <Field label="Kebutuhan / Catatan Tambahan" name="special_requirements" textarea placeholder="Contoh: kebutuhan lagu tertentu, dress code, rundown, equipment, brand restriction, atau detail lain yang penting." />
                </div>
              </div>
            </section>

            <div className="mt-10 border-t border-black/10 pt-7">
              <button className="flex w-full items-center justify-center gap-2 bg-black px-5 py-4 text-xs font-semibold uppercase tracking-[0.14em] text-white transition hover:bg-[#a53b22]">
                Kirim Brief <ChevronRight size={15} />
              </button>
              <p className="mt-4 text-center text-xs leading-5 text-black/40">
                Mengirim brief belum berarti booking atau kontrak. Availability dan harga final akan dikonfirmasi terlebih dahulu.
              </p>
            </div>
          </form>
        </div>
      </div>
    </section>
  );
}
