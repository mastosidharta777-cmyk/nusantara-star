"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type ResponseStatus = "confirmed" | "tentative" | "unavailable";

type ExistingOffer = {
  availability_status: string;
  event_fee: number | null;
  included_costs: string | null;
  excluded_costs: string | null;
  payment_terms: string | null;
  rider_exceptions: string | null;
  quote_valid_until: string | null;
} | null;

type Props = {
  requestId: string;
  currentStatus: string;
  existingOffer: ExistingOffer;
};

function toLocalDateTime(value: string | null | undefined) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function AvailabilityResponseActions({ requestId, currentStatus, existingOffer }: Props) {
  const router = useRouter();
  const [status, setStatus] = useState<ResponseStatus>(
    existingOffer?.availability_status === "tentative" || existingOffer?.availability_status === "unavailable"
      ? existingOffer.availability_status
      : currentStatus === "tentative" || currentStatus === "unavailable"
        ? currentStatus
        : "confirmed",
  );
  const [eventFee, setEventFee] = useState(existingOffer?.event_fee ? String(existingOffer.event_fee) : "");
  const [paymentTerms, setPaymentTerms] = useState(existingOffer?.payment_terms ?? "");
  const [includedCosts, setIncludedCosts] = useState(existingOffer?.included_costs ?? "");
  const [excludedCosts, setExcludedCosts] = useState(existingOffer?.excluded_costs ?? "");
  const [riderExceptions, setRiderExceptions] = useState(existingOffer?.rider_exceptions ?? "");
  const [quoteValidUntil, setQuoteValidUntil] = useState(toLocalDateTime(existingOffer?.quote_valid_until));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
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
        }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.detail ?? body?.error ?? "Response failed");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Response failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-6 border-t border-black/10 pt-5">
      <p className="text-sm font-semibold">Talent Offer</p>
      <p className="mt-1 text-xs text-black/45">Konfirmasi availability sekaligus commercial offer untuk event ini.</p>

      <div className="mt-4 grid gap-4">
        <label className="text-sm">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.1em] text-black/45">Availability</span>
          <select value={status} onChange={(e) => setStatus(e.target.value as ResponseStatus)} className="w-full border border-black/20 bg-white px-3 py-2">
            <option value="confirmed">Confirmed</option>
            <option value="tentative">Tentative</option>
            <option value="unavailable">Unavailable</option>
          </select>
        </label>

        {status !== "unavailable" ? (
          <>
            <label className="text-sm">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.1em] text-black/45">Event Fee (IDR)</span>
              <input type="number" min="0" value={eventFee} onChange={(e) => setEventFee(e.target.value)} className="w-full border border-black/20 px-3 py-2" placeholder="contoh 15000000" />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.1em] text-black/45">Payment Terms</span>
              <textarea value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)} className="min-h-20 w-full border border-black/20 px-3 py-2" placeholder="Contoh: 50% saat confirmed, 50% H-1" />
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="text-sm">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.1em] text-black/45">Included</span>
                <textarea value={includedCosts} onChange={(e) => setIncludedCosts(e.target.value)} className="min-h-20 w-full border border-black/20 px-3 py-2" />
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.1em] text-black/45">Excluded</span>
                <textarea value={excludedCosts} onChange={(e) => setExcludedCosts(e.target.value)} className="min-h-20 w-full border border-black/20 px-3 py-2" />
              </label>
            </div>
            <label className="text-sm">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.1em] text-black/45">Rider / Exceptions</span>
              <textarea value={riderExceptions} onChange={(e) => setRiderExceptions(e.target.value)} className="min-h-20 w-full border border-black/20 px-3 py-2" />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.1em] text-black/45">Quote Valid Until</span>
              <input type="datetime-local" value={quoteValidUntil} onChange={(e) => setQuoteValidUntil(e.target.value)} className="w-full border border-black/20 px-3 py-2" />
            </label>
          </>
        ) : null}
      </div>

      <button type="button" onClick={submit} disabled={busy} className="mt-5 border border-black bg-black px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-40">
        {busy ? "Saving…" : existingOffer ? "Update Offer" : "Submit Offer"}
      </button>
      {error ? <p className="mt-3 text-xs font-semibold text-red-700">{error}</p> : null}
    </div>
  );
}
