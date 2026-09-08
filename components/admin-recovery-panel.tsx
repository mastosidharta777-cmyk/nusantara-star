"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import type { RecoveryCase } from "@/lib/recovery-data";

type Incident = {
  id: string;
  incident_type: string;
  summary: string;
  status: "open" | "resolved";
};

const statusLabel: Record<RecoveryCase["status"], string> = {
  matching: "Mencari kandidat pengganti",
  confirming: "Konfirmasi kandidat",
  buyer_selection: "Menunggu pilihan buyer",
  replacement_selected: "Pengganti dipilih",
  reconciling: "Rekonsiliasi komersial",
  replacement_secured: "Pengganti terjamin",
  closed_no_replacement: "Ditutup tanpa pengganti",
  void: "Dibatalkan",
};

const reconciliationLabel: Record<RecoveryCase["financial_reconciliation_status"], string> = {
  pending: "Belum diperiksa",
  ready: "Siap",
  completed: "Selesai",
  not_required: "Tidak diperlukan",
};

export function AdminRecoveryPanel({
  bookingId,
  bookingStatus,
  incidents,
  recoveryCase,
  currentBriefId,
  dealLocked = false,
}: {
  bookingId: string;
  bookingStatus: string;
  incidents: Incident[];
  recoveryCase: RecoveryCase | null;
  currentBriefId: string;
  dealLocked?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [reconciliationStatus, setReconciliationStatus] = useState<"ready" | "not_required">("ready");
  const talentCancellation = incidents.find((item) => item.status === "open" && item.incident_type === "talent_cancellation");
  const originalBriefId = typeof recoveryCase?.original_booking_snapshot?.brief_id === "string" ? recoveryCase.original_booking_snapshot.brief_id : null;
  const originalTalentName = typeof recoveryCase?.original_booking_snapshot?.talent_name === "string" ? recoveryCase.original_booking_snapshot.talent_name : "Talent awal";
  const isRecoveryBrief = recoveryCase?.recovery_brief_id === currentBriefId;

  async function postAction(payload: Record<string, unknown>, busyKey: string) {
    setBusy(busyKey);
    setError(null);
    try {
      const response = await fetch("/api/internal-demo/admin/operations/recovery", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error ?? body?.detail ?? "Aksi recovery gagal");
      setNotes("");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Aksi recovery gagal");
    } finally {
      setBusy(null);
    }
  }

  async function openRecovery() {
    if (!talentCancellation) return;
    await postAction({
      action: "open",
      bookingId,
      incidentId: talentCancellation.id,
      reason: talentCancellation.summary,
    }, "open");
  }

  if (!recoveryCase && (!talentCancellation || bookingStatus !== "incident")) return null;

  return (
    <section className="mt-7 border border-black/10 bg-white p-5 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">Pemulihan Talent Pengganti</p>
          <p className="mt-1 text-xs leading-5 text-black/45">Booking awal tetap terkunci. Kandidat pengganti harus melalui konfirmasi ketersediaan, penawaran, pilihan buyer, rekonsiliasi, dan booking terjamin.</p>
        </div>
        {recoveryCase ? <span className="border border-black/15 px-3 py-2 text-xs font-semibold uppercase">{statusLabel[recoveryCase.status]}</span> : null}
      </div>

      {!recoveryCase && talentCancellation ? (
        <div className="mt-5 border border-black/10 p-4">
          <p className="text-sm font-semibold">Pembatalan oleh talent tercatat</p>
          <p className="mt-1 text-sm text-black/60">{talentCancellation.summary}</p>
          <button onClick={openRecovery} disabled={busy !== null} className="mt-4 bg-black px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">
            {busy === "open" ? "Membuka recovery…" : "Cari talent pengganti"}
          </button>
        </div>
      ) : null}

      {recoveryCase ? (
        <div className="mt-5 grid gap-3 md:grid-cols-3">
          <div className="border border-black/10 p-3 text-sm"><span className="text-black/45">Talent awal</span><br /><strong>{originalTalentName}</strong></div>
          <div className="border border-black/10 p-3 text-sm"><span className="text-black/45">Kandidat snapshot</span><br /><strong>{recoveryCase.match_count == null ? "Belum dibuat" : recoveryCase.match_count}</strong></div>
          <div className="border border-black/10 p-3 text-sm"><span className="text-black/45">Rekonsiliasi</span><br /><strong>{reconciliationLabel[recoveryCase.financial_reconciliation_status]}</strong></div>
        </div>
      ) : null}

      {recoveryCase ? (
        <div className="mt-4 flex flex-wrap gap-3">
          {!isRecoveryBrief ? <Link href={`/admin/briefs/${recoveryCase.recovery_brief_id}`} className="border border-black px-4 py-2 text-sm font-semibold">Buka Recovery Brief</Link> : null}
          {isRecoveryBrief && originalBriefId ? <Link href={`/admin/briefs/${originalBriefId}`} className="border border-black px-4 py-2 text-sm font-semibold">Kembali ke booking awal</Link> : null}
        </div>
      ) : null}

      {recoveryCase && isRecoveryBrief && recoveryCase.status === "replacement_selected" && dealLocked ? (
        <div className="mt-5 border-t border-black/10 pt-5">
          <p className="text-sm font-semibold">Gate rekonsiliasi sebelum booking pengganti diamankan</p>
          <p className="mt-1 text-xs leading-5 text-black/45">Tandai hanya setelah dampak komersial booking lama dan deal pengganti sudah diperiksa. Sistem tidak menghitung atau menyetujui fakta finansial secara otomatis.</p>
          <div className="mt-3 grid gap-2 md:grid-cols-[220px_1fr_auto]">
            <select value={reconciliationStatus} onChange={(e) => setReconciliationStatus(e.target.value as "ready" | "not_required")} className="border border-black/15 p-2 text-sm">
              <option value="ready">Siap untuk dilanjutkan</option>
              <option value="not_required">Tidak ada penyesuaian tambahan</option>
            </select>
            <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Catatan pemeriksaan rekonsiliasi" className="border border-black/15 p-2 text-sm" />
            <button onClick={() => postAction({ action: "mark_reconciliation_ready", caseId: recoveryCase.id, reconciliationStatus, notes }, "reconcile")} disabled={busy !== null || !notes.trim()} className="bg-black px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">{busy === "reconcile" ? "Menyimpan…" : "Tandai siap"}</button>
          </div>
        </div>
      ) : null}

      {recoveryCase && isRecoveryBrief && recoveryCase.status === "matching" && recoveryCase.matching_generated_at && recoveryCase.match_count === 0 ? (
        <div className="mt-5 border-t border-black/10 pt-5">
          <p className="text-sm font-semibold">Tidak ada kandidat pengganti pada snapshot</p>
          <p className="mt-1 text-xs text-black/45">Penutupan membutuhkan catatan manusia. Setelah ditutup, booking lama dapat masuk proses pembatalan/rekonsiliasi sesuai ketentuan yang disetujui.</p>
          <div className="mt-3 grid gap-2 md:grid-cols-[1fr_auto]">
            <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Alasan recovery ditutup tanpa pengganti" className="border border-black/15 p-2 text-sm" />
            <button onClick={() => postAction({ action: "close_no_replacement", caseId: recoveryCase.id, notes }, "close")} disabled={busy !== null || !notes.trim()} className="border border-black px-4 py-2 text-sm font-semibold disabled:opacity-40">{busy === "close" ? "Menutup…" : "Tutup tanpa pengganti"}</button>
          </div>
        </div>
      ) : null}

      {error ? <p className="mt-4 text-xs font-semibold text-red-700">{error}</p> : null}
    </section>
  );
}
