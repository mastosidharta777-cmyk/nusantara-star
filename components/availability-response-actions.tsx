"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type ResponseStatus = "confirmed" | "unavailable";
type ExistingOffer = {
  availability_status: string;
  event_fee: number | null;
  included_costs: string | null;
  excluded_costs: string | null;
  payment_terms: string | null;
  rider_exceptions: string | null;
  quote_valid_until: string | null;
} | null;
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
  if (offerStatus === "confirmed" || offerStatus === "unavailable") return offerStatus;
  if (currentStatus === "confirmed" || currentStatus === "unavailable") return currentStatus;
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
      setError("Pilih apakah talent tersedia untuk acara ini.");
      return;
    }
    if (status === "confirmed" && (!eventFee || Number(eventFee) <= 0)) {
      setError("Fee acara wajib diisi jika talent tersedia.");
      return;
    }
    if (status === "confirmed" && !quoteValidUntil) {
      setError("Batas berlaku penawaran wajib diisi jika talent tersedia.");
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
          eventFee: status === "confirmed" && eventFee ? Number(eventFee) : null,
          paymentTerms: status === "confirmed" && paymentTerms ? paymentTerms : null,
          includedCosts: status === "confirmed" && includedCosts ? includedCosts : null,
          excludedCosts: status === "confirmed" && excludedCosts ? excludedCosts : null,
          riderExceptions: status === "confirmed" && riderExceptions ? riderExceptions : null,
          quoteValidUntil: status === "confirmed" && quoteValidUntil ? new Date(quoteValidUntil).toISOString() : null,
          accessToken,
        }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.detail ?? body?.error ?? "Gagal menyimpan jawaban");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menyimpan jawaban");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-6 border-t border-black/10 pt-5">
      <p className="text-base font-semibold">Apakah talent tersedia untuk acara ini?</p>
      <p className="mt-1 text-xs leading-5 text-black/50">Pilih setelah jadwal benar-benar dipastikan. Jika belum pasti, tidak perlu menjawab dulu.</p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => setStatus("confirmed")}
          className={`border px-4 py-4 text-left text-sm font-semibold ${status === "confirmed" ? "border-black bg-black text-white" : "border-black/15 bg-white"}`}
        >
          Tersedia
          <span className={`mt-1 block text-xs font-normal ${status === "confirmed" ? "text-white/70" : "text-black/45"}`}>Jadwal sudah dipastikan dan siap memberikan penawaran.</span>
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => setStatus("unavailable")}
          className={`border px-4 py-4 text-left text-sm font-semibold ${status === "unavailable" ? "border-black bg-black text-white" : "border-black/15 bg-white"}`}
        >
          Tidak tersedia
          <span className={`mt-1 block text-xs font-normal ${status === "unavailable" ? "text-white/70" : "text-black/45"}`}>Talent tidak dapat tampil untuk acara/tanggal ini.</span>
        </button>
      </div>

      {status === "confirmed" ? (
        <div className="mt-5 grid gap-4 border-t border-black/10 pt-5">
          <p className="text-sm font-semibold">Penawaran untuk acara ini</p>
          <label className="text-sm">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.1em] text-black/45">Fee Acara (Rp) *</span>
            <input type="number" min="1" value={eventFee} onChange={(e) => setEventFee(e.target.value)} className="w-full border border-black/20 px-3 py-2" />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.1em] text-black/45">Ketentuan Pembayaran</span>
            <textarea value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)} className="min-h-20 w-full border border-black/20 px-3 py-2" />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm"><span className="mb-1 block text-xs font-semibold uppercase tracking-[0.1em] text-black/45">Termasuk</span><textarea value={includedCosts} onChange={(e) => setIncludedCosts(e.target.value)} className="min-h-20 w-full border border-black/20 px-3 py-2" /></label>
            <label className="text-sm"><span className="mb-1 block text-xs font-semibold uppercase tracking-[0.1em] text-black/45">Tidak Termasuk</span><textarea value={excludedCosts} onChange={(e) => setExcludedCosts(e.target.value)} className="min-h-20 w-full border border-black/20 px-3 py-2" /></label>
          </div>
          <label className="text-sm"><span className="mb-1 block text-xs font-semibold uppercase tracking-[0.1em] text-black/45">Perubahan / Pengecualian Rider</span><textarea value={riderExceptions} onChange={(e) => setRiderExceptions(e.target.value)} className="min-h-20 w-full border border-black/20 px-3 py-2" /></label>
          <label className="text-sm">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.1em] text-black/45">Penawaran Berlaku Sampai *</span>
            <input type="datetime-local" value={quoteValidUntil} onChange={(e) => setQuoteValidUntil(e.target.value)} className="w-full border border-black/20 px-3 py-2" />
          </label>
        </div>
      ) : null}

      <button type="button" onClick={submit} disabled={busy || !status} className="mt-5 border border-black bg-black px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-40">
        {busy ? "Menyimpan…" : status === "confirmed" ? (existingOffer ? "Perbarui Jawaban & Penawaran" : "Kirim Jawaban & Penawaran") : "Kirim Jawaban"}
      </button>
      <p className="mt-2 text-xs text-black/45">“Tersedia” adalah konfirmasi availability dan penawaran untuk event ini. Ini belum berarti booking final.</p>
      {error ? <p className="mt-3 text-xs font-semibold text-red-700">{error}</p> : null}
    </div>
  );
}
