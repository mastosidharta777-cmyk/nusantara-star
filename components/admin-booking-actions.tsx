"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Booking = {
  id: string;
  status: string;
  event_date: string;
  venue: string | null;
  city: string | null;
  buyer_price: number | null;
  talent_payable: number | null;
  direct_cost: number | null;
} | null;

function money(value: number | null) {
  if (value == null) return "—";
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(value);
}

export function AdminBookingActions({ briefId, talentName, booking }: { briefId: string; talentName: string; booking: Booking }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function createPendingBooking() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/internal-demo/admin/booking", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ briefId }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.detail ?? body?.error ?? "Gagal membuat booking");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal membuat booking");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-7 border border-black/10 bg-white p-5 md:p-6">
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-sm font-semibold">Booking Record</p>
          <p className="mt-1 text-xs text-black/45">Talent: {talentName}. Booking dibuat dari commercial terms yang sudah dikunci.</p>
        </div>
        {booking ? (
          <span className="w-fit border border-black/10 bg-[#f5f3ee] px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em]">
            {booking.status}
          </span>
        ) : null}
      </div>

      {booking ? (
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="border border-black/10 p-3 text-sm"><span className="text-black/45">Booking ID</span><br /><span className="break-all">{booking.id}</span></div>
          <div className="border border-black/10 p-3 text-sm"><span className="text-black/45">Tanggal</span><br />{booking.event_date}</div>
          <div className="border border-black/10 p-3 text-sm"><span className="text-black/45">Harga Buyer</span><br />{money(booking.buyer_price)}</div>
          <div className="border border-black/10 p-3 text-sm"><span className="text-black/45">Talent Payable</span><br />{money(booking.talent_payable)}</div>
        </div>
      ) : (
        <div className="mt-5">
          <p className="text-sm leading-6 text-black/60">Status awal akan <strong>pending</strong>. Ini belum berarti booking confirmed dan belum memicu invoice atau pembayaran.</p>
          <button
            type="button"
            onClick={createPendingBooking}
            disabled={busy}
            className="mt-4 border border-black bg-black px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
          >
            {busy ? "Membuat…" : "Buat Booking Pending"}
          </button>
        </div>
      )}
      {error ? <p className="mt-3 text-xs font-semibold text-red-700">{error}</p> : null}
    </section>
  );
}
