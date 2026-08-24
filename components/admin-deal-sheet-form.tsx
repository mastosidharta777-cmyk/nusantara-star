"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

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

function digits(value: string) { return value.replace(/\D/g, ""); }
function amount(value: string) { const d = digits(value); return d ? Number(d) : 0; }
function normalize(rows: Milestone[]) { return rows.map((row, index) => ({ ...row, sequence_no: index + 1 })); }
function newMilestone(sequence: number): Milestone {
  return { milestone_type: sequence === 1 ? "deposit" : "balance", sequence_no: sequence, calculation_type: sequence === 1 ? "percentage" : "remaining_balance", percentage: null, amount: null, due_basis: sequence === 1 ? "booking_date" : "event_date", due_offset_days: 0, custom_due_date: null, refundable: null, cancellation_note: null, notes: null };
}

export function AdminDealSheetForm({ briefId, talentId, talentName, initialTerms, talentPolicyTemplates }: {
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
  const [talentSchedule, setTalentSchedule] = useState<Milestone[]>(initialTerms?.talent_payment_schedule?.length ? initialTerms.talent_payment_schedule : talentPolicyTemplates.map(({ id: _id, negotiable: _negotiable, ...row }) => row));
  const [cancellationTerms, setCancellationTerms] = useState(initialTerms?.cancellation_terms ?? "");
  const [riderNotes, setRiderNotes] = useState(initialTerms?.rider_notes ?? "");
  const [specialConditions, setSpecialConditions] = useState(initialTerms?.special_conditions ?? "");
  const [notes, setNotes] = useState(initialTerms?.notes ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateRow(party: "buyer" | "talent", index: number, patch: Partial<Milestone>) {
    const setter = party === "buyer" ? setBuyerSchedule : setTalentSchedule;
    setter((rows) => normalize(rows.map((row, i) => i === index ? { ...row, ...patch } : row)));
  }

  function removeRow(party: "buyer" | "talent", index: number) {
    const setter = party === "buyer" ? setBuyerSchedule : setTalentSchedule;
    setter((rows) => normalize(rows.filter((_, i) => i !== index)));
  }

  async function save() {
    setBusy(true); setError(null);
    try {
      const response = await fetch("/api/internal-demo/admin/commercial-terms", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ briefId, talentId, buyerPrice: amount(buyerPrice), talentPayable: amount(talentPayable), directCosts: amount(directCosts), taxesAndPaymentFees: amount(taxFees), buyerPaymentSchedule: normalize(buyerSchedule), talentPaymentSchedule: normalize(talentSchedule), cancellationTerms, riderNotes, specialConditions, notes, status: "draft" }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.detail ?? body?.error ?? "Gagal menyimpan detail deal");
      router.refresh();
    } catch (err) { setError(err instanceof Error ? err.message : "Gagal menyimpan detail deal"); }
    finally { setBusy(false); }
  }

  function ScheduleEditor({ party, rows }: { party: "buyer" | "talent"; rows: Milestone[] }) {
    return <div className="mt-3 space-y-3">
      {rows.map((row, index) => <div key={`${party}-${index}`} className="border border-black/10 bg-[#f8f7f3] p-4">
        <div className="grid gap-3 md:grid-cols-5">
          <label className="text-xs font-semibold">Tahap<select disabled={locked} value={row.milestone_type} onChange={(e) => updateRow(party, index, { milestone_type: e.target.value })} className="mt-1 w-full border border-black/15 bg-white p-2 font-normal"><option value="booking_fee">Booking Fee</option><option value="deposit">DP</option><option value="balance">Pelunasan</option><option value="full_payment">Full Payment</option><option value="other">Lainnya</option></select></label>
          <label className="text-xs font-semibold">Perhitungan<select disabled={locked} value={row.calculation_type} onChange={(e) => updateRow(party, index, { calculation_type: e.target.value as Milestone["calculation_type"], percentage: null, amount: null })} className="mt-1 w-full border border-black/15 bg-white p-2 font-normal"><option value="percentage">Persentase</option><option value="fixed_amount">Nominal</option><option value="remaining_balance">Sisa</option></select></label>
          <label className="text-xs font-semibold">Nilai{row.calculation_type === "percentage" ? <input disabled={locked} type="number" min="0" max="100" value={row.percentage ?? ""} onChange={(e) => updateRow(party, index, { percentage: e.target.value === "" ? null : Number(e.target.value) })} className="mt-1 w-full border border-black/15 bg-white p-2 font-normal" /> : row.calculation_type === "fixed_amount" ? <input disabled={locked} value={row.amount ?? ""} onChange={(e) => updateRow(party, index, { amount: e.target.value === "" ? null : Number(digits(e.target.value)) })} className="mt-1 w-full border border-black/15 bg-white p-2 font-normal" /> : <div className="mt-1 border border-black/10 bg-white p-2 font-normal">Sisa</div>}</label>
          <label className="text-xs font-semibold">Acuan<select disabled={locked} value={row.due_basis} onChange={(e) => updateRow(party, index, { due_basis: e.target.value as Milestone["due_basis"] })} className="mt-1 w-full border border-black/15 bg-white p-2 font-normal"><option value="booking_date">Tanggal Booking</option><option value="event_date">Tanggal Acara</option><option value="event_completion">Acara Selesai</option><option value="invoice_date">Tanggal Invoice</option><option value="custom_date">Tanggal Khusus</option></select></label>
          <label className="text-xs font-semibold">Offset Hari<input disabled={locked} type="number" value={row.due_offset_days} onChange={(e) => updateRow(party, index, { due_offset_days: Number(e.target.value) || 0 })} className="mt-1 w-full border border-black/15 bg-white p-2 font-normal" /></label>
        </div>
        {row.due_basis === "custom_date" ? <label className="mt-3 block text-xs font-semibold">Tanggal Khusus<input disabled={locked} type="date" value={row.custom_due_date ?? ""} onChange={(e) => updateRow(party, index, { custom_due_date: e.target.value || null })} className="mt-1 border border-black/15 bg-white p-2 font-normal" /></label> : null}
        {!locked ? <button type="button" onClick={() => removeRow(party, index)} className="mt-3 text-xs font-semibold underline">Hapus tahap</button> : null}
      </div>)}
      {!locked ? <button type="button" onClick={() => (party === "buyer" ? setBuyerSchedule((r) => [...r, newMilestone(r.length + 1)]) : setTalentSchedule((r) => [...r, newMilestone(r.length + 1)]))} className="border border-black/20 bg-white px-3 py-2 text-xs font-semibold">+ Tambah Tahap</button> : null}
    </div>;
  }

  return <section className="border border-black/10 bg-white p-5 md:p-6">
    <p className="text-sm font-semibold">Advanced Deal Details</p>
    <p className="mt-1 text-xs text-black/45">Edit hanya bila perlu. Funding gap final dihitung server-side oleh Deal Copilot, bukan di browser.</p>
    <div className="mt-5 grid gap-4 md:grid-cols-2">
      <label className="text-sm font-semibold">Harga ke Buyer<input disabled={locked} value={buyerPrice} onChange={(e) => setBuyerPrice(e.target.value)} className="mt-2 w-full border border-black/15 p-3 font-normal" /></label>
      <label className="text-sm font-semibold">Fee Talent<input disabled={locked} value={talentPayable} onChange={(e) => setTalentPayable(e.target.value)} className="mt-2 w-full border border-black/15 p-3 font-normal" /></label>
      <label className="text-sm font-semibold">Direct Costs<input disabled={locked} value={directCosts} onChange={(e) => setDirectCosts(e.target.value)} className="mt-2 w-full border border-black/15 p-3 font-normal" /></label>
      <label className="text-sm font-semibold">Pajak / Payment Fee<input disabled={locked} value={taxFees} onChange={(e) => setTaxFees(e.target.value)} className="mt-2 w-full border border-black/15 p-3 font-normal" /></label>
    </div>
    <div className="mt-6"><p className="text-sm font-semibold">Jadwal Buyer</p><ScheduleEditor party="buyer" rows={buyerSchedule} /></div>
    <div className="mt-6"><p className="text-sm font-semibold">Jadwal Talent</p><ScheduleEditor party="talent" rows={talentSchedule} /></div>
    <div className="mt-6 grid gap-3 md:grid-cols-2">
      <textarea disabled={locked} value={cancellationTerms} onChange={(e) => setCancellationTerms(e.target.value)} placeholder="Cancellation terms" className="min-h-24 border border-black/15 p-3 text-sm" />
      <textarea disabled={locked} value={riderNotes} onChange={(e) => setRiderNotes(e.target.value)} placeholder="Rider notes" className="min-h-24 border border-black/15 p-3 text-sm" />
      <textarea disabled={locked} value={specialConditions} onChange={(e) => setSpecialConditions(e.target.value)} placeholder="Special conditions" className="min-h-24 border border-black/15 p-3 text-sm" />
      <textarea disabled={locked} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Internal notes" className="min-h-24 border border-black/15 p-3 text-sm" />
    </div>
    {!locked ? <button type="button" onClick={save} disabled={busy} className="mt-5 border border-black bg-black px-4 py-3 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Menyimpan…" : "Simpan Advanced Details"}</button> : null}
    {error ? <p className="mt-3 text-sm font-semibold text-red-700">{error}</p> : null}
  </section>;
}
