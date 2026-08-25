"use client";

import { useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase";

type Asset = { id: string; asset_type: string; original_filename: string | null; upload_status: string; review_status: string };
type Profile = {
  name: string; category: string; baseCity: string; genres: string; serviceCities: string; performanceFormats: string; eventTypes: string; bio: string;
  showDurationMinutes: string; managerName: string; managerEmail: string; managerWhatsapp: string; instagramUrl: string; tiktokUrl: string; youtubeUrl: string;
  baseRider: string; travelPolicy: string; accommodationPolicy: string;
};

const blank: Profile = { name: "", category: "", baseCity: "", genres: "", serviceCities: "", performanceFormats: "", eventTypes: "", bio: "", showDurationMinutes: "", managerName: "", managerEmail: "", managerWhatsapp: "", instagramUrl: "", tiktokUrl: "", youtubeUrl: "", baseRider: "", travelPolicy: "", accommodationPolicy: "" };
const split = (value: string) => value.split(",").map((x) => x.trim()).filter(Boolean);
const join = (value: unknown) => Array.isArray(value) ? value.join(", ") : "";

export function TalentOnboardingForm({ talentId, token }: { talentId: string; token: string }) {
  const [profile, setProfile] = useState<Profile>(blank);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [status, setStatus] = useState("not_started");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function refresh() {
    const res = await fetch(`/api/talent-onboarding/profile?talentId=${encodeURIComponent(talentId)}&token=${encodeURIComponent(token)}`, { cache: "no-store" });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(data?.error ?? "Gagal memuat onboarding");
    const source = data.submission ?? data.talent;
    setStatus(data.talent?.onboarding_status ?? "not_started");
    setAssets(data.assets ?? []);
    setProfile({
      name: source?.name ?? "", category: source?.category ?? "", baseCity: source?.base_city ?? "", genres: join(source?.genres), serviceCities: join(source?.service_cities),
      performanceFormats: join(source?.performance_formats), eventTypes: join(source?.event_types), bio: source?.bio ?? "", showDurationMinutes: source?.show_duration_minutes ? String(source.show_duration_minutes) : "",
      managerName: source?.manager_name ?? "", managerEmail: source?.manager_email ?? "", managerWhatsapp: source?.manager_whatsapp ?? "", instagramUrl: source?.instagram_url ?? "", tiktokUrl: source?.tiktok_url ?? "", youtubeUrl: source?.youtube_url ?? "",
      baseRider: source?.base_rider ?? "", travelPolicy: source?.travel_policy ?? "", accommodationPolicy: source?.accommodation_policy ?? "",
    });
  }

  useEffect(() => { refresh().catch((e) => setError(e.message)); }, []);
  const field = (key: keyof Profile, label: string, placeholder = "") => <label className="block text-sm font-semibold">{label}<input value={profile[key]} onChange={(e) => setProfile((p) => ({ ...p, [key]: e.target.value }))} placeholder={placeholder} className="mt-2 w-full border border-black/15 px-3 py-3 font-normal" /></label>;

  async function save() {
    setBusy(true); setError(""); setMessage("");
    try {
      const res = await fetch("/api/talent-onboarding/profile", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ talentId, token, ...profile, showDurationMinutes: profile.showDurationMinutes || null, genres: split(profile.genres), serviceCities: split(profile.serviceCities), performanceFormats: split(profile.performanceFormats), eventTypes: split(profile.eventTypes) }) });
      const data = await res.json().catch(() => null); if (!res.ok) throw new Error(data?.detail ?? data?.error ?? "Gagal menyimpan");
      setMessage("Profil tersimpan sebagai draft."); await refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "Gagal menyimpan"); } finally { setBusy(false); }
  }

  async function uploadPhoto(file: File | null) {
    if (!file) return; setBusy(true); setError(""); setMessage("");
    try {
      const prep = await fetch("/api/talent-onboarding/photo", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ talentId, token, fileName: file.name, mimeType: file.type, sizeBytes: file.size, assetType: "profile_photo" }) });
      const p = await prep.json().catch(() => null); if (!prep.ok) throw new Error(p?.detail ?? p?.error ?? "Gagal menyiapkan foto");
      const client = getSupabaseBrowserClient(); if (!client) throw new Error("Supabase browser client belum dikonfigurasi");
      const { error: uploadError } = await client.storage.from("talent-photos").uploadToSignedUrl(p.path, p.token, file, { contentType: file.type });
      if (uploadError) throw uploadError;
      const verify = await fetch("/api/talent-onboarding/photo", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ talentId, token, assetId: p.assetId }) });
      const v = await verify.json().catch(() => null); if (!verify.ok) throw new Error(v?.detail ?? v?.error ?? "Foto belum terverifikasi");
      setMessage("Foto berhasil diunggah dan menunggu review."); await refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "Upload foto gagal"); } finally { setBusy(false); }
  }

  async function uploadVideo(file: File | null) {
    if (!file) return; setBusy(true); setError(""); setMessage("");
    try {
      const prep = await fetch("/api/talent-onboarding/video", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ talentId, token, fileName: file.name, mimeType: file.type, sizeBytes: file.size, assetType: "live_performance", title: file.name.replace(/\.[^.]+$/, "") }) });
      const p = await prep.json().catch(() => null); if (!prep.ok) throw new Error(p?.detail ?? p?.error ?? "Gagal menyiapkan video");
      const put = await fetch(p.uploadUrl, { method: "PUT", headers: { "content-type": file.type }, body: file }); if (!put.ok) throw new Error(`Upload video gagal (${put.status})`);
      const verify = await fetch("/api/talent-onboarding/video", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ talentId, token, assetId: p.assetId }) });
      const v = await verify.json().catch(() => null); if (!verify.ok) throw new Error(v?.detail ?? v?.error ?? "Video belum terverifikasi");
      setMessage("Video berhasil diunggah dan menunggu review."); await refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "Upload video gagal"); } finally { setBusy(false); }
  }

  async function submit() {
    setBusy(true); setError(""); setMessage("");
    try {
      await save();
      const res = await fetch("/api/talent-onboarding/profile", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ talentId, token }) });
      const data = await res.json().catch(() => null); if (!res.ok) throw new Error(data?.detail ?? data?.error ?? "Submit gagal");
      setMessage("Onboarding berhasil dikirim ke Nusantara Star untuk review."); await refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "Submit gagal"); } finally { setBusy(false); }
  }

  return <main className="min-h-screen bg-[#f5f3ee] px-5 py-10 text-[#171713] md:px-10"><div className="mx-auto max-w-3xl">
    <p className="eyebrow">Nusantara Star · Talent Onboarding</p><div className="mt-4 flex flex-wrap items-end justify-between gap-3"><h1 className="text-4xl font-semibold tracking-[-0.03em]">Lengkapi profil talent</h1><span className="border border-black/10 bg-white px-3 py-2 text-xs font-semibold uppercase">{status}</span></div>
    <p className="mt-3 text-sm leading-6 text-black/55">Data dan media tidak otomatis tampil ke buyer. Semua menunggu review admin.</p>
    <section className="mt-8 grid gap-4 border border-black/10 bg-white p-5 md:grid-cols-2 md:p-6">{field("name", "Nama talent")}{field("category", "Kategori", "Solo / Band / DJ")}{field("baseCity", "Kota asal")}{field("showDurationMinutes", "Durasi tampil (menit)")}{field("genres", "Genre", "Pop, Jazz")}{field("serviceCities", "Kota layanan", "Jakarta, Bandung")}{field("performanceFormats", "Format tampil", "Full band, acoustic")}{field("eventTypes", "Cocok untuk event", "Corporate, wedding")}
      <label className="block text-sm font-semibold md:col-span-2">Bio<textarea value={profile.bio} onChange={(e) => setProfile((p) => ({ ...p, bio: e.target.value }))} rows={5} className="mt-2 w-full border border-black/15 px-3 py-3 font-normal" /></label>
      {field("managerName", "Manager / PIC")}{field("managerWhatsapp", "WhatsApp manager/PIC")}{field("managerEmail", "Email manager/PIC")}{field("instagramUrl", "Instagram")}{field("tiktokUrl", "TikTok")}{field("youtubeUrl", "YouTube")}
      <label className="block text-sm font-semibold md:col-span-2">Base rider<textarea value={profile.baseRider} onChange={(e) => setProfile((p) => ({ ...p, baseRider: e.target.value }))} rows={3} className="mt-2 w-full border border-black/15 px-3 py-3 font-normal" /></label>
      <label className="block text-sm font-semibold">Kebijakan perjalanan<textarea value={profile.travelPolicy} onChange={(e) => setProfile((p) => ({ ...p, travelPolicy: e.target.value }))} rows={3} className="mt-2 w-full border border-black/15 px-3 py-3 font-normal" /></label>
      <label className="block text-sm font-semibold">Kebijakan akomodasi<textarea value={profile.accommodationPolicy} onChange={(e) => setProfile((p) => ({ ...p, accommodationPolicy: e.target.value }))} rows={3} className="mt-2 w-full border border-black/15 px-3 py-3 font-normal" /></label>
      <button disabled={busy} onClick={save} className="w-fit border border-black px-4 py-2 text-sm font-semibold disabled:opacity-40">Simpan Draft</button>
    </section>
    <section className="mt-5 grid gap-4 md:grid-cols-2"><label className="border border-black/10 bg-white p-5 text-sm font-semibold">Foto profil<input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={(e) => uploadPhoto(e.target.files?.[0] ?? null)} className="mt-3 block w-full text-sm font-normal" /><span className="mt-2 block text-xs font-normal text-black/45">JPG/PNG/WebP, maks. 10 MB</span></label><label className="border border-black/10 bg-white p-5 text-sm font-semibold">Video live utama<input type="file" accept="video/mp4,video/webm" disabled={busy} onChange={(e) => uploadVideo(e.target.files?.[0] ?? null)} className="mt-3 block w-full text-sm font-normal" /><span className="mt-2 block text-xs font-normal text-black/45">MP4/WebM, maks. 150 MB</span></label></section>
    <section className="mt-5 border border-black/10 bg-white p-5"><p className="text-sm font-semibold">Media terunggah</p><div className="mt-3 space-y-2">{assets.length ? assets.map((a) => <div key={a.id} className="flex justify-between gap-3 border-t border-black/10 pt-2 text-xs"><span>{a.asset_type} · {a.original_filename ?? "file"}</span><span>{a.upload_status} / {a.review_status}</span></div>) : <p className="text-xs text-black/45">Belum ada media.</p>}</div></section>
    {message ? <p className="mt-4 text-sm font-semibold text-green-700">{message}</p> : null}{error ? <p className="mt-4 text-sm font-semibold text-red-700">{error}</p> : null}
    <button disabled={busy || status === "approved"} onClick={submit} className="mt-6 border border-black bg-black px-5 py-3 text-sm font-semibold text-white disabled:opacity-40">{busy ? "Memproses…" : "Kirim untuk Review"}</button>
  </div></main>;
}
