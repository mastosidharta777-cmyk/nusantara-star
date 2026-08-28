"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import type { DealReviewRow } from "@/lib/deal-review-data";

function money(value: number | null) {
  if (value == null) return "—";
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value);
}

function statusLabel(value?: string | null) {
  if (!value) return "Belum disiapkan";
  const labels: Record<string, string> = {
    not_prepared: "Belum disiapkan",
    review_required: "Perlu ditinjau",
    approved: "Disetujui",
    locked: "Dikunci",
    pending: "Menunggu",
    confirmed: "Terkonfirmasi",
    agreed: "Disepakati",
    missing: "Belum lengkap",
    requested: "Diminta",
  };
  return labels[value] ?? value.replaceAll("_", " ");
}

export function AdminDealReview({ briefId, deal }: { briefId: string; deal: DealReviewRow | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState(deal?.exception_reason ?? "");
  const [bookingReferenceDate, setBookingReferenceDate] = useState(deal?.booking_reference_date ?? "");
  const [invoiceReferenceDate, setInvoiceReferenceDate] = useState(deal?.invoice_reference_date ?? "");
  const [directCostDueDate, setDirectCostDueDate] = useState(deal?.direct_cost_due_date ?? "");
  const [taxFeeDueDate, setTaxFeeDueDate] = useState(deal?.tax_fee_due_date ?? "");

  async function act(action: string) {
    setBusy(action);
    setError(null);
    try {
      const response = await fetch("/api/internal-demo/admin/deal-review", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ briefId, action, reason, bookingReferenceDate, invoiceReferenceDate, directCostDueDate, taxFeeDueDate }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.detail ?? body?.error ?? "Tindakan gagal diproses");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Tindakan gagal diproses");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="mt-7 border border-black/10 bg-white p-5 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">Asisten Kesepakatan · Peninjauan</p>
          <p className="mt-1 text-xs text-black/45">Sistem menyiapkan. Aturan menghitung. Admin menyetujui.</p>
        </div>
        <span className="border border-black/15 px-3 py-2 text-xs font-semibold uppercase">{statusLabel(deal?.status)}</span>
      </div>

      {!deal ? (
        <button type="button" onClick={() => act("refresh")} disabled={busy !== null} className="mt-5 border border-black bg-black px-4 py-3 text-sm font-semibold text-white disabled:opacity-50">
          {busy ? "Menyiapkan…" : "Siapkan Peninjauan Kesepakatan"}
        </button>
      ) : (
        <>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="border border-black/10 p-4"><p className="text-xs text-black/45">Fee talent</p><p className="mt-2 font-semibold">{money(deal.talent_payable)}</p></div>
            <div className="border border-black/10 p-4"><p className="text-xs text-black/45">Harga ke klien</p><p className="mt-2 font-semibold">{money(deal.buyer_price)}</p></div>
            <div className="border border-black/10 p-4"><p className="text-xs text-black/45">Kontribusi</p><p className="mt-2 font-semibold">{money(deal.contribution)}</p></div>
            <div className="border border-black/10 p-4"><p className="text-xs text-black/45">Kekurangan pendanaan</p><p className="mt-2 font-semibold">{deal.funding_gap_status === "unknown" ? "BELUM DAPAT DIHITUNG" : deal.funding_gap_status === "safe" ? "AMAN" : money(deal.funding_gap_amount)}</p></div>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <div className="border border-black/10 p-4 text-sm"><span className="text-black/45">Ketentuan talent</span><br /><b>{statusLabel(deal.talent_terms_status)}</b></div>
            <div className="border border-black/10 p-4 text-sm"><span className="text-black/45">Ketentuan klien</span><br /><b>{statusLabel(deal.buyer_terms_status)}</b></div>
          </div>

          <div className="mt-5 border border-black/10 bg-[#f8f7f3] p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-black/45">Tanggal kontraktual tersimpan</p>
            <div className="mt-3 grid gap-3 md:grid-cols-4">
              <label className="text-xs font-semibold">Acuan booking<input type="date" value={bookingReferenceDate} onChange={(e) => setBookingReferenceDate(e.target.value)} disabled={deal.status === "locked"} className="mt-1 w-full border border-black/15 bg-white p-2 font-normal" /></label>
              <label className="text-xs font-semibold">Acuan tagihan<input type="date" value={invoiceReferenceDate} onChange={(e) => setInvoiceReferenceDate(e.target.value)} disabled={deal.status === "locked"} className="mt-1 w-full border border-black/15 bg-white p-2 font-normal" /></label>
              <label className="text-xs font-semibold">Jatuh tempo biaya langsung<input type="date" value={directCostDueDate} onChange={(e) => setDirectCostDueDate(e.target.value)} disabled={deal.status === "locked"} className="mt-1 w-full border border-black/15 bg-white p-2 font-normal" /></label>
              <label className="text-xs font-semibold">Jatuh tempo pajak/biaya pembayaran<input type="date" value={taxFeeDueDate} onChange={(e) => setTaxFeeDueDate(e.target.value)} disabled={deal.status === "locked"} className="mt-1 w-full border border-black/15 bg-white p-2 font-normal" /></label>
            </div>
            {deal.status !== "locked" ? <button type="button" onClick={() => act("refresh")} disabled={busy !== null} className="mt-3 border border-black/20 bg-white px-3 py-2 text-xs font-semibold">Perbarui Peninjauan</button> : null}
          </div>

          <div className="mt-5">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-black/45">Belum terselesaikan</p>
            {deal.unresolved_issues.length ? <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-red-700">{deal.unresolved_issues.map((item) => <li key={item}>{item}</li>)}</ul> : <p className="mt-2 text-sm font-semibold">Tidak ada masalah yang belum terselesaikan.</p>}
          </div>

          {deal.status === "review_required" ? (
            <div className="mt-5 flex flex-col gap-3">
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => act("approve")} disabled={busy !== null} className="border border-black bg-black px-4 py-2 text-sm font-semibold text-white">Setujui</button>
                <button type="button" onClick={() => act("request_exception")} disabled={busy !== null} className="border border-black/20 px-4 py-2 text-sm font-semibold">Tinjau Pengecualian</button>
                {deal.exception_status === "requested" ? <button type="button" onClick={() => act("approve_exception")} disabled={busy !== null} className="border border-black/20 px-4 py-2 text-sm font-semibold">Setujui Pengecualian</button> : null}
              </div>
              {deal.unresolved_issues.length || deal.funding_gap_status !== "safe" ? <textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Alasan pengecualian / mitigasi" className="min-h-20 border border-black/15 p-3 text-sm" /> : null}
            </div>
          ) : null}

          {deal.status === "approved" ? <button type="button" onClick={() => act("lock")} disabled={busy !== null} className="mt-5 border border-black bg-black px-4 py-2 text-sm font-semibold text-white">Kunci Kesepakatan</button> : null}
          {deal.status === "locked" ? <p className="mt-5 text-sm font-semibold">✓ Kesepakatan sudah dikunci. Siap masuk tahap jaminan booking.</p> : null}
        </>
      )}
      {error ? <p className="mt-3 text-sm font-semibold text-red-700">{error}</p> : null}
    </section>
  );
}
