"use client";

import { useState } from "react";

export function SupplyEngagementResponse({ engagementId, token, initialStatus }: { engagementId: string; token: string; initialStatus: string }) {
  const [status, setStatus] = useState(initialStatus);
  const [note, setNote] = useState("");
  const [deliveryUrl, setDeliveryUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function respond(action: "confirm" | "decline") {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/supply-engagement/response", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ engagementId, token, action, note }) });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.detail ?? body?.error ?? "Respons gagal disimpan");
      setStatus(body.engagement.status);
      setNote("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Respons gagal disimpan");
    } finally {
      setBusy(false);
    }
  }

  async function delivery(action: "start" | "submit_delivery") {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/supply-engagement/delivery", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ engagementId, token, action, note, deliveryUrl }) });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.detail ?? body?.error ?? "Aksi delivery gagal disimpan");
      setStatus(body.engagement.status);
      setNote("");
      if (action === "submit_delivery") setDeliveryUrl("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Aksi delivery gagal disimpan");
    } finally {
      setBusy(false);
    }
  }

  if (status === "declined") return <p className="mt-6 border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-800">Respons sudah tercatat: Work Order belum dapat diterima. Nusantara Star akan meninjau catatan Anda.</p>;
  if (status === "awaiting_completion") return <p className="mt-6 border border-sky-200 bg-sky-50 p-4 text-sm font-semibold text-sky-900">Output sudah terkirim dan sedang ditinjau Nusantara Star. Jika revisi diperlukan, instruksi akan muncul pada riwayat Work Order ini.</p>;
  if (status === "completed") return <p className="mt-6 border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-800">Output sudah diterima. Work Order ini selesai secara operasional.</p>;

  if (status === "pending_confirmation") {
    return <div className="mt-6 border-t border-black/10 pt-5"><label className="text-xs font-semibold text-black/55">Catatan respons <span className="font-normal">(wajib jika belum dapat menerima)</span><textarea value={note} onChange={(event) => setNote(event.target.value)} rows={3} className="mt-2 w-full border border-black/15 p-3 text-sm font-normal text-black" /></label><div className="mt-3 flex flex-wrap gap-3"><button disabled={busy || !note.trim()} onClick={() => respond("decline")} className="border border-black/20 px-4 py-2.5 text-sm font-semibold disabled:opacity-40">Belum Dapat Menerima</button><button disabled={busy} onClick={() => respond("confirm")} className="border border-black bg-black px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40">{busy ? "Menyimpan…" : "Konfirmasi Work Order"}</button></div>{error ? <p className="mt-3 text-sm font-semibold text-red-700">{error}</p> : null}</div>;
  }

  if (status === "confirmed" || status === "in_progress") {
    return <div className="mt-6 border-t border-black/10 pt-5"><p className="text-sm font-semibold">{status === "confirmed" ? "Work Order sudah dikonfirmasi." : "Pekerjaan sedang berjalan."}</p><p className="mt-1 text-sm leading-6 text-black/55">Kirim satu link folder/file output ketika deliverables siap ditinjau. Ini bukan ruang chat; revisi selalu tercatat sebagai instruksi Work Order.</p><label className="mt-4 block text-xs font-semibold text-black/55">Link output / folder delivery<input value={deliveryUrl} onChange={(event) => setDeliveryUrl(event.target.value)} type="url" placeholder="https://…" className="mt-2 w-full border border-black/15 p-3 text-sm font-normal text-black" /></label><label className="mt-3 block text-xs font-semibold text-black/55">Catatan delivery <span className="font-normal">(opsional)</span><textarea value={note} onChange={(event) => setNote(event.target.value)} rows={3} className="mt-2 w-full border border-black/15 p-3 text-sm font-normal text-black" /></label><div className="mt-3 flex flex-wrap gap-3">{status === "confirmed" ? <button disabled={busy} onClick={() => delivery("start")} className="border border-black/20 px-4 py-2.5 text-sm font-semibold disabled:opacity-40">Tandai Mulai</button> : null}<button disabled={busy || !deliveryUrl.trim()} onClick={() => delivery("submit_delivery")} className="border border-black bg-black px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40">{busy ? "Menyimpan…" : "Kirim untuk Ditinjau"}</button></div>{error ? <p className="mt-3 text-sm font-semibold text-red-700">{error}</p> : null}</div>;
  }

  return <p className="mt-6 border border-black/10 p-4 text-sm font-semibold">Work Order ini tidak tersedia untuk aksi lanjutan.</p>;
}
