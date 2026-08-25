"use client";

import { useState } from "react";

type Props = { talentId: string; token: string; talentName: string };

export function TalentVideoUploader({ talentId, token, talentName }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [assetType, setAssetType] = useState("live_performance");
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function upload() {
    if (!file) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const prepare = await fetch("/api/talent-onboarding/video", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ talentId, token, fileName: file.name, mimeType: file.type, sizeBytes: file.size, assetType, title }),
      });
      const prepared = await prepare.json().catch(() => null);
      if (!prepare.ok) throw new Error(prepared?.detail ?? prepared?.error ?? "Gagal menyiapkan upload");

      const uploadResponse = await fetch(prepared.uploadUrl, { method: "PUT", headers: { "content-type": file.type }, body: file });
      if (!uploadResponse.ok) throw new Error(`Upload ke media storage gagal (${uploadResponse.status})`);

      const verify = await fetch("/api/talent-onboarding/video", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ talentId, token, assetId: prepared.assetId }),
      });
      const verified = await verify.json().catch(() => null);
      if (!verify.ok) throw new Error(verified?.detail ?? verified?.error ?? "Video belum dapat diverifikasi");

      setMessage("Video berhasil diunggah. Statusnya menunggu review Nusantara Star sebelum dapat ditampilkan ke buyer.");
      setFile(null);
      setTitle("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload gagal");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#f5f3ee] px-5 py-10 text-[#171713] md:px-10">
      <div className="mx-auto max-w-2xl">
        <p className="eyebrow">Nusantara Star · Talent Onboarding</p>
        <h1 className="mt-4 text-4xl font-semibold tracking-[-0.03em]">Media {talentName}</h1>
        <p className="mt-3 text-sm leading-6 text-black/55">Upload video utama untuk proses kurasi. Video tidak langsung tampil ke buyer dan tetap menunggu persetujuan admin.</p>

        <section className="mt-8 border border-black/10 bg-white p-5 md:p-6">
          <label className="block text-sm font-semibold">Jenis video<select value={assetType} onChange={(e) => setAssetType(e.target.value)} className="mt-2 w-full border border-black/15 bg-white px-3 py-3 font-normal"><option value="live_performance">Live performance</option><option value="showreel">Showreel</option><option value="event_clip">Cuplikan acara</option></select></label>
          <label className="mt-4 block text-sm font-semibold">Judul<input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Contoh: Live at Java Jazz" className="mt-2 w-full border border-black/15 px-3 py-3 font-normal" /></label>
          <label className="mt-4 block text-sm font-semibold">File video<input type="file" accept="video/mp4,video/webm" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="mt-2 block w-full text-sm font-normal" /><span className="mt-2 block text-xs font-normal text-black/45">MP4 atau WebM, maksimum 150 MB. Untuk V1 gunakan satu video utama yang paling representatif.</span></label>
          {file ? <p className="mt-3 text-xs text-black/55">{file.name} · {(file.size / 1024 / 1024).toFixed(1)} MB</p> : null}
          <button disabled={busy || !file} onClick={upload} className="mt-5 border border-black bg-black px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">{busy ? "Mengunggah…" : "Upload Video"}</button>
          {message ? <p className="mt-4 text-sm font-semibold text-green-700">{message}</p> : null}
          {error ? <p className="mt-4 text-sm font-semibold text-red-700">{error}</p> : null}
        </section>
      </div>
    </main>
  );
}
