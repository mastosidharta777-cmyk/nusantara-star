"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { SecureAccessLinkButton } from "@/components/secure-access-link-button";

type Candidate = {
  talentId: string;
  name: string;
  eventFee: number;
  currency: string;
  talentPaymentTerms: string | null;
  includedCosts: string | null;
  excludedCosts: string | null;
  riderExceptions: string | null;
  quoteValidUntil: string | null;
};

type BreakdownDraft = {
  talentFee: string;
  transport: string;
  accommodation: string;
  technicalRider: string;
  taxesFees: string;
  other: string;
  otherLabel: string;
};

function money(value: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value);
}

function asAmount(value: string | undefined) {
  if (!value?.trim()) return 0;
  const amount = Number(value);
  return Number.isSafeInteger(amount) && amount >= 0 ? amount : NaN;
}

function emptyBreakdown(eventFee: number): BreakdownDraft {
  return {
    talentFee: String(eventFee),
    transport: "",
    accommodation: "",
    technicalRider: "",
    taxesFees: "",
    other: "",
    otherLabel: "",
  };
}

export function AdminProposalActions({ briefId, status }: { briefId: string; status: string }) {
  const router = useRouter();
  const sent = status === "proposal_sent";
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(!sent);
  const [error, setError] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [breakdowns, setBreakdowns] = useState<Record<string, BreakdownDraft>>({});
  const [buyerPaymentTerms, setBuyerPaymentTerms] = useState("");

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
        const nextCandidates = Array.isArray(body?.candidates) ? body.candidates as Candidate[] : [];
        if (!cancelled) {
          setCandidates(nextCandidates);
          setBreakdowns((current) => {
            const next = { ...current };
            for (const candidate of nextCandidates) {
              if (!next[candidate.talentId]) next[candidate.talentId] = emptyBreakdown(candidate.eventFee);
            }
            return next;
          });
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Gagal memuat kandidat proposal");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [briefId, sent]);

  const totals = useMemo(() => {
    const result: Record<string, number> = {};
    for (const candidate of candidates) {
      const row = breakdowns[candidate.talentId] ?? emptyBreakdown(candidate.eventFee);
      const values = [row.talentFee, row.transport, row.accommodation, row.technicalRider, row.taxesFees, row.other].map(asAmount);
      result[candidate.talentId] = values.every(Number.isFinite) ? values.reduce((sum, value) => sum + value, 0) : 0;
    }
    return result;
  }, [breakdowns, candidates]);

  function setField(talentId: string, field: keyof BreakdownDraft, value: string) {
    setBreakdowns((current) => ({
      ...current,
      [talentId]: {
        ...(current[talentId] ?? emptyBreakdown(candidates.find((item) => item.talentId === talentId)?.eventFee ?? 0)),
        [field]: value,
      },
    }));
  }

  async function approveAndSend() {
    setBusy(true);
    setError(null);
    try {
      const terms = buyerPaymentTerms.trim();
      if (!terms) throw new Error("Isi ketentuan pembayaran yang akan dilihat klien");

      const buyerBreakdowns: Record<string, {
        talentFee: number;
        transport: number;
        accommodation: number;
        technicalRider: number;
        taxesFees: number;
        other: number;
        otherLabel: string | null;
      }> = {};

      for (const candidate of candidates) {
        const row = breakdowns[candidate.talentId] ?? emptyBreakdown(candidate.eventFee);
        const talentFee = asAmount(row.talentFee);
        const transport = asAmount(row.transport);
        const accommodation = asAmount(row.accommodation);
        const technicalRider = asAmount(row.technicalRider);
        const taxesFees = asAmount(row.taxesFees);
        const other = asAmount(row.other);
        const amounts = [talentFee, transport, accommodation, technicalRider, taxesFees, other];
        if (amounts.some((value) => !Number.isFinite(value))) throw new Error(`Ada nominal tidak valid untuk ${candidate.name}`);
        if (talentFee < candidate.eventFee) throw new Error(`Talent Fee ke klien untuk ${candidate.name} tidak boleh di bawah fee yang dikonfirmasi talent/manager`);
        if (other > 0 && !row.otherLabel.trim()) throw new Error(`Beri nama biaya lainnya untuk ${candidate.name}`);
        const total = amounts.reduce((sum, value) => sum + value, 0);
        if (!Number.isSafeInteger(total) || total <= 0) throw new Error(`Total penawaran tidak valid untuk ${candidate.name}`);

        buyerBreakdowns[candidate.talentId] = {
          talentFee,
          transport,
          accommodation,
          technicalRider,
          taxesFees,
          other,
          otherLabel: other > 0 ? row.otherLabel.trim().slice(0, 120) : null,
        };
      }

      const response = await fetch("/api/internal-demo/admin/proposal-sent", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ briefId, buyerBreakdowns, buyerPaymentTerms: terms }),
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
      <p className="mt-1 text-xs leading-5 text-black/45">Fee talent/manager tetap internal. Susun harga jual buyer per komponen agar travel, hotel, technical rider, dan pajak tidak tercampur menjadi satu angka yang menyesatkan.</p>

      {!sent ? (
        <div className="mt-5 grid gap-4">
          <label className="text-sm">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.1em] text-black/45">Ketentuan pembayaran ke klien</span>
            <textarea value={buyerPaymentTerms} onChange={(event) => setBuyerPaymentTerms(event.target.value)} className="min-h-20 w-full border border-black/20 bg-white px-3 py-2" placeholder="Contoh: DP 50% untuk mengunci tanggal, pelunasan H-7." />
          </label>
          {loading ? <p className="text-sm text-black/50">Memuat kandidat proposal…</p> : null}
          {!loading && candidates.length === 0 ? <p className="text-sm text-black/50">Belum ada talent approved dengan offer confirmed yang masih berlaku.</p> : null}

          {candidates.map((candidate) => {
            const row = breakdowns[candidate.talentId] ?? emptyBreakdown(candidate.eventFee);
            return (
              <div key={candidate.talentId} className="border border-black/10 bg-[#f5f3ee] p-4">
                <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-start">
                  <div>
                    <p className="font-semibold">{candidate.name}</p>
                    <p className="mt-1 text-xs text-black/50">Fee talent/manager internal: {money(candidate.eventFee)}</p>
                    <p className="mt-1 text-xs text-black/50">Terms internal: {candidate.talentPaymentTerms ?? "—"}</p>
                    {candidate.includedCosts ? <p className="mt-2 text-xs leading-5 text-black/50"><strong>Termasuk menurut manager:</strong> {candidate.includedCosts}</p> : null}
                    {candidate.excludedCosts ? <p className="mt-1 text-xs leading-5 text-black/50"><strong>Belum termasuk:</strong> {candidate.excludedCosts}</p> : null}
                    {candidate.riderExceptions ? <p className="mt-1 text-xs leading-5 text-black/50"><strong>Catatan rider:</strong> {candidate.riderExceptions}</p> : null}
                    {candidate.quoteValidUntil ? <p className="mt-1 text-xs text-black/40">Offer berlaku sampai {new Date(candidate.quoteValidUntil).toLocaleString("id-ID")}</p> : null}
                  </div>
                  <div className="border border-black/15 bg-white px-4 py-3 text-right">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-black/40">Total ke buyer</p>
                    <p className="mt-1 text-xl font-semibold">{money(totals[candidate.talentId] ?? 0)}</p>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {[
                    ["Talent Fee ke buyer", "talentFee"],
                    ["Transport / local transfer", "transport"],
                    ["Akomodasi", "accommodation"],
                    ["Technical / backline / rider", "technicalRider"],
                    ["Pajak / payment fee", "taxesFees"],
                    ["Biaya lain", "other"],
                  ].map(([label, field]) => (
                    <label key={field} className="text-sm">
                      <span className="mb-1 block text-xs font-semibold text-black/55">{label}</span>
                      <input
                        type="number"
                        min={field === "talentFee" ? candidate.eventFee : 0}
                        step="1"
                        value={row[field as keyof BreakdownDraft]}
                        onChange={(event) => setField(candidate.talentId, field as keyof BreakdownDraft, event.target.value)}
                        className="w-full border border-black/20 bg-white px-3 py-2"
                        placeholder="0"
                      />
                    </label>
                  ))}
                </div>
                {asAmount(row.other) > 0 ? (
                  <label className="mt-3 block text-sm">
                    <span className="mb-1 block text-xs font-semibold text-black/55">Nama biaya lain</span>
                    <input value={row.otherLabel} onChange={(event) => setField(candidate.talentId, "otherLabel", event.target.value)} maxLength={120} className="w-full border border-black/20 bg-white px-3 py-2" placeholder="Contoh: per diem, visa, security, freight" />
                  </label>
                ) : null}
              </div>
            );
          })}
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
