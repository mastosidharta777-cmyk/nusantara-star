"use client";

import { useState } from "react";

export function BuyerTermsAcceptance({ bookingId, accessToken, accepted, disabled }: { bookingId: string; accessToken: string; accepted: boolean; disabled: boolean }) {
  const [checked, setChecked] = useState(false);
  const [done, setDone] = useState(accepted);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function acceptTerms() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/buyer/accept-terms", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ bookingId, accessToken }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error ?? "Persetujuan tidak dapat disimpan");
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Persetujuan tidak dapat disimpan");
    } finally {
      setBusy(false);
    }
  }

  if (done) return <div className="border border-black bg-white p-5 text-sm font-semibold">Ketentuan telah Anda setujui dan tercatat.</div>;

  return (
    <div className="border border-black/10 bg-white p-5 md:p-6">
      <label className="flex items-start gap-3 text-sm leading-6">
        <input type="checkbox" checked={checked} onChange={(event) => setChecked(event.target.checked)} disabled={disabled || busy} className="mt-1" />
        <span>Saya telah membaca ringkasan komersial, jadwal pembayaran, ketentuan pembatalan, serta catatan yang ditampilkan di halaman ini dan menyetujuinya untuk booking ini.</span>
      </label>
      <button type="button" onClick={acceptTerms} disabled={disabled || busy || !checked} className="mt-5 w-full bg-black px-5 py-3 text-sm font-semibold text-white disabled:opacity-40">
        {busy ? "Menyimpan persetujuan…" : "Setujui ketentuan"}
      </button>
      {disabled ? <p className="mt-3 text-xs text-black/50">Ketentuan belum dapat disetujui. Tim Nusantara Star perlu melengkapi atau mengonfirmasi ulang data komersial.</p> : null}
      {error ? <p className="mt-3 text-xs font-semibold text-red-700">{error}</p> : null}
    </div>
  );
}
