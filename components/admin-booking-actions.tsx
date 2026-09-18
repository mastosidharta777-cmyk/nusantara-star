"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { SecureAccessLinkButton } from "@/components/secure-access-link-button";
import { bookingStatusLabel } from "@/lib/ui-language";

type Booking = {
  id: string;
  status: string;
  event_date: string;
  buyer_price: number | null;
  buyer_terms_accepted_at?: string | null;
  buyer_terms_snapshot?: Record<string, unknown> | null;
  buyer_terms_accepted_snapshot?: Record<string, unknown> | null;
  financial_security_status?: string;
  financial_security_reference?: string | null;
} | null;

type Payment = {
  id: string;
  payment_milestone_id?: string | null;
  payment_type: string | null;
  amount: number;
  currency?: string;
  status: string;
  paid_at: string | null;
  provider?: string | null;
  provider_reference?: string | null;
  request_reference?: string | null;
  request_issued_at?: string | null;
  request_due_date?: string | null;
  payment_instructions_snapshot?: Record<string, unknown> | null;
};

const BUYER_PAYMENT_TYPES = new Set(["buyer_deposit", "buyer_balance", "buyer_full_payment"]);

const money = (value: number | null) =>
  value == null
    ? "—"
    : new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value);

function dueLabel(value?: string | null) {
  if (!value) return "—";
  const date = new Date(`${value}T00:00:00+07:00`);
  if (!Number.isFinite(date.getTime())) return value;
  return new Intl.DateTimeFormat("id-ID", { dateStyle: "long", timeZone: "Asia/Jakarta" }).format(date);
}

function paymentTypeLabel(value: string | null) {
  if (value === "buyer_deposit") return "DP / biaya booking";
  if (value === "buyer_balance") return "Pelunasan / pembayaran berikutnya";
  if (value === "buyer_full_payment") return "Pembayaran penuh";
  return "Pembayaran";
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
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [securityType, setSecurityType] = useState("approved_po_credit");
  const [reference, setReference] = useState("");

  const [paymentProvider, setPaymentProvider] = useState("");
  const [paymentReference, setPaymentReference] = useState("");

  const [paymentMethod, setPaymentMethod] = useState("bank_transfer");
  const [providerName, setProviderName] = useState("");
  const [destination, setDestination] = useState("");
  const [accountName, setAccountName] = useState("");
  const [instructionNotes, setInstructionNotes] = useState("");

  async function bookingAction(action: string, extra: Record<string, string> = {}) {
    setBusy(action);
    setError(null);
    try {
      const response = await fetch("/api/internal-demo/admin/booking", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ briefId, action, ...extra }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.detail ?? body?.error ?? "Aksi booking gagal");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Aksi booking gagal");
    } finally {
      setBusy(null);
    }
  }

  async function paymentAction(action: string, paymentId?: string, extra: Record<string, string> = {}) {
    if (!booking) return;
    setBusy(action);
    setError(null);
    try {
      const response = await fetch("/api/internal-demo/admin/payment", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ bookingId: booking.id, action, paymentId, ...extra }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.detail ?? body?.error ?? "Aksi pembayaran gagal");
      if (action === "mark_paid") {
        setPaymentProvider("");
        setPaymentReference("");
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Aksi pembayaran gagal");
    } finally {
      setBusy(null);
    }
  }

  const termsAccepted = Boolean(
    booking?.buyer_terms_accepted_at
      && booking.buyer_terms_snapshot
      && JSON.stringify(booking.buyer_terms_accepted_snapshot ?? null) === JSON.stringify(booking.buyer_terms_snapshot),
  );

  const buyerPayments = payments.filter((payment) => BUYER_PAYMENT_TYPES.has(payment.payment_type ?? ""));
  const paidTotal = buyerPayments
    .filter((payment) => payment.status === "paid" && Boolean(payment.provider?.trim()) && Boolean(payment.provider_reference?.trim()))
    .reduce((sum, payment) => sum + Number(payment.amount ?? 0), 0);
  const pendingPayment = buyerPayments.find((payment) => payment.status === "pending");
  const fullyPaid = Boolean(booking?.buyer_price && paidTotal >= Number(booking.buyer_price));
  const requestFormReady = Boolean(providerName.trim() && destination.trim());

  const requestForm = booking ? (
    <div className="mt-4 border border-black/10 bg-[#f5f3ee] p-4">
      <p className="text-sm font-semibold">Terbitkan Payment Request berikutnya</p>
      <p className="mt-1 text-xs leading-5 text-black/45">
        Nominal dan jatuh tempo diambil otomatis dari milestone Deal yang sudah dikunci. Admin hanya menentukan tujuan pembayaran.
      </p>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <label className="text-xs font-semibold">
          Metode
          <select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)} className="mt-1 w-full border border-black/15 bg-white p-2 text-sm font-normal">
            <option value="bank_transfer">Transfer bank</option>
            <option value="payment_link">Payment link / VA</option>
            <option value="other">Metode lain</option>
          </select>
        </label>
        <label className="text-xs font-semibold">
          Bank / provider
          <input value={providerName} onChange={(event) => setProviderName(event.target.value)} placeholder="Contoh: BCA / Xendit / Bank Mandiri" className="mt-1 w-full border border-black/15 bg-white p-2 text-sm font-normal" />
        </label>
        <label className="text-xs font-semibold">
          Tujuan pembayaran
          <input value={destination} onChange={(event) => setDestination(event.target.value)} placeholder={paymentMethod === "payment_link" ? "Payment URL / Virtual Account" : "Nomor rekening / Virtual Account"} className="mt-1 w-full border border-black/15 bg-white p-2 text-sm font-normal" />
        </label>
        <label className="text-xs font-semibold">
          Nama penerima <span className="font-normal text-black/40">(opsional)</span>
          <input value={accountName} onChange={(event) => setAccountName(event.target.value)} placeholder="Nama rekening / merchant" className="mt-1 w-full border border-black/15 bg-white p-2 text-sm font-normal" />
        </label>
      </div>
      <label className="mt-3 block text-xs font-semibold">
        Catatan pembayaran <span className="font-normal text-black/40">(opsional)</span>
        <textarea value={instructionNotes} onChange={(event) => setInstructionNotes(event.target.value)} rows={2} placeholder="Contoh: cantumkan reference Payment Request pada berita transfer." className="mt-1 w-full border border-black/15 bg-white p-2 text-sm font-normal" />
      </label>
      <button
        type="button"
        onClick={() => paymentAction("create_next_buyer_payment", undefined, {
          paymentMethod,
          providerName: providerName.trim(),
          destination: destination.trim(),
          accountName: accountName.trim(),
          instructionNotes: instructionNotes.trim(),
        })}
        disabled={busy !== null || !requestFormReady}
        className="mt-4 bg-black px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
      >
        {busy === "create_next_buyer_payment" ? "Menerbitkan…" : "Terbitkan Payment Request"}
      </button>
    </div>
  ) : null;

  const pendingRequestCard = pendingPayment ? (
    <div className="mt-4 border border-black/10 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-semibold">{paymentTypeLabel(pendingPayment.payment_type)} · {money(pendingPayment.amount)}</p>
          <p className="mt-1 text-xs text-black/45">Reference: {pendingPayment.request_reference ?? "—"} · Jatuh tempo: {dueLabel(pendingPayment.request_due_date)}</p>
        </div>
        <span className="w-fit border border-black/15 px-2 py-1 text-xs font-semibold uppercase">Menunggu pembayaran</span>
      </div>
      <div className="mt-4">
        <SecureAccessLinkButton scope="buyer_payment" subjectId={pendingPayment.id} label="Buat link Payment Request buyer" delivery="copy" />
      </div>
      <div className="mt-5 border-t border-black/10 pt-4">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-black/45">Verifikasi uang masuk</p>
        <p className="mt-1 text-xs leading-5 text-black/45">
          Isi hanya setelah transaksi benar-benar terlihat pada bank/provider. Bukti transfer dari buyer saja tidak mengubah status menjadi paid.
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <input value={paymentProvider} onChange={(event) => setPaymentProvider(event.target.value)} placeholder="Bank / provider penerima" className="border border-black/15 p-2 text-sm" />
          <input value={paymentReference} onChange={(event) => setPaymentReference(event.target.value)} placeholder="Referensi transaksi aktual" className="border border-black/15 p-2 text-sm" />
        </div>
        <button
          type="button"
          onClick={() => paymentAction("mark_paid", pendingPayment.id, { provider: paymentProvider.trim(), providerReference: paymentReference.trim() })}
          disabled={busy !== null || !paymentProvider.trim() || !paymentReference.trim()}
          className="mt-3 bg-black px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
        >
          {busy === "mark_paid" ? "Memverifikasi…" : "Verifikasi pembayaran masuk"}
        </button>
      </div>
    </div>
  ) : null;

  return (
    <section className="mt-7 border border-black/10 bg-white p-5 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">Booking & Pembayaran</p>
          <p className="mt-1 text-xs text-black/45">Talent: {talentName}. Talent dipilih belum berarti booking final.</p>
        </div>
        {booking ? <span className="border border-black/15 px-3 py-2 text-xs font-semibold uppercase">{bookingStatusLabel(booking.status)}</span> : null}
      </div>

      {!booking ? (
        <div className="mt-5">
          <p className="text-sm text-black/60">Buat booking dengan status menunggu persetujuan terms dan jaminan pembayaran. Belum terjamin.</p>
          <button type="button" onClick={() => bookingAction("create_booking")} disabled={busy !== null} className="mt-3 bg-black px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">
            {busy ? "Memproses…" : "Buat booking menunggu jaminan"}
          </button>
        </div>
      ) : (
        <>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="border border-black/10 p-3 text-sm"><span className="text-black/45">Harga ke klien</span><br />{money(booking.buyer_price)}</div>
            <div className="border border-black/10 p-3 text-sm"><span className="text-black/45">Ketentuan klien</span><br />{termsAccepted ? "Disetujui buyer" : "Belum disetujui buyer"}</div>
            <div className="border border-black/10 p-3 text-sm"><span className="text-black/45">Jaminan pembayaran</span><br />{booking.financial_security_status ?? (booking.status === "secured" ? "Terpenuhi" : "Menunggu")}</div>
            <div className="border border-black/10 p-3 text-sm"><span className="text-black/45">Pembayaran terverifikasi</span><br />{money(paidTotal)}</div>
          </div>

          {booking.status === "pending_security" && !termsAccepted ? (
            <div className="mt-4 border border-black/10 p-4">
              <p className="text-sm font-semibold">Persetujuan ketentuan oleh buyer</p>
              <p className="mt-1 text-xs leading-5 text-black/45">Admin tidak dapat menyetujui atas nama buyer. Kirim secure link; tahap pembayaran baru dibuka setelah snapshot terms diterima buyer.</p>
              <div className="mt-3"><SecureAccessLinkButton scope="buyer_terms" subjectId={booking.id} label="Buat link persetujuan buyer" delivery="copy" /></div>
            </div>
          ) : null}

          {booking.status === "pending_security" && termsAccepted ? (
            <div className="mt-5 border-t border-black/10 pt-5">
              <p className="text-sm font-semibold">Jaminan Booking</p>
              <p className="mt-1 text-xs leading-5 text-black/45">Tidak ada DP universal. Nilai security mengikuti milestone pertama yang dikunci di Deal Sheet.</p>

              {pendingRequestCard}
              {!pendingPayment && paidTotal === 0 && booking.financial_security_status !== "satisfied" ? requestForm : null}

              {!pendingPayment && paidTotal === 0 && booking.financial_security_status !== "satisfied" ? (
                <div className="mt-4 border border-black/10 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-black/45">Alternatif tanpa transfer awal</p>
                  <p className="mt-1 text-xs leading-5 text-black/45">Gunakan hanya jika memang ada PO/kredit yang disetujui atau pengecualian komersial yang berwenang.</p>
                  <div className="mt-3 grid gap-2 md:grid-cols-[220px_1fr_auto]">
                    <select value={securityType} onChange={(event) => setSecurityType(event.target.value)} className="border border-black/15 p-2 text-sm">
                      <option value="approved_po_credit">PO/Kredit disetujui</option>
                      <option value="authorized_exception">Pengecualian berwenang</option>
                    </select>
                    <input value={reference} onChange={(event) => setReference(event.target.value)} placeholder="Referensi PO / otorisasi pengecualian" className="border border-black/15 p-2 text-sm" />
                    <button type="button" onClick={() => bookingAction("set_security", { securityType, reference: reference.trim() })} disabled={busy !== null || !reference.trim()} className="border border-black px-4 py-2 text-sm font-semibold disabled:opacity-40">Simpan jaminan</button>
                  </div>
                </div>
              ) : null}

              {!pendingPayment && (paidTotal > 0 || booking.financial_security_status === "satisfied") ? (
                <div className="mt-4 border border-emerald-700/20 bg-emerald-50 p-4">
                  <p className="text-sm font-semibold">Security awal sudah memiliki bukti.</p>
                  <p className="mt-1 text-xs leading-5 text-emerald-950/70">Lakukan evaluasi final. Sistem tetap memeriksa exact terms snapshot, funding gap, offer talent, dan jumlah security sebelum mengubah booking menjadi secured.</p>
                  <button type="button" onClick={() => bookingAction("secure_booking")} disabled={busy !== null} className="mt-3 bg-black px-5 py-3 text-sm font-semibold text-white disabled:opacity-40">
                    {busy === "secure_booking" ? "Memeriksa…" : "Evaluasi & amankan booking"}
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}

          {["secured", "pre_show"].includes(booking.status) ? (
            <div className="mt-5 border-t border-black/10 pt-5">
              <div className="bg-black p-4 text-sm font-semibold text-white">✓ BOOKING TERJAMIN</div>
              <div className="mt-5">
                <p className="text-sm font-semibold">Pembayaran Setelah Booking Terjamin</p>
                <p className="mt-1 text-xs leading-5 text-black/45">Milestone berikutnya hanya diterbitkan setelah milestone sebelumnya terverifikasi. Nominal tidak diketik ulang.</p>
                {fullyPaid ? <p className="mt-3 border border-emerald-700/20 bg-emerald-50 p-4 text-sm font-semibold text-emerald-900">Pembayaran buyer sudah lunas.</p> : pendingPayment ? pendingRequestCard : requestForm}
              </div>
            </div>
          ) : null}

          {booking.status === "secured" && !termsAccepted ? <p className="mt-4 text-xs font-semibold text-red-700">Anomali: booking secured tanpa exact buyer terms snapshot acceptance.</p> : null}
        </>
      )}

      {error ? <p className="mt-3 text-xs font-semibold text-red-700">{error}</p> : null}
    </section>
  );
}
