"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import type { BuyerPreferenceRow } from "@/lib/buyer-priority";

type Props = {
  briefId: string;
  preferences: BuyerPreferenceRow[];
  locked: boolean;
};

function statusLabel(status: BuyerPreferenceRow["status"]) {
  const labels: Record<BuyerPreferenceRow["status"], string> = {
    ranked: "Tersimpan",
    active_priority: "Aktif",
    fallback: "Fallback",
    withdrawn: "Tidak aktif",
    superseded: "Digantikan",
    secured: "Secured",
  };
  return labels[status];
}

export function AdminBuyerPriorityFallback({ briefId, preferences, locked }: Props) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const active = useMemo(() => preferences.find((item) => item.status === "active_priority") ?? null, [preferences]);
  const remainingFallbacks = useMemo(
    () => preferences.filter((item) => item.status === "fallback" && (!active || item.priority_rank > active.priority_rank)),
    [preferences, active],
  );
  const canAttemptPromotion = Boolean(active && remainingFallbacks.length > 0 && !locked);

  async function promote() {
    if (!canAttemptPromotion || !reason.trim()) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/internal-demo/admin/buyer-priority-fallback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ briefId, reason: reason.trim() }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error ?? "Promosi fallback gagal");
      setMessage(`Fallback #${body?.toPriorityRank ?? "berikutnya"} berhasil menjadi pilihan aktif.`);
      setReason("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Promosi fallback gagal");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-5 border border-black/10 bg-white">
      <div className="border-b border-black/10 px-5 py-4">
        <p className="text-sm font-semibold">Prioritas Pilihan Buyer</p>
        <p className="mt-1 text-xs leading-5 text-black/45">
          Urutan ini berasal dari buyer. Sistem hanya boleh mempromosikan fallback jika pilihan aktif sudah tidak valid menurut ketersediaan dan penawaran terbaru.
        </p>
      </div>

      <div className="divide-y divide-black/10">
        {preferences.map((item) => (
          <div key={item.id} className="flex items-center justify-between gap-4 px-5 py-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-black/40">Pilihan #{item.priority_rank}</p>
              <p className="mt-1 text-sm font-semibold">{item.talent_name ?? item.talent_id}</p>
            </div>
            <span className="border border-black/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.1em]">
              {statusLabel(item.status)}
            </span>
          </div>
        ))}
      </div>

      <div className="border-t border-black/10 px-5 py-5">
        {locked ? (
          <p className="text-sm text-black/55">Terkunci karena Deal Review atau booking sudah dimulai. Pergantian talent harus mengikuti flow transaksi/recovery yang sesuai.</p>
        ) : !active ? (
          <p className="text-sm text-black/55">Tidak ada pilihan aktif yang dapat diproses.</p>
        ) : remainingFallbacks.length === 0 ? (
          <p className="text-sm text-black/55">Tidak ada fallback berikutnya dalam urutan buyer.</p>
        ) : (
          <>
            <label className="block text-xs font-semibold uppercase tracking-[0.12em] text-black/45">Alasan pilihan aktif tidak dapat dilanjutkan</label>
            <textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              rows={3}
              maxLength={1000}
              placeholder="Contoh: manager mengubah status menjadi tidak tersedia."
              className="mt-2 w-full border border-black/20 p-3 text-sm outline-none focus:border-black"
            />
            <p className="mt-2 text-xs leading-5 text-black/45">
              Saat dijalankan, sistem mengecek ulang pilihan aktif, lalu mencari fallback berikutnya yang masih memiliki availability dan offer valid. Pilihan aktif yang masih valid tidak dapat ditimpa admin.
            </p>
            <button
              type="button"
              disabled={busy || !reason.trim()}
              onClick={promote}
              className="mt-4 bg-black px-4 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy ? "Memeriksa..." : "Promosikan Fallback Berikutnya"}
            </button>
          </>
        )}
        {message ? <p className="mt-3 text-sm font-semibold">{message}</p> : null}
        {error ? <p className="mt-3 text-sm text-red-700">{error}</p> : null}
      </div>
    </section>
  );
}
