"use client";

import { useEffect, useState } from "react";

import { supplyDetailFields, supplyTypeLabel, type SupplyType } from "@/lib/supply-onboarding";

type Profile = {
  name: string;
  category: string;
  baseCity: string;
  serviceCities: string;
  serviceFormats: string;
  capabilityTags: string;
  eventTypes: string;
  bio: string;
  managerName: string;
  managerEmail: string;
  managerWhatsapp: string;
  portfolioUrl: string;
  bookingLimitations: string;
};

const blank: Profile = {
  name: "",
  category: "",
  baseCity: "",
  serviceCities: "",
  serviceFormats: "",
  capabilityTags: "",
  eventTypes: "",
  bio: "",
  managerName: "",
  managerEmail: "",
  managerWhatsapp: "",
  portfolioUrl: "",
  bookingLimitations: "",
};

function join(value: unknown) {
  return Array.isArray(value) ? value.join(", ") : "";
}
function split(value: string) {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}
function objectStrings(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {} as Record<string, string>;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
}
function statusLabel(value: string) {
  if (value === "not_started") return "Belum dimulai";
  if (value === "in_progress") return "Sedang dilengkapi";
  if (value === "submitted") return "Sudah dikirim";
  if (value === "approved") return "Disetujui";
  if (value === "rejected") return "Perlu revisi";
  return value.replaceAll("_", " ");
}

export function SupplyOnboardingForm({
  supplyId,
  token,
  supplyType,
}: {
  supplyId: string;
  token: string;
  supplyType: Exclude<SupplyType, "talent">;
}) {
  const [profile, setProfile] = useState<Profile>(blank);
  const [details, setDetails] = useState<Record<string, string>>({});
  const [status, setStatus] = useState("not_started");
  const [revisionNote, setRevisionNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const locked = status === "submitted" || status === "approved";
  const label = supplyTypeLabel(supplyType);
  const isPartner = supplyType === "production_partner";
  const detailFields = supplyDetailFields(supplyType, profile.category);

  async function refresh() {
    const response = await fetch(`/api/supply-onboarding/profile?supplyId=${encodeURIComponent(supplyId)}&token=${encodeURIComponent(token)}`, { cache: "no-store" });
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new Error(data?.error ?? "Gagal memuat pendaftaran");
    const source = data.submission ?? data.supply;
    setStatus(data.supply?.onboarding_status ?? "not_started");
    setRevisionNote(typeof data.submission?.rejection_note === "string" ? data.submission.rejection_note : "");
    setDetails(objectStrings(source?.supply_details));
    setProfile({
      name: source?.name ?? "",
      category: source?.category ?? "",
      baseCity: source?.base_city ?? "",
      serviceCities: join(source?.service_cities),
      serviceFormats: join(source?.performance_formats),
      capabilityTags: join(source?.capability_tags),
      eventTypes: join(source?.event_types),
      bio: source?.bio ?? "",
      managerName: source?.manager_name ?? "",
      managerEmail: source?.manager_email ?? "",
      managerWhatsapp: source?.manager_whatsapp ?? "",
      portfolioUrl: source?.portfolio_url ?? "",
      bookingLimitations: source?.booking_limitations ?? "",
    });
  }

  useEffect(() => {
    refresh().catch((err) => setError(err instanceof Error ? err.message : "Gagal memuat pendaftaran"));
  }, []);

  function field(key: keyof Profile, labelText: string, placeholder = "") {
    return (
      <label className="block text-sm font-semibold">
        {labelText}
        <input
          disabled={locked || key === "category"}
          value={profile[key]}
          placeholder={placeholder}
          onChange={(event) => setProfile((value) => ({ ...value, [key]: event.target.value }))}
          className="mt-2 w-full border border-black/15 px-3 py-3 font-normal disabled:bg-black/5"
        />
      </label>
    );
  }

  async function persistDraft() {
    const response = await fetch("/api/supply-onboarding/profile", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        supplyId,
        token,
        ...profile,
        supplyDetails: details,
        serviceCities: split(profile.serviceCities),
        serviceFormats: split(profile.serviceFormats),
        capabilityTags: split(profile.capabilityTags),
        eventTypes: split(profile.eventTypes),
      }),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new Error(data?.error ?? "Gagal menyimpan profil");
  }

  async function save() {
    setBusy(true);
    setMessage("");
    setError("");
    try {
      await persistDraft();
      setMessage("Profil tersimpan sebagai draf.");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menyimpan profil");
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    setBusy(true);
    setMessage("");
    setError("");
    try {
      await persistDraft();
      const response = await fetch("/api/supply-onboarding/profile", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ supplyId, token }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error ?? "Gagal mengirim profil");
      setMessage("Profil berhasil dikirim untuk ditinjau.");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal mengirim profil");
    } finally {
      setBusy(false);
    }
  }

  async function reopen() {
    setBusy(true);
    setMessage("");
    setError("");
    try {
      const response = await fetch("/api/supply-onboarding/profile", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ supplyId, token, action: "reopen" }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error ?? "Profil belum dapat dibuka kembali");
      setMessage("Profil dibuka kembali untuk diedit.");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Profil belum dapat dibuka kembali");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#f5f3ee] px-5 py-8 text-[#171713] md:px-10 md:py-12">
      <div className="mx-auto max-w-[920px]">
        <header className="border-b border-black/10 pb-7">
          <p className="eyebrow mb-3">Nusantara Star · Pendaftaran {label}</p>
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <h1 className="text-3xl font-semibold tracking-[-0.03em] md:text-5xl">Lengkapi profil {label.toLowerCase()}.</h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-black/55">Kategori sudah ditentukan oleh tim Nusantara Star. Pertanyaan di bawah menyesuaikan kategori tersebut agar admin dapat memverifikasi kemampuan yang relevan.</p>
            </div>
            <span className="w-fit border border-black/10 bg-white px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em]">{statusLabel(status)}</span>
          </div>
        </header>

        {revisionNote ? <div className="mt-6 border border-amber-300 bg-amber-50 p-4 text-sm"><b>Catatan revisi admin:</b><p className="mt-1 whitespace-pre-wrap">{revisionNote}</p></div> : null}
        {status === "submitted" ? <div className="mt-6 border border-blue-200 bg-blue-50 p-4 text-sm">Data dikunci agar admin meninjau versi yang sama. Jika masih ada yang perlu diperbaiki, klik <b>Edit kembali</b>, lalu kirim ulang setelah selesai.</div> : null}
        {status === "approved" ? <div className="mt-6 border border-green-700/20 bg-green-50 p-4 text-sm font-semibold text-green-800">Profil sudah disetujui untuk database internal Nusantara Star. Publikasi ke katalog terpisah dan tidak otomatis.</div> : null}

        <section className="mt-6 space-y-6 border border-black/10 bg-white p-5 md:p-7">
          <div className="grid gap-5 md:grid-cols-2">
            {field("category", "Kategori")}
            {field("name", isPartner ? "Nama perusahaan / brand" : "Nama profesional / nama kerja")}
            {field("baseCity", "Kota basis", "Contoh: Jakarta")}
            {field("serviceCities", "Kota layanan", "Pisahkan dengan koma")}
            {field("serviceFormats", isPartner ? "Layanan / format produksi" : "Format kerja / layanan", "Pisahkan dengan koma")}
            {field("capabilityTags", "Keahlian / kapabilitas utama", "Pisahkan dengan koma")}
            {field("eventTypes", "Jenis proyek / acara yang biasa ditangani", "Pisahkan dengan koma")}
            {field("portfolioUrl", "Link portofolio utama", "https://...")}
          </div>

          {detailFields.length ? <div className="border-t border-black/10 pt-6">
            <div className="mb-4"><p className="text-xs font-semibold uppercase tracking-[0.12em] text-black/40">Detail {profile.category}</p><p className="mt-2 text-sm text-black/55">Isi kemampuan yang relevan dengan kategori ini. Kolom bertanda wajib harus dilengkapi sebelum dikirim.</p></div>
            <div className="grid gap-5 md:grid-cols-2">{detailFields.map((item) => <label key={item.key} className={`block text-sm font-semibold ${item.kind === "textarea" ? "md:col-span-2" : ""}`}>{item.label}{item.required ? " *" : ""}
              {item.kind === "textarea" ? <textarea disabled={locked} rows={4} value={details[item.key] ?? ""} placeholder={item.placeholder ?? ""} onChange={(event) => setDetails((value) => ({ ...value, [item.key]: event.target.value }))} className="mt-2 w-full border border-black/15 px-3 py-3 font-normal disabled:bg-black/5" /> : <input disabled={locked} value={details[item.key] ?? ""} placeholder={item.placeholder ?? ""} onChange={(event) => setDetails((value) => ({ ...value, [item.key]: event.target.value }))} className="mt-2 w-full border border-black/15 px-3 py-3 font-normal disabled:bg-black/5" />}
            </label>)}</div>
          </div> : null}

          <label className="block text-sm font-semibold">{isPartner ? "Profil perusahaan singkat" : "Bio / profil profesional"}
            <textarea disabled={locked} value={profile.bio} onChange={(event) => setProfile((value) => ({ ...value, bio: event.target.value }))} rows={6} className="mt-2 w-full border border-black/15 px-3 py-3 font-normal disabled:bg-black/5" />
          </label>

          <div className="grid gap-5 md:grid-cols-3">
            {field("managerName", "PIC utama")}
            {field("managerWhatsapp", "WhatsApp PIC")}
            {field("managerEmail", "Email PIC")}
          </div>

          <label className="block text-sm font-semibold">Batasan booking / operasional <span className="font-normal text-black/45">(opsional)</span>
            <textarea disabled={locked} value={profile.bookingLimitations} onChange={(event) => setProfile((value) => ({ ...value, bookingLimitations: event.target.value }))} rows={4} className="mt-2 w-full border border-black/15 px-3 py-3 font-normal disabled:bg-black/5" />
          </label>

          <p className="text-xs leading-5 text-black/45">Portofolio digunakan sebagai bukti awal untuk verifikasi. Rate, kontrak, pembayaran, legal document upload, dan detail proyek tetap dikonfirmasi terpisah oleh admin sebelum penawaran ke klien.</p>

          <div className="flex flex-wrap gap-3 border-t border-black/10 pt-5">
            {!locked ? <>
              <button type="button" disabled={busy} onClick={save} className="border border-black/20 px-4 py-2.5 text-sm font-semibold disabled:opacity-40">{busy ? "Memproses…" : "Simpan Draf"}</button>
              <button type="button" disabled={busy} onClick={submit} className="border border-black bg-black px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40">{busy ? "Memproses…" : "Kirim untuk Tinjauan"}</button>
            </> : null}
            {status === "submitted" ? <button type="button" disabled={busy} onClick={reopen} className="border border-black/20 px-4 py-2.5 text-sm font-semibold disabled:opacity-40">{busy ? "Memproses…" : "Edit kembali"}</button> : null}
          </div>
          {message ? <p className="text-sm font-semibold text-green-800">{message}</p> : null}
          {error ? <p className="text-sm font-semibold text-red-700">{error}</p> : null}
        </section>
      </div>
    </main>
  );
}
