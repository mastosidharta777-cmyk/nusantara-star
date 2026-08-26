"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { SecureAccessLinkButton } from "@/components/secure-access-link-button";

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
      if (!response.ok) throw new Error(body?.detail ?? body?.error ?? "Gagal memperbarui status proposal");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memperbarui status proposal");
    } finally {
      setBusy(false);
    }
  }

  const sent = status === "proposal_sent";

  return (
    <section className="mt-7 border border-black/10 bg-white p-5 md:p-6">
      <p className="text-sm font-semibold">Proposal klien / daftar pilihan</p>
      <p className="mt-1 text-xs text-black/45">Klien membuka proposal melalui tautan aman yang memiliki masa berlaku, bukan URL publik langsung.</p>
      <div className="mt-4 flex flex-wrap gap-2">
        {sent ? <SecureAccessLinkButton scope="buyer_proposal" subjectId={briefId} label="Buka tautan aman klien" /> : null}
        <button type="button" onClick={markSent} disabled={busy || sent} className={sent ? "cursor-default border border-black/20 bg-[#f5f3ee] px-4 py-2 text-sm font-semibold" : "border border-black bg-black px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"}>
          {sent ? "✓ Proposal sudah dikirim" : busy ? "Menyimpan…" : "Tandai proposal dikirim"}
        </button>
      </div>
      {sent ? <p className="mt-2 text-xs font-semibold text-black/55">Status: proposal dikirim</p> : null}
      {error ? <p className="mt-2 text-xs font-semibold text-red-700">{error}</p> : null}
    </section>
  );
}
