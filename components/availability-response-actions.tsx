"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type ResponseStatus = "confirmed" | "tentative" | "unavailable";
type ExistingOffer = { availability_status: string; event_fee: number | null; included_costs: string | null; excluded_costs: string | null; payment_terms: string | null; rider_exceptions: string | null; quote_valid_until: string | null } | null;
type Props = { requestId: string; currentStatus: string; existingOffer: ExistingOffer; accessToken?: string | null };

function toLocalDateTime(value: string | null | undefined) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function initialStatus(currentStatus: string, existingOffer: ExistingOffer): ResponseStatus | "" {
  const offerStatus = existingOffer?.availability_status;
  if (offerStatus === "confirmed" || offerStatus === "tentative" || offerStatus === "unavailable") return offerStatus;
  if (currentStatus === "confirmed" || currentStatus === "tentative" || currentStatus === "unavailable") return currentStatus;
  return "";
}

export function AvailabilityResponseActions({ requestId, currentStatus, existingOffer, accessToken }: Props) {
  const router = useRouter();
  const [status, setStatus] = useState<ResponseStatus | "">(initialStatus(currentStatus, existingOffer));
  const [eventFee, setEventFee] = useState(existingOffer?.event_fee ? String(existingOffer.event_fee) : "");
  const [paymentTerms, setPaymentTerms] = useState(existingOffer?.payment_terms ?? "");
  const [includedCosts, setIncludedCosts] = useState(existingOffer?.included_costs ?? "");
  const [excludedCosts, setExcludedCosts] = useState(existingOffer?.excluded_costs ?? "");
  const [riderExceptions, setRiderExceptions] = useState(existingOffer?.rider_exceptions ?? "");
  const [quoteValidUntil, setQuoteValidUntil] = useState(toLocalDateTime(existingOffer?.quote_valid_until));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    if (!status) {
      setError("Pilih status ketersediaan terlebih dahulu.");
      return;
    }
    if (status === "confirmed" && (!eventFee || Number(eventFee) <= 0)) {
      setError("Fee acara wajib diisi untuk status terkonfirmasi.");
      return;
    }
    if (status === "confirmed" && !quoteValidUntil) {
      setError("Masa berlaku penawaran wajib diisi untuk status terkonfirmasi.");
      return;
    }

    setBusy(true);
    try {
      const response = await fetch("/api/internal-demo/availability-response", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          requestId,
          status,
          eventFee: eventFee ? Number(eventFee) : null,
          paymentTerms: paymentTerms || null,
          includedCosts: includedCosts || null,
          excludedCosts: excludedCosts || null,
          riderExceptions: riderExceptions || null,
          quoteValidUntil: quoteValidUntil ? new Date(quoteValidUntil).toISOString() : null,
          accessToken,
        }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.detail ?? body?.error ?? "Gagal menyimpan penawaran");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menyimpan penawaran");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-6 border-t border-black/10 pt-5">
      <p className="text-sm font-semibold">Konfirmasi Talent</p>
      <p className="mt-1 text-xs text-black/45">Periksa scope acara di atas, lalu pilih status secara sengaja. Sistem tidak menganggap talent tersedia sampai respons ini dikirim.</p>
      <div className="mt-4 grid gap-4">
        <label className="text-sm">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.1em] text-black/45">Ketersediaan</span>
          <select value={status} onChange={(e) => setStatus(e.target.value as ResponseStatus | "")} className="w-full border border-black/20 bg-white px-3 py-2">
            <option value="">Pilih status…</option>
            <option value="confirmed">Terkonfirmasi</option>
            <option value="tentative">Sementara</option>
            <option value="unavailable">Tidak tersedia</option>
          </select>
        </label>
        {status && status !== "unavailable" ? (
          <>
            <label className="text-sm">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.1em] text-black/45">Fee Acara (Rp){status === "confirmed" ? " *" : ""}</span>
              <input type="number" min="0" value={eventFee} onChange={(e) => setEventFee(e.target.value)} className="w-full border border-black/20 px-3 py-2" />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.1em] text-black/45">Ketentuan Pembayaran</span>
              <textarea value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)} className="min-h-20 w-full border border-black/20 px-3 py-2" />
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="text-sm"><span className="mb-1 block text-xs font-semibold uppercase tracking-[0.1em] text-black/45">Termasuk</span><textarea value={includedCosts} onChange={(e) => setIncludedCosts(e.target.value)} className="min-h-20 w-full border border-black/20 px-3 py-2" /></label>
              <label className="text-sm"><span className="mb-1 block text-xs font-semibold uppercase tracking-[0.1em] text-black/45">Tidak Termasuk</span><textarea value={excludedCosts} onChange={(e) => setExcludedCosts(e.target.value)} className="min-h-20 w-full border border-black/20 px-3 py-2" /></label>
            </div>
            <label className="text-sm"><span className="mb-1 block text-xs font-semibold uppercase tracking-[0.1em] text-black/45">Catatan / Pengecualian Rider</span><textarea value={riderExceptions} onChange={(e) => setRiderExceptions(e.target.value)} className="min-h-20 w-full border border-black/20 px-3 py-2" /></label>
            <label className="text-sm">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.1em] text-black/45">Penawaran Berlaku Sampai{status === "confirmed" ? " *" : ""}</span>
              <input type="datetime-local" value={quoteValidUntil} onChange={(e) => setQuoteValidUntil(e.target.value)} className="w-full border border-black/20 px-3 py-2" />
            </label>
          </>
        ) : null}
      </div>
      <button type="button" onClick={submit} disabled={busy || !status} className="mt-5 border border-black bg-black px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-40">{busy ? "Menyimpan…" : existingOffer ? "Perbarui Penawaran" : "Kirim Respons"}</button>
      {error ? <p className="mt-3 text-xs font-semibold text-red-700">{error}</p> : null}
    </div>
  );
}
