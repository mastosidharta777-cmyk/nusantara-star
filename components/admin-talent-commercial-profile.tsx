"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { TalentPaymentPolicyTemplate } from "@/lib/admin-talent-detail";

function money(value: number | null) {
  if (value == null) return "—";
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value);
}
function paymentValue(item: TalentPaymentPolicyTemplate) {
  if (item.calculation_type === "percentage") return `${item.percentage}%`;
  if (item.calculation_type === "fixed_amount") return money(item.amount);
  return "Sisa pembayaran";
}
function typeLabel(value: string) {
  if (value === "booking_fee") return "Biaya booking";
  if (value === "deposit") return "DP";
  if (value === "balance") return "Pelunasan";
  if (value === "full_payment") return "Pembayaran penuh";
  return "Lainnya";
}
function dueLabel(item: TalentPaymentPolicyTemplate) {
  const basis = item.due_basis === "booking_date" ? "booking" : item.due_basis === "event_date" ? "acara" : item.due_basis === "event_completion" ? "acara selesai" : "invoice";
  if (item.due_offset_days === 0) return `Saat ${basis}`;
  if (item.due_offset_days < 0) return `H${item.due_offset_days} sebelum ${basis}`;
  return `H+${item.due_offset_days} setelah ${basis}`;
}

export function AdminTalentCommercialProfile({ talentId, policies }: { talentId: string; policies: TalentPaymentPolicyTemplate[] }) {
  const router = useRouter();
  const nextSequence = useMemo(() => (policies.length ? Math.max(...policies.map((item) => item.sequence_no)) + 1 : 1), [policies]);
  const [milestoneType, setMilestoneType] = useState("deposit");
  const [calculationType, setCalculationType] = useState("percentage");
  const [percentage, setPercentage] = useState("50");
  const [amount, setAmount] = useState("");
  const [dueBasis, setDueBasis] = useState("booking_date");
  const [dueOffsetDays, setDueOffsetDays] = useState("0");
  const [refundability, setRefundability] = useState("unspecified");
  const [negotiable, setNegotiable] = useState(true);
  const [cancellationNote, setCancellationNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function post(body: Record<string, unknown>) {
    setBusy(true); setError(null);
    try {
      const response = await fetch("/api/internal-demo/admin/talent-commercial-profile", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ talentId, ...body }) });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.detail ?? data?.error ?? "Gagal menyimpan data");
      router.refresh();
    } catch (err) { setError(err instanceof Error ? err.message : "Gagal menyimpan data"); }
    finally { setBusy(false); }
  }

  async function deletePolicy(item: TalentPaymentPolicyTemplate) {
    if (!window.confirm(`Hapus tahap ${item.sequence_no}. ${typeLabel(item.milestone_type)} (${paymentValue(item)})?`)) return;
    await post({ action: "delete_payment_policy", policyId: item.id });
  }

  return <section>
    <div><p className="text-sm font-semibold">Termin pembayaran default</p><p className="mt-1 text-xs text-black/45">Contoh: DP saat booking lalu pelunasan sebelum acara. Ini hanya template internal; terms final tetap mengikuti kesepakatan job.</p></div>
    <div className="mt-5 space-y-2">{policies.length === 0 ? <p className="text-sm text-black/45">Belum ada termin pembayaran.</p> : policies.map((item) => <div key={item.id} className="border border-black/10 bg-[#f5f3ee] p-3 text-sm"><div className="flex items-start justify-between gap-3"><div><div className="flex gap-3"><span className="font-semibold">{item.sequence_no}. {typeLabel(item.milestone_type)}</span><span>{paymentValue(item)}</span></div><p className="mt-1 text-black/55">Jatuh tempo: {dueLabel(item)}</p><p className="mt-1 text-black/45">Refundable: {item.refundable === true ? "Ya" : item.refundable === false ? "Tidak" : "Belum ditentukan"} · Negosiasi: {item.negotiable ? "Ya" : "Tidak"}</p>{item.cancellation_note ? <p className="mt-1 text-black/45">{item.cancellation_note}</p> : null}</div><button disabled={busy} onClick={() => deletePolicy(item)} className="shrink-0 border border-red-700 px-3 py-1.5 text-xs font-semibold text-red-700 disabled:opacity-40">Hapus</button></div></div>)}</div>

    <div className="mt-5 border-t border-black/10 pt-5"><p className="text-sm font-semibold">Tambah termin</p><div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      <label className="text-sm font-semibold">Jenis pembayaran<select value={milestoneType} onChange={(e) => setMilestoneType(e.target.value)} className="mt-2 w-full border border-black/15 bg-white px-3 py-3 font-normal"><option value="booking_fee">Biaya booking</option><option value="deposit">DP</option><option value="balance">Pelunasan</option><option value="full_payment">Pembayaran penuh</option><option value="other">Lainnya</option></select></label>
      <label className="text-sm font-semibold">Perhitungan<select value={calculationType} onChange={(e) => setCalculationType(e.target.value)} className="mt-2 w-full border border-black/15 bg-white px-3 py-3 font-normal"><option value="percentage">Persentase</option><option value="fixed_amount">Nominal tetap</option><option value="remaining_balance">Sisa pembayaran</option></select></label>
      {calculationType === "percentage" ? <label className="text-sm font-semibold">Persentase (%)<input value={percentage} onChange={(e) => setPercentage(e.target.value)} inputMode="decimal" className="mt-2 w-full border border-black/15 px-3 py-3 font-normal" /></label> : null}
      {calculationType === "fixed_amount" ? <label className="text-sm font-semibold">Nominal (Rp)<input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="numeric" className="mt-2 w-full border border-black/15 px-3 py-3 font-normal" /></label> : null}
      <label className="text-sm font-semibold">Acuan jatuh tempo<select value={dueBasis} onChange={(e) => setDueBasis(e.target.value)} className="mt-2 w-full border border-black/15 bg-white px-3 py-3 font-normal"><option value="booking_date">Tanggal booking</option><option value="event_date">Tanggal acara</option><option value="event_completion">Acara selesai</option><option value="invoice_date">Tanggal invoice</option></select></label>
      <label className="text-sm font-semibold">Selisih hari<input value={dueOffsetDays} onChange={(e) => setDueOffsetDays(e.target.value)} inputMode="numeric" className="mt-2 w-full border border-black/15 px-3 py-3 font-normal" /><span className="mt-1 block text-xs font-normal text-black/45">-1 = H-1, 0 = hari acuan, 7 = H+7.</span></label>
      <label className="text-sm font-semibold">Dapat dikembalikan?<select value={refundability} onChange={(e) => setRefundability(e.target.value)} className="mt-2 w-full border border-black/15 bg-white px-3 py-3 font-normal"><option value="unspecified">Belum ditentukan</option><option value="yes">Ya</option><option value="no">Tidak</option></select></label>
      <label className="flex items-center gap-2 pt-8 text-sm font-semibold"><input type="checkbox" checked={negotiable} onChange={(e) => setNegotiable(e.target.checked)} /> Dapat dinegosiasikan</label>
    </div><label className="mt-4 block text-sm font-semibold">Ketentuan pembatalan<input value={cancellationNote} onChange={(e) => setCancellationNote(e.target.value)} placeholder="Opsional" className="mt-2 w-full border border-black/15 px-3 py-3 font-normal" /></label>
    <button disabled={busy} onClick={() => post({ action: "add_payment_policy", milestoneType, sequenceNo: nextSequence, calculationType, percentage: calculationType === "percentage" ? Number(percentage) : null, amount: calculationType === "fixed_amount" ? Number(amount.replace(/\D/g, "")) : null, dueBasis, dueOffsetDays: Number(dueOffsetDays), refundable: refundability === "yes" ? true : refundability === "no" ? false : null, negotiable, cancellationNote })} className="mt-4 border border-black bg-black px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">{busy ? "Menyimpan…" : "Tambah Termin"}</button></div>
    {error ? <p className="mt-4 text-sm font-semibold text-red-700">{error}</p> : null}
  </section>;
}
