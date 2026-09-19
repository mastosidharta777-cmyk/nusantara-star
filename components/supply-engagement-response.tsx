"use client";

import { useState } from "react";

export function SupplyEngagementResponse({ engagementId, token, initialStatus }: { engagementId: string; token: string; initialStatus: string }) {
  const [status, setStatus] = useState(initialStatus);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function respond(action: "confirm" | "decline") {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/supply-engagement/response", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ engagementId, token, action, note }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.detail ?? body?.error ?? "Respons gagal disimpan");
      setStatus(body.engagement.status);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Respons gagal disimpan");
    } finally {
      setBusy(false);
    }
  }

  if (status === "confirmed") return <p className="mt-6 border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-800">Work Order sudah dikonfirmasi. Nusantara Star akan memakai scope dan ketentuan ini sebagai acuan operasional.</p>;
  if (status === "declined") return <p className="mt-6 border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-800">Respons sudah tercatat: Work Order belum dapat diterima. Tim Nusantara Star akan meninjau catatan Anda.</p>;
  if (status !== "pending_confirmation") return <p className="mt-6 border border-black/10 p-4 text-sm font-semibold">Work Order ini tidak lagi menunggu konfirmasi.</p>;

  return <div className="mt-6 border-t border-black/10 pt-5"><label className="text-xs font-semibold text-black/55">Catatan respons <span className="font-normal">(wajib jika belum dapat menerima)</span><textarea value={note} onChange={(event) => setNote(event.target.value)} rows={3} className="mt-2 w-full border border-black/15 p-3 text-sm font-normal text-black" /></label><div className="mt-3 flex flex-wrap gap-3"><button disabled={busy || !note.trim()} onClick={() => respond("decline")} className="border border-black/20 px-4 py-2.5 text-sm font-semibold disabled:opacity-40">Belum Dapat Menerima</button><button disabled={busy} onClick={() => respond("confirm")} className="border border-black bg-black px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40">{busy ? "Menyimpan…" : "Konfirmasi Work Order"}</button></div>{error ? <p className="mt-3 text-sm font-semibold text-red-700">{error}</p> : null}</div>;
}
