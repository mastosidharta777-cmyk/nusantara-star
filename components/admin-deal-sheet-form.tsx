"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

type Milestone = {
  milestone_type: string;
  sequence_no: number;
  calculation_type: "percentage" | "fixed_amount" | "remaining_balance";
  percentage: number | null;
  amount: number | null;
  due_basis: "booking_date" | "event_date" | "event_completion" | "invoice_date" | "custom_date";
  due_offset_days: number;
  custom_due_date?: string | null;
  refundable: boolean | null;
  cancellation_note: string | null;
  notes?: string | null;
};

type PolicyMilestone = Milestone & { id: string; negotiable: boolean };

type InitialTerms = {
  buyer_price: number;
  talent_payable: number;
  direct_costs: number;
  taxes_and_payment_fees: number;
  buyer_payment_schedule: Milestone[] | null;
  talent_payment_schedule: Milestone[] | null;
  cancellation_terms: string | null;
  rider_notes: string | null;
  special_conditions: string | null;
  notes: string | null;
  status: string;
} | null;

function digitsOnly(value: string) {
  return value.replace(/\D/g, "");
}

function asAmount(value: string) {
  const digits = digitsOnly(value);
  return digits ? Number(digits) : 0;
}

function money(value: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value);
}

function normalizeRows(rows: Milestone[]) {
  return rows.map((row, index) => ({ ...row, sequence_no: index + 1 }));
}

function newMilestone(sequence: number): Milestone {
  return {
    milestone_type: sequence === 1 ? "deposit" : "balance",
    sequence_no: sequence,
    calculation_type: sequence === 1 ? "percentage" : "remaining_balance",
    percentage: sequence === 1 ? null : null,
    amount: null,
    due_basis: sequence === 1 ? "booking_date" : "event_date",
    due_offset_days: 0,
    custom_due_date: null,
    refundable: null,
    cancellation_note: null,
    notes: null,
  };
}

function scheduleAmount(rows: Milestone[], total: number) {
  let used = 0;
  return rows.map((row) => {
    let amount = 0;
    if (row.calculation_type === "percentage") amount = Math.round(total * ((row.percentage ?? 0) / 100));
    if (row.calculation_type === "fixed_amount") amount = row.amount ?? 0;
    if (row.calculation_type === "remaining_balance") amount = Math.max(0, total - used);
    used += amount;
    return { ...row, resolvedAmount: amount };
  });
}

function dueDate(row: Milestone, eventDate: string | null) {
  let base: Date | null = null;
  if (row.due_basis === "booking_date") base = new Date();
  if ((row.due_basis === "event_date" || row.due_basis === "event_completion") && eventDate) base = new Date(`${eventDate}T12:00:00`);
  if (row.due_basis === "custom_date" && row.custom_due_date) base = new Date(`${row.custom_due_date}T12:00:00`);
  if (!base || Number.isNaN(base.getTime())) return null;
  base.setDate(base.getDate() + row.due_offset_days);
  return base;
}

export function AdminDealSheetForm({
  briefId,
  talentId,
  talentName,
  eventDate,
  initialTerms,
  talentPolicyTemplates,
}: {
  briefId: string;
  talentId: string;
  talentName: string;
  eventDate: string | null;
  initialTerms: InitialTerms;
  talentPolicyTemplates: PolicyMilestone[];
}) {
  const router = useRouter();
  const locked = initialTerms?.status === "agreed";
  const [buyerPrice, setBuyerPrice] = useState(String(initialTerms?.buyer_price ?? ""));
  const [talentPayable, setTalentPayable] = useState(String(initialTerms?.talent_payable ?? ""));
  const [directCosts, setDirectCosts] = useState(String(initialTerms?.direct_costs ?? 0));
  const [taxFees, setTaxFees] = useState(String(initialTerms?.taxes_and_payment_fees ?? 0));
  const [buyerSchedule, setBuyerSchedule] = useState<Milestone[]>(initialTerms?.buyer_payment_schedule?.length ? initialTerms.buyer_payment_schedule : []);
  const [talentSchedule, setTalentSchedule] = useState<Milestone[]>(
    initialTerms?.talent_payment_schedule?.length
      ? initialTerms.talent_payment_schedule
      : talentPolicyTemplates.map(({ id: _id, negotiable: _negotiable, ...row }) => row),
  );
  const [riderNotes, setRiderNotes] = useState(initialTerms?.rider_notes ?? "");
  const [cancellationTerms, setCancellationTerms] = useState(initialTerms?.cancellation_terms ?? "");
  const [specialConditions, setSpecialConditions] = useState(initialTerms?.special_conditions ?? "");
  const [notes, setNotes] = useState(initialTerms?.notes ?? "");
  const [busy, setBusy] = useState<"draft" | "agreed" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const buyerAmount = asAmount(buyerPrice);
  const talentAmount = asAmount(talentPayable);
  const directAmount = asAmount(directCosts);
  const taxAmount = asAmount(taxFees);
  const contribution = buyerAmount - talentAmount - directAmount - taxAmount;

  const fundingGap = useMemo(() => {
    if (!buyerSchedule.length || !talentSchedule.length || buyerAmount <= 0 || talentAmount <= 0) return null;
    const buyer = scheduleAmount(buyerSchedule, buyerAmount).map((row) => ({ ...row, date: dueDate(row, eventDate), direction: "in" as const }));
    const talent = scheduleAmount(talentSchedule, talentAmount).map((row) => ({ ...row, date: dueDate(row, eventDate), direction: "out" as const }));
    if ([...buyer, ...talent].some((row) => !row.date)) return { unknown: true, maxGap: 0 };
    const events = [...buyer, ...talent].sort((a, b) => a.date!.getTime() - b.date!.getTime());
    let cash = 0;
    let maxGap = 0;
    for (const item of events) {
      cash += item.direction === "in" ? item.resolvedAmount : -item.resolvedAmount;
      maxGap = Math.max(maxGap, Math.max(0, -cash));
    }
    return { unknown: false, maxGap };
  }, [buyerSchedule, talentSchedule, buyerAmount, talentAmount, eventDate]);

  function updateRow(party: "buyer" | "talent", index: number, patch: Partial<Milestone>) {
    const setter = party === "buyer" ? setBuyerSchedule : setTalentSchedule;
    setter((current) => normalizeRows(current.map((row, i) => (i === index ? { ...row, ...patch } : row))));
  }

  function removeRow(party: "buyer" | "talent", index: number) {
    const setter = party === "buyer" ? setBuyerSchedule : setTalentSchedule;
    setter((current) => normalizeRows(current.filter((_, i) => i !== index)));
  }

  async function save(status: "draft" | "agreed") {
    setBusy(status);
    setError(null);
    try {
      if (status === "agreed" && (buyerAmount <= 0 || talentAmount <= 0)) throw new Error("Fee buyer dan fee talent wajib diisi sebelum deal dikunci.");
      if (status === "agreed" && (!buyerSchedule.length || !talentSchedule.length)) throw new Error("Jadwal pembayaran buyer dan talent wajib ada sebelum deal dikunci.");
      const response = await fetch("/api/internal-demo/admin/commercial-terms", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          briefId,
          talentId,
          buyerPrice: buyerAmount,
          talentPayable: talentAmount,
          directCosts: directAmount,
          taxesAndPaymentFees: taxAmount,
          buyerPaymentSchedule: normalizeRows(buyerSchedule),
          talentPaymentSchedule: normalizeRows(talentSchedule),
          riderNotes,
          cancellationTerms,
          specialConditions,
          notes,
          status,
        }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.detail ?? body?.error ?? "Gagal menyimpan Deal Sheet");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menyimpan Deal Sheet");
    } finally {
      setBusy(null);
    }
  }

  function ScheduleEditor({ party, rows }: { party: "buyer" | "talent"; rows: Milestone[] }) {
    const total = party === "buyer" ? buyerAmount : talentAmount;
    return (
      <div className="mt-3 space-y-3">
        {rows.length === 0 ? <p className="border border-dashed border-black/20 p-4 text-sm text-black/50">Belum ada jadwal pembayaran.</p> : null}
        {rows.map((row, index) => {
          const resolved = scheduleAmount(rows, total)[index]?.resolvedAmount ?? 0;
          return (
            <div key={`${party}-${index}`} className="border border-black/10 bg-[#f8f7f3] p-4">
              <div className="grid gap-3 md:grid-cols-6">
                <label className="text-xs font-semibold">Tahap
                  <select disabled={locked} value={row.milestone_type} onChange={(e) => updateRow(party, index, { milestone_type: e.target.value })} className="mt-1 w-full border border-black/15 bg-white p-2 font-normal">
                    <option value="booking_fee">Booking Fee</option><option value="deposit">DP</option><option value="balance">Pelunasan</option><option value="full_payment">Full Payment</option><option value="other">Lainnya</option>
                  </select>
                </label>
                <label className="text-xs font-semibold">Perhitungan
                  <select disabled={locked} value={row.calculation_type} onChange={(e) => updateRow(party, index, { calculation_type: e.target.value as Milestone["calculation_type"], percentage: null, amount: null })} className="mt-1 w-full border border-black/15 bg-white p-2 font-normal">
                    <option value="percentage">Persentase</option><option value="fixed_amount">Nominal</option><option value="remaining_balance">Sisa</option>
                  </select>
                </label>
                <label className="text-xs font-semibold">Nilai
                  {row.calculation_type === "percentage" ? <input disabled={locked} type="number" min="0" max="100" value={row.percentage ?? ""} onChange={(e) => updateRow(party, index, { percentage: e.target.value === "" ? null : Number(e.target.value) })} className="mt-1 w-full border border-black/15 bg-white p-2 font-normal" placeholder="%" /> : row.calculation_type === "fixed_amount" ? <input disabled={locked} inputMode="numeric" value={row.amount ?? ""} onChange={(e) => updateRow(party, index, { amount: e.target.value === "" ? null : Number(digitsOnly(e.target.value)) })} className="mt-1 w-full border border-black/15 bg-white p-2 font-normal" placeholder="Rp" /> : <div className="mt-1 border border-black/10 bg-white p-2 font-normal">Sisa</div>}
                </label>
                <label className="text-xs font-semibold">Acuan Jatuh Tempo
                  <select disabled={locked} value={row.due_basis} onChange={(e) => updateRow(party, index, { due_basis: e.target.value as Milestone["due_basis"] })} className="mt-1 w-full border border-black/15 bg-white p-2 font-normal">
                    <option value="booking_date">Tanggal Booking</option><option value="event_date">Tanggal Acara</option><option value="event_completion">Acara Selesai</option><option value="invoice_date">Tanggal Invoice</option><option value="custom_date">Tanggal Khusus</option>
                  </select>
                </label>
                <label className="text-xs font-semibold">Offset Hari
                  <input disabled={locked} type="number" value={row.due_offset_days} onChange={(e) => updateRow(party, index, { due_offset_days: Number(e.target.value) || 0 })} className="mt-1 w-full border border-black/15 bg-white p-2 font-normal" />
                </label>
                <div className="text-xs font-semibold">Nilai Terhitung<div className="mt-1 border border-black/10 bg-white p-2 font-normal">{money(resolved)}</div></div>
              </div>
              <div className="mt-3 flex items-center justify-between gap-3">
                <label className="text-xs"><input disabled={locked} type="checkbox" checked={row.refundable === true} onChange={(e) => updateRow(party, index, { refundable: e.target.checked })} className="mr-2" />Refundable</label>
                {!locked ? <button type="button" onClick={() => removeRow(party, index)} className="text-xs font-semibold underline">Hapus tahap</button> : null}
              </div>
            </div>
          );
        })}
        {!locked ? <button type="button" onClick={() => (party === "buyer" ? setBuyerSchedule((r) => [...r, newMilestone(r.length + 1)]) : setTalentSchedule((r) => [...r, newMilestone(r.length + 1)]))} className="border border-black/20 bg-white px-3 py-2 text-xs font-semibold">+ Tambah Tahap</button> : null}
      </div>
    );
  }

  return (
    <section className="mt-7 border border-black/10 bg-white p-5 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><p className="text-sm font-semibold">Deal Sheet</p><p className="mt-1 text-xs text-black/45">Snapshot transaksi untuk {talentName}. Policy profil hanya menjadi default; deal ini dapat diubah sebelum dikunci.</p></div>
        {locked ? <span className="bg-black px-3 py-2 text-xs font-semibold text-white">✓ Deal Dikunci</span> : <span className="border border-black/15 px-3 py-2 text-xs font-semibold">DRAFT</span>}
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <label className="text-sm font-semibold">Harga ke Buyer (Rp)<input disabled={locked} value={buyerPrice} onChange={(e) => setBuyerPrice(e.target.value)} inputMode="numeric" className="mt-2 w-full border border-black/15 px-3 py-3 font-normal disabled:bg-black/5" /></label>
        <label className="text-sm font-semibold">Fee Talent Disepakati (Rp)<input disabled={locked} value={talentPayable} onChange={(e) => setTalentPayable(e.target.value)} inputMode="numeric" className="mt-2 w-full border border-black/15 px-3 py-3 font-normal disabled:bg-black/5" /></label>
        <label className="text-sm font-semibold">Biaya Langsung / Rider (Rp)<input disabled={locked} value={directCosts} onChange={(e) => setDirectCosts(e.target.value)} inputMode="numeric" className="mt-2 w-full border border-black/15 px-3 py-3 font-normal disabled:bg-black/5" /></label>
        <label className="text-sm font-semibold">Pajak & Payment Fee (Rp)<input disabled={locked} value={taxFees} onChange={(e) => setTaxFees(e.target.value)} inputMode="numeric" className="mt-2 w-full border border-black/15 px-3 py-3 font-normal disabled:bg-black/5" /></label>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <div className="border border-black/10 bg-[#f5f3ee] p-4"><p className="text-xs font-semibold uppercase tracking-[0.12em] text-black/40">Contribution Margin</p><p className="mt-2 text-2xl font-semibold">{money(contribution)}</p></div>
        <div className="border border-black/10 bg-[#f5f3ee] p-4"><p className="text-xs font-semibold uppercase tracking-[0.12em] text-black/40">Funding Gap</p><p className="mt-2 text-2xl font-semibold">{fundingGap == null ? "Belum dapat dihitung" : fundingGap.unknown ? "Perlu review" : fundingGap.maxGap > 0 ? money(fundingGap.maxGap) : "AMAN"}</p><p className="mt-1 text-xs text-black/45">Berdasarkan urutan jadwal buyer vs kewajiban talent. Invoice/custom timing yang belum pasti memerlukan review manual.</p></div>
      </div>

      <div className="mt-6 border-t border-black/10 pt-5"><p className="text-sm font-semibold">Jadwal Pembayaran Talent</p><p className="mt-1 text-xs text-black/45">{talentPolicyTemplates.length ? "Diprefill dari policy profil talent. Edit hanya jika hasil negosiasi booking ini berbeda." : "Belum ada policy profil; jadwal deal wajib ditetapkan manual."}</p><ScheduleEditor party="talent" rows={talentSchedule} /></div>
      <div className="mt-6 border-t border-black/10 pt-5"><p className="text-sm font-semibold">Jadwal Pembayaran Buyer</p><p className="mt-1 text-xs text-black/45">Tidak ada persentase universal. Susun sesuai buyer/PO/kontrak transaksi ini.</p><ScheduleEditor party="buyer" rows={buyerSchedule} /></div>

      <div className="mt-6 grid gap-4">
        <label className="text-sm font-semibold">Rider / Travel / Expense Notes<textarea disabled={locked} value={riderNotes} onChange={(e) => setRiderNotes(e.target.value)} rows={2} className="mt-2 w-full border border-black/15 px-3 py-3 font-normal disabled:bg-black/5" placeholder="Apa yang termasuk fee, transport, hotel, equipment, overtime, dll." /></label>
        <label className="text-sm font-semibold">Cancellation / Postponement<textarea disabled={locked} value={cancellationTerms} onChange={(e) => setCancellationTerms(e.target.value)} rows={2} className="mt-2 w-full border border-black/15 px-3 py-3 font-normal disabled:bg-black/5" placeholder="Isi sesuai kesepakatan deal/kontrak; jangan gunakan aturan universal." /></label>
        <label className="text-sm font-semibold">Special Conditions<textarea disabled={locked} value={specialConditions} onChange={(e) => setSpecialConditions(e.target.value)} rows={2} className="mt-2 w-full border border-black/15 px-3 py-3 font-normal disabled:bg-black/5" placeholder="Kondisi khusus yang berlaku untuk booking ini." /></label>
        <label className="text-sm font-semibold">Catatan Internal<textarea disabled={locked} value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="mt-2 w-full border border-black/15 px-3 py-3 font-normal disabled:bg-black/5" /></label>
      </div>

      {!locked ? <div className="mt-5 flex flex-wrap gap-2"><button onClick={() => save("draft")} disabled={busy !== null} className="border border-black/20 bg-white px-4 py-2 text-sm font-semibold disabled:opacity-40">{busy === "draft" ? "Menyimpan…" : "Simpan Draft Deal"}</button><button onClick={() => save("agreed")} disabled={busy !== null} className="border border-black bg-black px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">{busy === "agreed" ? "Mengunci…" : "Kunci Deal Disepakati"}</button></div> : null}
      {error ? <p className="mt-3 text-xs font-semibold text-red-700">{error}</p> : null}
    </section>
  );
}
