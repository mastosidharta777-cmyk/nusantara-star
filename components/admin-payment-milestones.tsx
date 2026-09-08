type Milestone = {
  id: string; party: "buyer" | "talent"; milestone_type: string; sequence_no: number; calculation_type: string;
  percentage: number | null; amount: number | null; due_basis: string; due_offset_days: number; custom_due_date: string | null;
  refundable: boolean | null; cancellation_note: string | null; status: string;
};

function money(value: number | null) {
  if (value == null) return "—";
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value);
}
function milestoneTypeLabel(value: string) {
  if (value === "booking_fee") return "Biaya booking";
  if (value === "deposit") return "Uang muka (DP)";
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
  return value.replaceAll("_", " ");
}
function dueLabel(item: Milestone) {
  if (item.due_basis === "custom_date") return item.custom_due_date ?? "Tanggal khusus";
  const offset = item.due_offset_days;
  if (item.due_basis === "booking_date") return offset === 0 ? "Saat booking" : offset < 0 ? `H${offset} sebelum tanggal booking` : `H+${offset} setelah tanggal booking`;
  if (item.due_basis === "event_date") return offset === 0 ? "Hari acara" : offset < 0 ? `H${offset} sebelum acara` : `H+${offset} setelah hari acara`;
  if (item.due_basis === "event_completion") return offset === 0 ? "Saat acara selesai" : offset < 0 ? `H${offset} sebelum acara selesai` : `H+${offset} setelah acara selesai`;
  return offset === 0 ? "Tanggal tagihan" : offset < 0 ? `H${offset} sebelum tanggal tagihan` : `H+${offset} setelah tanggal tagihan`;
}
function valueLabel(item: Milestone) {
  if (item.calculation_type === "percentage") return `${item.percentage}%`;
  if (item.calculation_type === "fixed_amount") return money(item.amount);
  return "Sisa pembayaran";
}

export function AdminPaymentMilestones({ milestones }: { bookingId: string; milestones: Milestone[] }) {
  return <section className="mt-7 border border-black/10 bg-white p-5 md:p-6">
    <div>
      <p className="text-sm font-semibold">Jadwal Pembayaran</p>
      <p className="mt-1 text-xs leading-5 text-black/45">Jadwal ini adalah snapshot dari Deal yang sudah dikunci. Nilai dan tahapan kontraktual tidak dapat ditambah atau diubah setelah booking dibuat.</p>
    </div>
    <div className="mt-5 grid gap-5 lg:grid-cols-2">{(["buyer", "talent"] as const).map((group) => <div key={group} className="border border-black/10 p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-black/45">{group === "buyer" ? "Jadwal Pembayaran Klien" : "Jadwal Pembayaran Talent"}</p>
      <div className="mt-3 space-y-2">{milestones.filter((item) => item.party === group).length === 0 ? <p className="text-sm text-black/45">Belum ada tahapan pembayaran.</p> : milestones.filter((item) => item.party === group).sort((a,b)=>a.sequence_no-b.sequence_no).map((item)=><div key={item.id} className="border border-black/10 bg-[#f5f3ee] p-3 text-sm"><div className="flex justify-between gap-3"><span className="font-semibold">{item.sequence_no}. {milestoneTypeLabel(item.milestone_type)}</span><span>{valueLabel(item)}</span></div><p className="mt-1 text-black/55">Jatuh tempo: {dueLabel(item)}</p><p className="mt-1 text-black/45">Dapat dikembalikan: {item.refundable === true ? "Ya" : item.refundable === false ? "Tidak" : "Belum ditentukan"} · Status: {statusLabel(item.status)}</p>{item.cancellation_note ? <p className="mt-1 text-black/45">Ketentuan pembatalan: {item.cancellation_note}</p> : null}</div>)}</div>
    </div>)}</div>
  </section>;
}
