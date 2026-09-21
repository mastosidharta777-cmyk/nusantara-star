"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import type { LaunchMode } from "@/lib/launch-control";

export function AdminTalentPublicationControl({
  talentId,
  initialPublicVisible,
  canPrepare,
  launchMode,
}: {
  talentId: string;
  initialPublicVisible: boolean;
  canPrepare: boolean;
  launchMode: LaunchMode;
}) {
  const router = useRouter();
  const [publicVisible, setPublicVisible] = useState(initialPublicVisible);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const live = launchMode === "live";

  async function change(next: boolean) {
    setBusy(true); setMessage(""); setError("");
    try {
      const response = await fetch("/api/internal-demo/admin/talent-publication", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ talentId, publicVisible: next }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.detail ?? body?.error ?? "Status publik tidak dapat diubah");
      setPublicVisible(next);
      setMessage(next
        ? (live ? "Talent tampil di katalog publik." : "Talent disiapkan untuk katalog; masih tertutup sampai Launch Mode diaktifkan.")
        : "Talent ditarik dari katalog publik.");
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Status publik tidak dapat diubah");
    } finally { setBusy(false); }
  }

  const label = publicVisible ? (live ? "Tampil publik" : "Siap tayang setelah launch") : "Internal saja";
  return <section className="mt-5 border border-black/10 bg-white p-5 md:p-6">
    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-black/40">Kontrol publikasi</p>
    <p className="mt-2 text-sm font-semibold">{label}</p>
    <p className="mt-2 text-sm leading-6 text-black/55">
      {live
        ? "Profil yang disiapkan tampil pada katalog. Menariknya kembali langsung menyembunyikan profil."
        : "Situs masih Coming Soon. Menyiapkan profil di sini tidak membuka URL, katalog, atau brief buyer sebelum Launch Mode diaktifkan."}
    </p>
    {!canPrepare ? <p className="mt-4 border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">Lengkapi dan setujui onboarding terlebih dahulu. Sistem juga mengecek foto dan media penampilan saat profil disiapkan.</p> : null}
    <div className="mt-4 flex flex-wrap gap-3">
      {publicVisible
        ? <button disabled={busy} onClick={() => change(false)} className="border border-black px-4 py-3 text-sm font-semibold disabled:opacity-40">Tarik dari publik</button>
        : <button disabled={busy || !canPrepare} onClick={() => change(true)} className="border border-black bg-black px-4 py-3 text-sm font-semibold text-white disabled:opacity-40">Siapkan untuk publik</button>}
    </div>
    {message ? <p className="mt-4 text-sm font-semibold text-green-800">{message}</p> : null}
    {error ? <p className="mt-4 text-sm font-semibold text-red-700">{error}</p> : null}
  </section>;
}
