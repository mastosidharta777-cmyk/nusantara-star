"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import type { TalentMedia, TalentPaymentPolicyTemplate } from "@/lib/admin-talent-detail";

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

function mediaTypeLabel(value: string) {
  if (value === "live_performance") return "Live performance";
  if (value === "showreel") return "Showreel";
  if (value === "event_clip") return "Cuplikan acara";
  return "Lainnya";
}

export function AdminTalentCommercialProfile({ talentId, policies, media }: { talentId: string; policies: TalentPaymentPolicyTemplate[]; media: TalentMedia[] }) {
  const router = useRouter();
  const nextSequence = useMemo(() => (policies.length ? Math.max(...policies.map((item) => item.sequence_no)) + 1 : 1), [policies]);
  const nextMediaOrder = useMemo(() => (media.length ? Math.max(...media.map((item) => item.sort_order)) + 1 : 1), [media]);

  const [milestoneType, setMilestoneType] = useState("deposit");
  const [calculationType, setCalculationType] = useState("percentage");
  const [percentage, setPercentage] = useState("25");
  const [amount, setAmount] = useState("");
  const [dueBasis, setDueBasis] = useState("booking_date");
  const [dueOffsetDays, setDueOffsetDays] = useState("0");
  const [refundability, setRefundability] = useState("unspecified");
  const [negotiable, setNegotiable] = useState(true);
  const [cancellationNote, setCancellationNote] = useState("");

  const [mediaType, setMediaType] = useState("live_performance");
  const [provider, setProvider] = useState("youtube_unlisted");
  const [mediaUrl, setMediaUrl] = useState("");
  const [mediaTitle, setMediaTitle] = useState("");
  const [buyerVisible, setBuyerVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function post(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/internal-demo/admin/talent-commercial-profile", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ talentId, ...body }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.detail ?? data?.error ?? "Gagal menyimpan data");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menyimpan data");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-7">
      <section className="border border-black/10 bg-white p-5 md:p-6">
        <div>
          <p className="text-sm font-semibold">Kebijakan Pembayaran Talent</p>
          <p className="mt-1 text-xs text-black/45">Default dari talent/management. Saat booking, sistem akan memakai ini sebagai draft dan admin dapat menyesuaikan jika ada kesepakatan khusus.</p>
        </div>
        <div className="mt-5 space-y-2">
          {policies.length === 0 ? <p className="text-sm text-black/45">Belum ada kebijakan pembayaran.</p> : policies.map((item) => (
            <div key={item.id} className="border border-black/10 bg-[#f5f3ee] p-3 text-sm">
              <div className="flex justify-between gap-3"><span className="font-semibold">{item.sequence_no}. {typeLabel(item.milestone_type)}</span><span>{paymentValue(item)}</span></div>
              <p className="mt-1 text-black/55">Jatuh tempo: {dueLabel(item)}</p>
              <p className="mt-1 text-black/45">Dapat dikembalikan: {item.refundable === true ? "Ya" : item.refundable === false ? "Tidak" : "Belum ditentukan"} · Dapat dinegosiasikan: {item.negotiable ? "Ya" : "Tidak"}</p>
              {item.cancellation_note ? <p className="mt-1 text-black/45">{item.cancellation_note}</p> : null}
            </div>
          ))}
        </div>

        <div className="mt-5 border-t border-black/10 pt-5">
          <p className="text-sm font-semibold">Tambah Kebijakan Pembayaran</p>
          <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <label className="text-sm font-semibold">Jenis pembayaran<select value={milestoneType} onChange={(e) => setMilestoneType(e.target.value)} className="mt-2 w-full border border-black/15 bg-white px-3 py-3 font-normal"><option value="booking_fee">Biaya booking</option><option value="deposit">DP</option><option value="balance">Pelunasan</option><option value="full_payment">Pembayaran penuh</option><option value="other">Lainnya</option></select></label>
            <label className="text-sm font-semibold">Perhitungan<select value={calculationType} onChange={(e) => setCalculationType(e.target.value)} className="mt-2 w-full border border-black/15 bg-white px-3 py-3 font-normal"><option value="percentage">Persentase</option><option value="fixed_amount">Nominal tetap</option><option value="remaining_balance">Sisa pembayaran</option></select></label>
            {calculationType === "percentage" ? <label className="text-sm font-semibold">Persentase (%)<input value={percentage} onChange={(e) => setPercentage(e.target.value)} inputMode="decimal" className="mt-2 w-full border border-black/15 px-3 py-3 font-normal" /></label> : null}
            {calculationType === "fixed_amount" ? <label className="text-sm font-semibold">Nominal (Rp)<input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="numeric" className="mt-2 w-full border border-black/15 px-3 py-3 font-normal" /></label> : null}
            <label className="text-sm font-semibold">Acuan jatuh tempo<select value={dueBasis} onChange={(e) => setDueBasis(e.target.value)} className="mt-2 w-full border border-black/15 bg-white px-3 py-3 font-normal"><option value="booking_date">Tanggal booking</option><option value="event_date">Tanggal acara</option><option value="event_completion">Acara selesai</option><option value="invoice_date">Tanggal invoice</option></select></label>
            <label className="text-sm font-semibold">Selisih hari<input value={dueOffsetDays} onChange={(e) => setDueOffsetDays(e.target.value)} inputMode="numeric" className="mt-2 w-full border border-black/15 px-3 py-3 font-normal" /><span className="mt-1 block text-xs font-normal text-black/45">Contoh: -1 = H-1, 0 = hari acuan, 7 = H+7.</span></label>
            <label className="text-sm font-semibold">Dapat dikembalikan?<select value={refundability} onChange={(e) => setRefundability(e.target.value)} className="mt-2 w-full border border-black/15 bg-white px-3 py-3 font-normal"><option value="unspecified">Belum ditentukan</option><option value="yes">Ya</option><option value="no">Tidak</option></select></label>
            <label className="flex items-center gap-2 pt-8 text-sm font-semibold"><input type="checkbox" checked={negotiable} onChange={(e) => setNegotiable(e.target.checked)} /> Dapat dinegosiasikan</label>
          </div>
          <label className="mt-4 block text-sm font-semibold">Ketentuan pembatalan<input value={cancellationNote} onChange={(e) => setCancellationNote(e.target.value)} placeholder="Contoh: biaya booking hangus jika buyer membatalkan" className="mt-2 w-full border border-black/15 px-3 py-3 font-normal" /></label>
          <button disabled={busy} onClick={() => post({ action: "add_payment_policy", milestoneType, sequenceNo: nextSequence, calculationType, percentage: calculationType === "percentage" ? Number(percentage) : null, amount: calculationType === "fixed_amount" ? Number(amount.replace(/\D/g, "")) : null, dueBasis, dueOffsetDays: Number(dueOffsetDays), refundable: refundability === "yes" ? true : refundability === "no" ? false : null, negotiable, cancellationNote })} className="mt-4 border border-black bg-black px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">{busy ? "Menyimpan…" : "Tambah Kebijakan"}</button>
        </div>
      </section>

      <section className="border border-black/10 bg-white p-5 md:p-6">
        <div>
          <p className="text-sm font-semibold">Media & Showreel Kurasi</p>
          <p className="mt-1 text-xs text-black/45">Gunakan video yang dikendalikan Nusantara Star. Tautan sosial talent tidak ditampilkan ke buyer dari bagian ini.</p>
        </div>
        <div className="mt-5 space-y-2">
          {media.length === 0 ? <p className="text-sm text-black/45">Belum ada media kurasi.</p> : media.map((item) => (
            <div key={item.id} className="border border-black/10 bg-[#f5f3ee] p-3 text-sm">
              <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between"><span className="font-semibold">{item.sort_order}. {item.title || mediaTypeLabel(item.media_type)}</span><span className="text-black/45">Tampil ke buyer: {item.buyer_visible ? "Ya" : "Tidak"}</span></div>
              <p className="mt-1 break-all text-black/55">{item.media_url}</p>
            </div>
          ))}
        </div>
        <div className="mt-5 border-t border-black/10 pt-5">
          <p className="text-sm font-semibold">Tambah Media Kurasi</p>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <label className="text-sm font-semibold">Jenis media<select value={mediaType} onChange={(e) => setMediaType(e.target.value)} className="mt-2 w-full border border-black/15 bg-white px-3 py-3 font-normal"><option value="live_performance">Live performance</option><option value="showreel">Showreel</option><option value="event_clip">Cuplikan acara</option><option value="other">Lainnya</option></select></label>
            <label className="text-sm font-semibold">Sumber<select value={provider} onChange={(e) => setProvider(e.target.value)} className="mt-2 w-full border border-black/15 bg-white px-3 py-3 font-normal"><option value="youtube_unlisted">YouTube Unlisted Nusantara Star</option><option value="internal_storage">Penyimpanan internal</option></select></label>
            <label className="text-sm font-semibold">Judul<input value={mediaTitle} onChange={(e) => setMediaTitle(e.target.value)} className="mt-2 w-full border border-black/15 px-3 py-3 font-normal" /></label>
            <label className="text-sm font-semibold">Tautan video<input value={mediaUrl} onChange={(e) => setMediaUrl(e.target.value)} placeholder="https://..." className="mt-2 w-full border border-black/15 px-3 py-3 font-normal" /></label>
            <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={buyerVisible} onChange={(e) => setBuyerVisible(e.target.checked)} /> Sudah disetujui untuk buyer</label>
          </div>
          <button disabled={busy} onClick={() => post({ action: "add_media", mediaType, provider, mediaUrl, title: mediaTitle, buyerVisible, sortOrder: nextMediaOrder })} className="mt-4 border border-black bg-black px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">{busy ? "Menyimpan…" : "Tambah Media"}</button>
        </div>
      </section>
      {error ? <p className="text-sm font-semibold text-red-700">{error}</p> : null}
    </div>
  );
}
