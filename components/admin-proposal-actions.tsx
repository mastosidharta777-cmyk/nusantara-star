"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { SecureAccessLinkButton } from "@/components/secure-access-link-button";

type Candidate = {
  talentId: string;
  name: string;
  eventFee: number;
  currency: string;
  quoteValidUntil: string | null;
};

function money(value: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value);
}

export function AdminProposalActions({ briefId, status }: { briefId: string; status: string }) {
  const router = useRouter();
  const sent = status === "proposal_sent";
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(!sent);
  const [error, setError] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [buyerPrices, setBuyerPrices] = useState<Record<string, string>>({});

  useEffect(() => {
    if (sent) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/internal-demo/admin/proposal-sent?briefId=${encodeURIComponent(briefId)}`);
        const body = await response.json().catch(() => null);
        if (!response.ok) throw new Error(body?.detail ?? body?.error ?? "Gagal memuat kandidat proposal");
        if (!cancelled) setCandidates(Array.isArray(body?.candidates) ? body.candidates : []);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Gagal memuat kandidat proposal");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [briefId, sent]);

  async function approveAndSend() {
    setBusy(true);
    setError(null);
    try {
      const normalizedPrices: Record<string, number> = {};
      for (const candidate of candidates) {
        const price = Number(buyerPrices[candidate.talentId]);
        if (!Number.isSafeInteger(price) || price <= 0) throw new Error(`Isi harga ke klien untuk ${candidate.name}`);
        if (price < candidate.eventFee) throw new Error(`Harga ke klien untuk ${candidate.name} tidak boleh di bawah fee talent pada alur V1 ini`);
        normalizedPrices[candidate.talentId] = price;
      }
      const response = await fetch("/api/internal-demo/admin/proposal-sent", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ briefId, buyerPrices: normalizedPrices }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.detail ?? body?.error ?? "Gagal membuat proposal");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal membuat proposal");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-7 border border-black/10 bg-white p-5 md:p-6">
      <p className="text-sm font-semibold">Proposal klien / daftar pilihan</p>
      <p className="mt-1 text-xs text-black/45">Harga talent di bawah hanya untuk internal. Isi harga jual ke klien, lalu setujui dan kirim proposal. Harga buyer tidak lagi dibuat otomatis dari fee talent.</p>

      {!sent ? (
        <div className="mt-5 grid gap-3">
          {loading ? <p className="text-sm text-black/50">Memuat kandidat proposal…</p> : null}
          {!loading && candidates.length === 0 ? <p className="text-sm text-black/50">Belum ada talent approved dengan offer confirmed yang masih berlaku.</p> : null}
          {candidates.map((candidate) => (
            <div key={candidate.talentId} className="grid gap-3 border border-black/10 bg-[#f5f3ee] p-4 md:grid-cols-[1fr_220px] md:items-end">
              <div>
                <p className="font-semibold">{candidate.name}</p>
                <p className="mt-1 text-xs text-black/50">Fee talent internal: {money(candidate.eventFee)}</p>
                {candidate.quoteValidUntil ? <p className="mt-1 text-xs text-black/40">Offer berlaku sampai {new Date(candidate.quoteValidUntil).toLocaleString("id-ID")}</p> : null}
              </div>
              <label className="text-sm">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.1em] text-black/45">Harga ke klien (Rp)</span>
                <input type="number" min={candidate.eventFee} step="1" value={buyerPrices[candidate.talentId] ?? ""} onChange={(event) => setBuyerPrices((current) => ({ ...current, [candidate.talentId]: event.target.value }))} className="w-full border border-black/20 bg-white px-3 py-2" placeholder="Isi harga jual" />
              </label>
            </div>
          ))}
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        {sent ? <SecureAccessLinkButton scope="buyer_proposal" subjectId={briefId} label="Buka tautan aman klien" /> : null}
        <button type="button" onClick={approveAndSend} disabled={busy || sent || loading || candidates.length === 0} className={sent ? "cursor-default border border-black/20 bg-[#f5f3ee] px-4 py-2 text-sm font-semibold" : "border border-black bg-black px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"}>
          {sent ? "✓ Proposal sudah dikirim" : busy ? "Menyimpan…" : "Setujui & kirim proposal"}
        </button>
      </div>
      {sent ? <p className="mt-2 text-xs font-semibold text-black/55">Status: proposal dikirim</p> : null}
      {error ? <p className="mt-2 text-xs font-semibold text-red-700">{error}</p> : null}
    </section>
  );
}
