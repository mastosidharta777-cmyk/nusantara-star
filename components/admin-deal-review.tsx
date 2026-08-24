"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import type { DealReviewRow } from "@/lib/deal-review-data";

function money(value: number | null) {
  if (value == null) return "—";
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value);
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
      if (!response.ok) throw new Error(body?.detail ?? body?.error ?? "Action failed");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="mt-7 border border-black/10 bg-white p-5 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">Deal Copilot · Review</p>
          <p className="mt-1 text-xs text-black/45">System prepares. Rules calculate. Admin approves.</p>
        </div>
        <span className="border border-black/15 px-3 py-2 text-xs font-semibold uppercase">{deal?.status ?? "not prepared"}</span>
      </div>

      {!deal ? (
        <button type="button" onClick={() => act("refresh")} disabled={busy !== null} className="mt-5 border border-black bg-black px-4 py-3 text-sm font-semibold text-white disabled:opacity-50">
          {busy ? "Menyiapkan…" : "Siapkan Deal Review"}
        </button>
      ) : (
        <>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="border border-black/10 p-4"><p className="text-xs text-black/45">Talent fee</p><p className="mt-2 font-semibold">{money(deal.talent_payable)}</p></div>
            <div className="border border-black/10 p-4"><p className="text-xs text-black/45">Buyer price</p><p className="mt-2 font-semibold">{money(deal.buyer_price)}</p></div>
            <div className="border border-black/10 p-4"><p className="text-xs text-black/45">Contribution</p><p className="mt-2 font-semibold">{money(deal.contribution)}</p></div>
            <div className="border border-black/10 p-4"><p className="text-xs text-black/45">Funding gap</p><p className="mt-2 font-semibold">{deal.funding_gap_status === "unknown" ? "BELUM DAPAT DIHITUNG" : deal.funding_gap_status === "safe" ? "AMAN" : money(deal.funding_gap_amount)}</p></div>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <div className="border border-black/10 p-4 text-sm"><span className="text-black/45">Talent terms</span><br /><b>{deal.talent_terms_status}</b></div>
            <div className="border border-black/10 p-4 text-sm"><span className="text-black/45">Buyer terms</span><br /><b>{deal.buyer_terms_status}</b></div>
          </div>

          <div className="mt-5 border border-black/10 bg-[#f8f7f3] p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-black/45">Persisted contractual dates</p>
            <div className="mt-3 grid gap-3 md:grid-cols-4">
              <label className="text-xs font-semibold">Booking reference<input type="date" value={bookingReferenceDate} onChange={(e) => setBookingReferenceDate(e.target.value)} disabled={deal.status === "locked"} className="mt-1 w-full border border-black/15 bg-white p-2 font-normal" /></label>
              <label className="text-xs font-semibold">Invoice reference<input type="date" value={invoiceReferenceDate} onChange={(e) => setInvoiceReferenceDate(e.target.value)} disabled={deal.status === "locked"} className="mt-1 w-full border border-black/15 bg-white p-2 font-normal" /></label>
              <label className="text-xs font-semibold">Direct cost due<input type="date" value={directCostDueDate} onChange={(e) => setDirectCostDueDate(e.target.value)} disabled={deal.status === "locked"} className="mt-1 w-full border border-black/15 bg-white p-2 font-normal" /></label>
              <label className="text-xs font-semibold">Tax/payment fee due<input type="date" value={taxFeeDueDate} onChange={(e) => setTaxFeeDueDate(e.target.value)} disabled={deal.status === "locked"} className="mt-1 w-full border border-black/15 bg-white p-2 font-normal" /></label>
            </div>
            {deal.status !== "locked" ? <button type="button" onClick={() => act("refresh")} disabled={busy !== null} className="mt-3 border border-black/20 bg-white px-3 py-2 text-xs font-semibold">Refresh Review</button> : null}
          </div>

          <div className="mt-5">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-black/45">Unresolved</p>
            {deal.unresolved_issues.length ? <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-red-700">{deal.unresolved_issues.map((item) => <li key={item}>{item}</li>)}</ul> : <p className="mt-2 text-sm font-semibold">Tidak ada unresolved issue.</p>}
          </div>

          {deal.status === "review_required" ? (
            <div className="mt-5 flex flex-col gap-3">
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => act("approve")} disabled={busy !== null} className="border border-black bg-black px-4 py-2 text-sm font-semibold text-white">Approve</button>
                <button type="button" onClick={() => act("request_exception")} disabled={busy !== null} className="border border-black/20 px-4 py-2 text-sm font-semibold">Review Exception</button>
                {deal.exception_status === "requested" ? <button type="button" onClick={() => act("approve_exception")} disabled={busy !== null} className="border border-black/20 px-4 py-2 text-sm font-semibold">Approve Exception</button> : null}
              </div>
              {deal.unresolved_issues.length || deal.funding_gap_status !== "safe" ? <textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Alasan exception / mitigasi" className="min-h-20 border border-black/15 p-3 text-sm" /> : null}
            </div>
          ) : null}

          {deal.status === "approved" ? <button type="button" onClick={() => act("lock")} disabled={busy !== null} className="mt-5 border border-black bg-black px-4 py-2 text-sm font-semibold text-white">Lock Deal</button> : null}
          {deal.status === "locked" ? <p className="mt-5 text-sm font-semibold">✓ Deal locked. Siap masuk tahap booking security.</p> : null}
        </>
      )}
      {error ? <p className="mt-3 text-sm font-semibold text-red-700">{error}</p> : null}
    </section>
  );
}
