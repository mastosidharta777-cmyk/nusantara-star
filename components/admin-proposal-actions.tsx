"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function AdminProposalActions({ briefId, status }: { briefId: string; status: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function markSent() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/internal-demo/admin/proposal-sent", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ briefId }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.detail ?? body?.error ?? "Action failed");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-7 border border-black/10 bg-white p-5 md:p-6">
      <p className="text-sm font-semibold">Buyer Proposal / Daftar Pilihan</p>
      <p className="mt-1 text-xs text-black/45">Preview bilingual untuk dikirim ke buyer setelah talent disetujui dan tersedia.</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Link href={`/id/proposal/${briefId}`} className="border border-black bg-black px-4 py-2 text-sm font-semibold text-white">
          Buka Versi Indonesia
        </Link>
        <Link href={`/en/proposal/${briefId}`} className="border border-black/20 bg-white px-4 py-2 text-sm font-semibold">
          Open English Version
        </Link>
        <button
          type="button"
          onClick={markSent}
          disabled={busy || status === "proposal_sent"}
          className="border border-black/20 bg-[#f5f3ee] px-4 py-2 text-sm font-semibold disabled:opacity-40"
        >
          {status === "proposal_sent" ? "Proposal Sudah Dikirim" : busy ? "Menyimpan…" : "Tandai Proposal Dikirim"}
        </button>
      </div>
      {error ? <p className="mt-2 text-xs font-semibold text-red-700">{error}</p> : null}
    </section>
  );
}
