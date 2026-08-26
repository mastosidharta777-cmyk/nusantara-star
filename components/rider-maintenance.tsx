"use client";

import { useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase";

type RiderQuestion = { key: string; label: string; reason?: string };
type RiderState = {
  id: string;
  version_no: number;
  source_type: string;
  source_filename?: string | null;
  normalized_data?: Record<string, unknown>;
  missing_questions?: RiderQuestion[];
  answers?: Record<string, string>;
  normalization_source?: string;
  status: string;
};

export function RiderMaintenance({ talentId, talentName, token }: { talentId: string; talentName: string; token: string }) {
  const [rider, setRider] = useState<RiderState | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function refresh() {
    const res = await fetch(`/api/talent-onboarding/rider-status?talentId=${encodeURIComponent(talentId)}&token=${encodeURIComponent(token)}`, { cache: "no-store" });
    const body = await res.json().catch(() => null);
    if (!res.ok) throw new Error(body?.detail ?? body?.error ?? "Gagal memuat rider");
    setRider(body?.rider ?? null);
    setAnswers(body?.rider?.answers ?? {});
  }

  useEffect(() => { refresh().catch((e) => setError(e.message)); }, []);

  async function upload(file: File | null) {
    if (!file) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const prep = await fetch("/api/talent-onboarding/rider", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ talentId, token, fileName: file.name, mimeType: file.type, sizeBytes: file.size }) });
      const p = await prep.json().catch(() => null);
      if (!prep.ok) throw new Error(p?.detail ?? p?.error ?? "Upload rider gagal");
      const supabase = getSupabaseBrowserClient();
      if (!supabase) throw new Error("Supabase browser client belum dikonfigurasi");
      const { error: uploadError } = await supabase.storage.from("talent-documents").uploadToSignedUrl(p.path, p.token, file, { contentType: file.type });
      if (uploadError) throw uploadError;
      const verify = await fetch("/api/talent-onboarding/rider", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ talentId, token, assetId: p.assetId }) });
      const result = await verify.json().catch(() => null);
      if (!verify.ok) throw new Error(result?.detail ?? result?.error ?? "Rider belum terverifikasi");
      if (!result?.normalized) throw new Error(result?.normalizationError ?? "Dokumen tersimpan, tetapi belum dapat dinormalisasi");
      setMessage("Rider baru berhasil diproses. Lengkapi hanya informasi yang masih kurang.");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload rider gagal");
    } finally { setBusy(false); }
  }

  async function saveAnswers() {
    setBusy(true); setError(""); setMessage("");
    try {
      const res = await fetch("/api/talent-onboarding/rider-status", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ talentId, token, answers }) });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.detail ?? body?.error ?? "Gagal menyimpan jawaban");
      setMessage(body?.rider?.status === "ready_for_admin" ? "Rider lengkap dan siap direview admin." : "Jawaban tersimpan. Masih ada informasi yang perlu dilengkapi.");
      await refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "Gagal menyimpan jawaban"); }
    finally { setBusy(false); }
  }

  const questions = Array.isArray(rider?.missing_questions) ? rider!.missing_questions! : [];

  return <main className="min-h-screen bg-[#f5f3ee] px-5 py-10 text-[#171713] md:px-10">
    <div className="mx-auto max-w-3xl">
      <p className="eyebrow">Nusantara Star · Rider</p>
      <h1 className="mt-4 text-4xl font-semibold tracking-[-0.03em]">Master rider · {talentName}</h1>
      <p className="mt-3 text-sm text-black/55">Profil yang sudah approved tetap terkunci. Rider dikelola terpisah karena dapat berubah dari waktu ke waktu.</p>

      <section className="mt-8 border border-black/10 bg-white p-5 md:p-6">
        <p className="text-sm font-semibold">Upload rider terbaru</p>
        <p className="mt-1 text-xs text-black/50">PDF/DOCX/TXT maks. 15 MB. File asli tetap menjadi source of truth.</p>
        <input type="file" accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain" disabled={busy} onChange={(e) => upload(e.target.files?.[0] ?? null)} className="mt-4 block w-full text-sm" />
      </section>

      <section className="mt-5 border border-black/10 bg-white p-5 md:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm font-semibold">Rider aktif</p>
          <span className="border border-black/10 px-3 py-2 text-xs font-semibold uppercase">{rider ? `v${rider.version_no} · ${rider.status.replaceAll("_", " ")}` : "belum ada"}</span>
        </div>
        {rider ? <>
          <p className="mt-3 text-xs text-black/50">Sumber: {rider.source_filename || rider.source_type} · Normalisasi: {rider.normalization_source || "rules"}</p>
          <pre className="mt-4 max-h-80 overflow-auto whitespace-pre-wrap border border-black/10 bg-[#f5f3ee] p-4 text-xs">{JSON.stringify(rider.normalized_data ?? {}, null, 2)}</pre>
        </> : <p className="mt-4 text-sm text-black/50">Upload rider baru untuk membuat versi pertama.</p>}
      </section>

      {questions.length ? <section className="mt-5 border border-black/10 bg-white p-5 md:p-6">
        <p className="text-sm font-semibold">Lengkapi yang masih kurang</p>
        <p className="mt-1 text-xs text-black/50">Sistem hanya menanyakan data yang belum ditemukan atau masih ambigu.</p>
        <div className="mt-4 space-y-4">{questions.map((q) => <label key={q.key} className="block text-sm font-semibold">{q.label}<input value={answers[q.key] ?? ""} onChange={(e) => setAnswers((v) => ({ ...v, [q.key]: e.target.value }))} className="mt-2 w-full border border-black/15 px-3 py-3 font-normal" />{q.reason ? <span className="mt-1 block text-xs font-normal text-black/45">{q.reason}</span> : null}</label>)}</div>
        <button disabled={busy} onClick={saveAnswers} className="mt-5 border border-black bg-black px-4 py-3 text-sm font-semibold text-white disabled:opacity-40">Simpan & cek ulang</button>
      </section> : rider?.status === "ready_for_admin" ? <div className="mt-5 border border-green-700/20 bg-green-50 p-4 text-sm font-semibold text-green-800">✓ Rider siap direview admin.</div> : null}

      {message ? <p className="mt-4 text-sm font-semibold text-green-700">{message}</p> : null}
      {error ? <p className="mt-4 text-sm font-semibold text-red-700">{error}</p> : null}
    </div>
  </main>;
}
