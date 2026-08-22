"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

type Milestone = {
  id: string;
  party: "buyer" | "talent";
  milestone_type: string;
  sequence_no: number;
  calculation_type: string;
  percentage: number | null;
  amount: number | null;
  due_basis: string;
  due_offset_days: number;
  custom_due_date: string | null;
  refundable: boolean | null;
  cancellation_note: string | null;
  status: string;
};

function money(value: number | null) {
  if (value == null) return "—";
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value);
}

function milestoneTypeLabel(value: string) {
  if (value === "booking_fee") return "Biaya booking";
  if (value === "deposit") return "DP";
  if (value === "balance") return "Pelunasan";
  if (value === "full_payment") return "Pembayaran penuh";
  return "Lainnya";
}

function statusLabel(value: string) {
  if (value === "planned") return "Direncanakan";
  if (value === "due") return "Jatuh tempo";
  if (value === "paid") return "Sudah dibayar";
  if (value === "waived") return "Ditiadakan";
  if (value === "cancelled") return "Dibatalkan";
  return value;
}

function dueLabel(item: Milestone) {
  if (item.due_basis === "custom_date") return item.custom_due_date ?? "Tanggal khusus";

  const offset = item.due_offset_days;
  if (item.due_basis === "booking_date") {
    if (offset === 0) return "Saat booking";
    return offset < 0 ? `H${offset} sebelum tanggal booking` : `H+${offset} setelah tanggal booking`;
  }
  if (item.due_basis === "event_date") {
    if (offset === 0) return "Hari acara";
    return offset < 0 ? `H${offset} sebelum acara` : `H+${offset} setelah hari acara`;
  }
  if (item.due_basis === "event_completion") {
    if (offset === 0) return "Saat acara selesai";
    return offset < 0 ? `H${offset} sebelum acara selesai` : `H+${offset} setelah acara selesai`;
  }
  if (offset === 0) return "Tanggal invoice";
  return offset < 0 ? `H${offset} sebelum tanggal invoice` : `H+${offset} setelah tanggal invoice`;
}

function valueLabel(item: Milestone) {
  if (item.calculation_type === "percentage") return `${item.percentage}%`;
  if (item.calculation_type === "fixed_amount") return money(item.amount);
  return "Sisa pembayaran";
}

export function AdminPaymentMilestones({ bookingId, milestones }: { bookingId: string; milestones: Milestone[] }) {
  const router = useRouter();
  const [party, setParty] = useState<"buyer" | "talent">("talent");
  const [milestoneType, setMilestoneType] = useState("deposit");
  const [calculationType, setCalculationType] = useState("percentage");
  const [percentage, setPercentage] = useState("25");
  const [amount, setAmount] = useState("");
  const [dueBasis, setDueBasis] = useState("event_date");
  const [dueOffsetDays, setDueOffsetDays] = useState("-1");
  const [customDueDate, setCustomDueDate] = useState("");
  const [refundability, setRefundability] = useState("unspecified");
  const [cancellationNote, setCancellationNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nextSequence = useMemo(() => {
    const sameParty = milestones.filter((item) => item.party === party);
    return sameParty.length ? Math.max(...sameParty.map((item) => item.sequence_no)) + 1 : 1;
  }, [milestones, party]);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/internal-demo/admin/payment-milestones", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          bookingId,
          party,
          milestoneType,
          sequenceNo: nextSequence,
          calculationType,
          percentage: calculationType === "percentage" ? Number(percentage) : null,
          amount: calculationType === "fixed_amount" ? Number(amount.replace(/\D/g, "")) : null,
          dueBasis,
          dueOffsetDays: dueBasis === "custom_date" ? 0 : Number(dueOffsetDays),
          customDueDate: dueBasis === "custom_date" ? customDueDate : null,
          refundable: refundability === "yes" ? true : refundability === "no" ? false : null,
          cancellationNote,
        }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.detail ?? body?.error ?? "Gagal menyimpan jadwal pembayaran");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menyimpan jadwal pembayaran");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-7 border border-black/10 bg-white p-5 md:p-6">
      <div>
        <p className="text-sm font-semibold">Jadwal Pembayaran</p>
        <p className="mt-1 text-xs text-black/45">Jadwal pembayaran buyer dan talent dapat berbeda untuk setiap booking. Bagian ini hanya mencatat jadwal, bukan transaksi uang aktual.</p>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        {(["buyer", "talent"] as const).map((group) => (
          <div key={group} className="border border-black/10 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-black/45">{group === "buyer" ? "Jadwal Pembayaran Buyer" : "Jadwal Pembayaran Talent"}</p>
            <div className="mt-3 space-y-2">
              {milestones.filter((item) => item.party === group).length === 0 ? (
                <p className="text-sm text-black/45">Belum ada tahapan pembayaran.</p>
              ) : milestones.filter((item) => item.party === group).sort((a, b) => a.sequence_no - b.sequence_no).map((item) => (
                <div key={item.id} className="border border-black/10 bg-[#f5f3ee] p-3 text-sm">
                  <div className="flex justify-between gap-3"><span className="font-semibold">{item.sequence_no}. {milestoneTypeLabel(item.milestone_type)}</span><span>{valueLabel(item)}</span></div>
                  <p className="mt-1 text-black/55">Jatuh tempo: {dueLabel(item)}</p>
                  <p className="mt-1 text-black/45">Dapat dikembalikan: {item.refundable === true ? "Ya" : item.refundable === false ? "Tidak" : "Belum ditentukan"} · Status: {statusLabel(item.status)}</p>
                  {item.cancellation_note ? <p className="mt-1 text-black/45">Ketentuan pembatalan: {item.cancellation_note}</p> : null}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-5 border-t border-black/10 pt-5">
        <p className="text-sm font-semibold">Tambah Tahapan Pembayaran</p>
        <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <label className="text-sm font-semibold">Pihak<select value={party} onChange={(e) => setParty(e.target.value as "buyer" | "talent")} className="mt-2 w-full border border-black/15 bg-white px-3 py-3 font-normal"><option value="buyer">Buyer</option><option value="talent">Talent</option></select></label>
          <label className="text-sm font-semibold">Jenis pembayaran<select value={milestoneType} onChange={(e) => setMilestoneType(e.target.value)} className="mt-2 w-full border border-black/15 bg-white px-3 py-3 font-normal"><option value="booking_fee">Biaya booking</option><option value="deposit">DP</option><option value="balance">Pelunasan</option><option value="full_payment">Pembayaran penuh</option><option value="other">Lainnya</option></select></label>
          <label className="text-sm font-semibold">Perhitungan<select value={calculationType} onChange={(e) => setCalculationType(e.target.value)} className="mt-2 w-full border border-black/15 bg-white px-3 py-3 font-normal"><option value="percentage">Persentase</option><option value="fixed_amount">Nominal tetap</option><option value="remaining_balance">Sisa pembayaran</option></select></label>
          {calculationType === "percentage" ? <label className="text-sm font-semibold">Persentase (%)<input value={percentage} onChange={(e) => setPercentage(e.target.value)} inputMode="decimal" className="mt-2 w-full border border-black/15 px-3 py-3 font-normal" /></label> : null}
          {calculationType === "fixed_amount" ? <label className="text-sm font-semibold">Nominal (Rp)<input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="numeric" className="mt-2 w-full border border-black/15 px-3 py-3 font-normal" /></label> : null}
          <label className="text-sm font-semibold">Acuan jatuh tempo<select value={dueBasis} onChange={(e) => setDueBasis(e.target.value)} className="mt-2 w-full border border-black/15 bg-white px-3 py-3 font-normal"><option value="booking_date">Tanggal booking</option><option value="event_date">Tanggal acara</option><option value="event_completion">Acara selesai</option><option value="invoice_date">Tanggal invoice</option><option value="custom_date">Tanggal khusus</option></select></label>
          {dueBasis === "custom_date" ? <label className="text-sm font-semibold">Tanggal khusus<input type="date" value={customDueDate} onChange={(e) => setCustomDueDate(e.target.value)} className="mt-2 w-full border border-black/15 px-3 py-3 font-normal" /></label> : <label className="text-sm font-semibold">Selisih hari<input value={dueOffsetDays} onChange={(e) => setDueOffsetDays(e.target.value)} inputMode="numeric" className="mt-2 w-full border border-black/15 px-3 py-3 font-normal" /><span className="mt-1 block text-xs font-normal text-black/45">Contoh: -1 = H-1, 0 = hari acuan, 30 = H+30.</span></label>}
          <label className="text-sm font-semibold">Dapat dikembalikan?<select value={refundability} onChange={(e) => setRefundability(e.target.value)} className="mt-2 w-full border border-black/15 bg-white px-3 py-3 font-normal"><option value="unspecified">Belum ditentukan</option><option value="yes">Ya</option><option value="no">Tidak</option></select></label>
        </div>
        <label className="mt-4 block text-sm font-semibold">Ketentuan pembatalan<input value={cancellationNote} onChange={(e) => setCancellationNote(e.target.value)} placeholder="Contoh: biaya booking hangus jika buyer membatalkan" className="mt-2 w-full border border-black/15 px-3 py-3 font-normal" /></label>
        <button onClick={save} disabled={busy} className="mt-4 border border-black bg-black px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">{busy ? "Menyimpan…" : "Tambah Tahapan"}</button>
        {error ? <p className="mt-3 text-xs font-semibold text-red-700">{error}</p> : null}
      </div>
    </section>
  );
}
