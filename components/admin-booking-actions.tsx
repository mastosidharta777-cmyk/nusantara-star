"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Booking = {
  id: string; status: string; event_date: string; buyer_price: number | null;
  buyer_terms_accepted_at?: string | null; financial_security_type?: string | null;
  financial_security_status?: string; financial_security_reference?: string | null; secured_at?: string | null;
} | null;
type Payment = { id: string; payment_type: string | null; amount: number; status: string; paid_at: string | null };
function money(value: number | null) { return value == null ? "—" : new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value); }

export function AdminBookingActions({ briefId, talentName, booking, payments }: { briefId: string; talentName: string; booking: Booking; payments: Payment[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [securityType, setSecurityType] = useState("approved_po_credit");
  const [reference, setReference] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(Boolean(booking?.buyer_terms_accepted_at));

  async function bookingAction(action: string, extra: Record<string, string> = {}) {
    setBusy(action); setError(null);
    try {
      const response = await fetch("/api/internal-demo/admin/booking", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ briefId, action, ...extra }) });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.detail ?? result?.error ?? "Aksi booking gagal");
      if (action === "accept_buyer_terms") setTermsAccepted(true);
      router.refresh();
    } catch (err) { setError(err instanceof Error ? err.message : "Aksi booking gagal"); } finally { setBusy(null); }
  }
  async function paymentAction(action: string, paymentId?: string) {
    if (!booking) return; setBusy(action); setError(null);
    try {
      const response = await fetch("/api/internal-demo/admin/payment", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ bookingId: booking.id, action, paymentId }) });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.detail ?? result?.error ?? "Aksi pembayaran gagal");
      router.refresh();
    } catch (err) { setError(err instanceof Error ? err.message : "Aksi pembayaran gagal"); } finally { setBusy(null); }
  }

  const paidTotal = payments.filter((p) => p.status === "paid").reduce((sum, p) => sum + Number(p.amount ?? 0), 0);
  const pendingPayment = payments.find((p) => p.status === "pending");
  return <section className="mt-7 border border-black/10 bg-white p-5 md:p-6">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-sm font-semibold">Secure Booking</p><p className="mt-1 text-xs text-black/45">Talent: {talentName}. Buyer Selected belum berarti booked.</p></div>{booking ? <span className="border border-black/15 px-3 py-2 text-xs font-semibold uppercase">{booking.status}</span> : null}</div>
    {!booking ? <div className="mt-5"><p className="text-sm text-black/60">Buat booking sebagai <strong>pending_security</strong>. Belum secured.</p><button onClick={() => bookingAction("create_booking")} disabled={busy !== null} className="mt-3 bg-black px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">{busy ? "Memproses…" : "Buat Pending Security"}</button></div> : <>
      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><div className="border border-black/10 p-3 text-sm"><span className="text-black/45">Buyer price</span><br />{money(booking.buyer_price)}</div><div className="border border-black/10 p-3 text-sm"><span className="text-black/45">Buyer terms</span><br />{termsAccepted ? "Accepted" : "Belum accepted"}</div><div className="border border-black/10 p-3 text-sm"><span className="text-black/45">Financial security</span><br />{booking.financial_security_status ?? (booking.status === "secured" ? "satisfied" : "pending")}</div><div className="border border-black/10 p-3 text-sm"><span className="text-black/45">Buyer paid</span><br />{money(paidTotal)}</div></div>
      {booking.status === "pending_security" && !termsAccepted ? <button onClick={() => bookingAction("accept_buyer_terms")} disabled={busy !== null} className="mt-4 border border-black px-4 py-2 text-sm font-semibold disabled:opacity-40">Catat Buyer Terms Accepted</button> : null}
      {booking.status === "pending_security" ? <div className="mt-5 border-t border-black/10 pt-5"><p className="text-sm font-semibold">Financial Security</p><p className="mt-1 text-xs text-black/45">Tidak ada DP universal. Pembayaran mengikuti milestone deal yang dikunci.</p>
        {!pendingPayment ? <button onClick={() => paymentAction("create_next_buyer_payment")} disabled={busy !== null} className="mt-3 border border-black px-4 py-2 text-sm font-semibold disabled:opacity-40">Buat Payment Milestone Berikutnya</button> : null}
        {pendingPayment ? <div className="mt-3 border border-black/10 p-4 text-sm">Pending: {pendingPayment.payment_type} · {money(pendingPayment.amount)}<br /><button onClick={() => paymentAction("mark_paid", pendingPayment.id)} disabled={busy !== null} className="mt-3 bg-black px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">Tandai Sudah Dibayar</button></div> : null}
        <div className="mt-4 grid gap-2 md:grid-cols-[220px_1fr_auto]"><select value={securityType} onChange={(e) => setSecurityType(e.target.value)} className="border border-black/15 p-2 text-sm"><option value="approved_po_credit">Approved PO / Credit</option><option value="authorized_exception">Authorized Exception</option></select><input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="PO reference / catatan exception" className="border border-black/15 p-2 text-sm" /><button onClick={() => bookingAction("set_security", { securityType, reference })} disabled={busy !== null} className="border border-black px-4 py-2 text-sm font-semibold disabled:opacity-40">Set Security</button></div>
        <button onClick={() => bookingAction("secure_booking")} disabled={busy !== null} className="mt-5 bg-black px-5 py-3 text-sm font-semibold text-white disabled:opacity-40">Evaluate & Secure Booking</button></div> : null}
      {booking.status === "secured" ? <p className="mt-5 bg-black p-4 text-sm font-semibold text-white">✓ BOOKING SECURED</p> : null}
    </>}
    {error ? <p className="mt-3 text-xs font-semibold text-red-700">{error}</p> : null}
  </section>;
}
