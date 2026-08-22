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

type Payment = {
  id: string;
  payment_type: string | null;
  amount: number;
  provider: string | null;
  provider_reference: string | null;
  status: string;
  paid_at: string | null;
  created_at: string;
};

function money(value: number | null) {
  if (value == null) return "—";
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(value);
}

export function AdminBookingActions({
  briefId,
  talentName,
  booking,
  payments,
}: {
  briefId: string;
  talentName: string;
  booking: Booking;
  payments: Payment[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<"booking" | "deposit" | "balance" | "paid" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function post(body: Record<string, string>) {
    const response = await fetch(body.action === "create_booking" ? "/api/internal-demo/admin/booking" : "/api/internal-demo/admin/payment", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body.action === "create_booking" ? { briefId } : body),
    });
    const result = await response.json().catch(() => null);
    if (!response.ok) throw new Error(result?.detail ?? result?.error ?? "Aksi gagal");
    router.refresh();
  }

  async function createPendingBooking() {
    setBusy("booking");
    setError(null);
    try {
      await post({ action: "create_booking" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal membuat booking");
    } finally {
      setBusy(null);
    }
  }

  async function createDeposit() {
    if (!booking) return;
    setBusy("deposit");
    setError(null);
    try {
      await post({ action: "create_deposit", bookingId: booking.id });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal membuat payment DP");
    } finally {
      setBusy(null);
    }
  }

  async function createBalance() {
    if (!booking) return;
    setBusy("balance");
    setError(null);
    try {
      await post({ action: "create_balance", bookingId: booking.id });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal membuat pelunasan buyer");
    } finally {
      setBusy(null);
    }
  }

  async function markPaid(paymentId: string) {
    if (!booking) return;
    setBusy("paid");
    setError(null);
    try {
      await post({ action: "mark_paid", bookingId: booking.id, paymentId });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal mengonfirmasi pembayaran");
    } finally {
      setBusy(null);
    }
  }

  const deposit = payments.find((payment) => ["buyer_deposit", "buyer_full_payment"].includes(payment.payment_type ?? "") && ["pending", "paid"].includes(payment.status));
  const balance = payments.find((payment) => payment.payment_type === "buyer_balance" && ["pending", "paid"].includes(payment.status));
  const paidBuyerTotal = payments
    .filter((payment) => ["buyer_deposit", "buyer_balance", "buyer_full_payment"].includes(payment.payment_type ?? "") && payment.status === "paid")
    .reduce((sum, payment) => sum + Number(payment.amount ?? 0), 0);
  const remaining = Math.max(0, Number(booking?.buyer_price ?? 0) - paidBuyerTotal);

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
        <>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="border border-black/10 p-3 text-sm"><span className="text-black/45">Booking ID</span><br /><span className="break-all">{booking.id}</span></div>
            <div className="border border-black/10 p-3 text-sm"><span className="text-black/45">Tanggal</span><br />{booking.event_date}</div>
            <div className="border border-black/10 p-3 text-sm"><span className="text-black/45">Harga Buyer</span><br />{money(booking.buyer_price)}</div>
            <div className="border border-black/10 p-3 text-sm"><span className="text-black/45">Talent Payable</span><br />{money(booking.talent_payable)}</div>
          </div>

          <div className="mt-5 border-t border-black/10 pt-5">
            <p className="text-sm font-semibold">Buyer Payment</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <div className="border border-black/10 p-3 text-sm"><span className="text-black/45">Sudah Dibayar</span><br />{money(paidBuyerTotal)}</div>
              <div className="border border-black/10 p-3 text-sm"><span className="text-black/45">Sisa</span><br />{money(remaining)}</div>
              <div className="border border-black/10 p-3 text-sm"><span className="text-black/45">Status Booking</span><br />{booking.status}</div>
            </div>

            {!deposit && booking.status === "pending" ? (
              <div className="mt-3">
                <p className="text-sm text-black/60">Locked terms: 50% saat konfirmasi. Untuk booking ini DP = {money((booking.buyer_price ?? 0) / 2)}.</p>
                <button type="button" onClick={createDeposit} disabled={busy !== null} className="mt-3 border border-black bg-black px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">
                  {busy === "deposit" ? "Membuat…" : "Buat Payment DP Pending"}
                </button>
              </div>
            ) : null}

            {deposit ? (
              <div className="mt-3 border border-black/10 bg-[#f5f3ee] p-4">
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="text-sm"><span className="text-black/45">Tipe</span><br />{deposit.payment_type}</div>
                  <div className="text-sm"><span className="text-black/45">Jumlah</span><br />{money(deposit.amount)}</div>
                  <div className="text-sm"><span className="text-black/45">Status</span><br />{deposit.status}</div>
                </div>
                {deposit.status === "pending" && booking.status === "pending" ? (
                  <button type="button" onClick={() => markPaid(deposit.id)} disabled={busy !== null} className="mt-4 border border-black bg-black px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">
                    {busy === "paid" ? "Mengonfirmasi…" : "Tandai DP Sudah Dibayar"}
                  </button>
                ) : null}
                {deposit.status === "paid" ? <p className="mt-4 text-sm font-semibold">✓ DP tercatat.</p> : null}
              </div>
            ) : null}

            {booking.status === "confirmed" && remaining > 0 && !balance ? (
              <div className="mt-4 border border-black/10 p-4">
                <p className="text-sm text-black/60">Sisa pembayaran buyer: <strong>{money(remaining)}</strong>.</p>
                <button type="button" onClick={createBalance} disabled={busy !== null} className="mt-3 border border-black bg-black px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">
                  {busy === "balance" ? "Membuat…" : "Buat Payment Pelunasan Pending"}
                </button>
              </div>
            ) : null}

            {balance ? (
              <div className="mt-4 border border-black/10 bg-[#f5f3ee] p-4">
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="text-sm"><span className="text-black/45">Tipe</span><br />buyer_balance</div>
                  <div className="text-sm"><span className="text-black/45">Jumlah</span><br />{money(balance.amount)}</div>
                  <div className="text-sm"><span className="text-black/45">Status</span><br />{balance.status}</div>
                </div>
                {balance.status === "pending" && booking.status === "confirmed" ? (
                  <button type="button" onClick={() => markPaid(balance.id)} disabled={busy !== null} className="mt-4 border border-black bg-black px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">
                    {busy === "paid" ? "Mengonfirmasi…" : "Tandai Pelunasan Sudah Dibayar"}
                  </button>
                ) : null}
                {balance.status === "paid" ? <p className="mt-4 text-sm font-semibold">✓ Buyer lunas. Booking tetap confirmed sampai acara selesai.</p> : null}
              </div>
            ) : null}
          </div>
        </>
      ) : (
        <div className="mt-5">
          <p className="text-sm leading-6 text-black/60">Status awal akan <strong>pending</strong>. Ini belum berarti booking confirmed dan belum memicu invoice atau pembayaran.</p>
          <button
            type="button"
            onClick={createPendingBooking}
            disabled={busy !== null}
            className="mt-4 border border-black bg-black px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
          >
            {busy === "booking" ? "Membuat…" : "Buat Booking Pending"}
          </button>
        </div>
      )}
      {error ? <p className="mt-3 text-xs font-semibold text-red-700">{error}</p> : null}
    </section>
  );
}
