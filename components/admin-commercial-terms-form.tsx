"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

type InitialTerms = {
  buyer_price: number;
  talent_payable: number;
  direct_costs: number;
  taxes_and_payment_fees: number;
  payment_terms: string | null;
  buyer_payment_terms: string | null;
  talent_payment_terms: string | null;
  cancellation_terms: string | null;
  notes: string | null;
  status: string;
} | null;

function digitsOnly(value: string) {
  return value.replace(/\D/g, "");
}

function asAmount(value: string) {
  const digits = digitsOnly(value);
  return digits ? Number(digits) : 0;
}

export function AdminCommercialTermsForm({
  briefId,
  talentId,
  talentName,
  initialTerms,
}: {
  briefId: string;
  talentId: string;
  talentName: string;
  initialTerms: InitialTerms;
}) {
  const router = useRouter();
  const [buyerPrice, setBuyerPrice] = useState(String(initialTerms?.buyer_price ?? ""));
  const [talentPayable, setTalentPayable] = useState(String(initialTerms?.talent_payable ?? ""));
  const [directCosts, setDirectCosts] = useState(String(initialTerms?.direct_costs ?? 0));
  const [taxFees, setTaxFees] = useState(String(initialTerms?.taxes_and_payment_fees ?? 0));
  const [buyerPaymentTerms, setBuyerPaymentTerms] = useState(
    initialTerms?.buyer_payment_terms ?? initialTerms?.payment_terms ?? "50% saat konfirmasi, pelunasan sebelum hari acara",
  );
  const [talentPaymentTerms, setTalentPaymentTerms] = useState(initialTerms?.talent_payment_terms ?? "");
  const [cancellationTerms, setCancellationTerms] = useState(initialTerms?.cancellation_terms ?? "Mengikuti terms final yang disetujui buyer dan talent/management");
  const [notes, setNotes] = useState(initialTerms?.notes ?? "");
  const [busy, setBusy] = useState<"draft" | "agreed" | "talent_terms" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const buyerAmount = asAmount(buyerPrice);
  const talentAmount = asAmount(talentPayable);
  const directAmount = asAmount(directCosts);
  const taxAmount = asAmount(taxFees);

  const contribution = useMemo(
    () => buyerAmount - talentAmount - directAmount - taxAmount,
    [buyerAmount, talentAmount, directAmount, taxAmount],
  );

  async function save(status: "draft" | "agreed") {
    setBusy(status);
    setError(null);
    try {
      if (status === "agreed" && (buyerAmount <= 0 || talentAmount <= 0)) {
        throw new Error("Harga buyer dan pembayaran talent wajib lebih dari Rp0 sebelum terms dikunci.");
      }
      if (status === "agreed" && (!buyerPaymentTerms.trim() || !talentPaymentTerms.trim())) {
        throw new Error("Buyer Payment Terms dan Talent Payment Terms wajib ditetapkan sebelum terms dikunci.");
      }

      const response = await fetch("/api/internal-demo/admin/commercial-terms", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          briefId,
          talentId,
          buyerPrice: buyerAmount,
          talentPayable: talentAmount,
          directCosts: directAmount,
          taxesAndPaymentFees: taxAmount,
          buyerPaymentTerms,
          talentPaymentTerms,
          cancellationTerms,
          notes,
          status,
        }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.detail ?? body?.error ?? "Gagal menyimpan commercial terms");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menyimpan commercial terms");
    } finally {
      setBusy(null);
    }
  }

  async function completeLegacyTalentTerms() {
    setBusy("talent_terms");
    setError(null);
    try {
      if (!talentPaymentTerms.trim()) throw new Error("Talent Payment Terms wajib diisi.");
      const response = await fetch("/api/internal-demo/admin/commercial-terms", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "complete_talent_terms",
          briefId,
          talentId,
          talentPaymentTerms,
        }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.detail ?? body?.error ?? "Gagal menyimpan Talent Payment Terms");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menyimpan Talent Payment Terms");
    } finally {
      setBusy(null);
    }
  }

  const locked = initialTerms?.status === "agreed" && initialTerms.buyer_price > 0 && initialTerms.talent_payable > 0;
  const legacyMissingTalentTerms = locked && !initialTerms?.talent_payment_terms;

  return (
    <section className="mt-7 border border-black/10 bg-white p-5 md:p-6">
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-sm font-semibold">Final Fee & Commercial Terms</p>
          <p className="mt-1 text-xs text-black/45">Talent terpilih: {talentName}. Buyer terms dan talent terms dicatat terpisah.</p>
        </div>
        {locked ? <span className="w-fit bg-black px-3 py-2 text-xs font-semibold text-white">✓ Terms Disepakati</span> : initialTerms?.status === "agreed" ? <span className="w-fit border border-red-300 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">Perlu Koreksi Nilai</span> : null}
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <label className="text-sm font-semibold">Harga ke Buyer (Rp)<input disabled={locked} value={buyerPrice} onChange={(e) => setBuyerPrice(e.target.value)} inputMode="numeric" className="mt-2 w-full border border-black/15 px-3 py-3 font-normal disabled:bg-black/5" /></label>
        <label className="text-sm font-semibold">Dibayarkan ke Talent (Rp)<input disabled={locked} value={talentPayable} onChange={(e) => setTalentPayable(e.target.value)} inputMode="numeric" className="mt-2 w-full border border-black/15 px-3 py-3 font-normal disabled:bg-black/5" /></label>
        <label className="text-sm font-semibold">Biaya Langsung (Rp)<input disabled={locked} value={directCosts} onChange={(e) => setDirectCosts(e.target.value)} inputMode="numeric" className="mt-2 w-full border border-black/15 px-3 py-3 font-normal disabled:bg-black/5" /></label>
        <label className="text-sm font-semibold">Pajak & Payment Fee (Rp)<input disabled={locked} value={taxFees} onChange={(e) => setTaxFees(e.target.value)} inputMode="numeric" className="mt-2 w-full border border-black/15 px-3 py-3 font-normal disabled:bg-black/5" /></label>
      </div>

      <div className="mt-4 border border-black/10 bg-[#f5f3ee] p-4">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-black/40">Contribution Margin</p>
        <p className="mt-2 text-2xl font-semibold">Rp {new Intl.NumberFormat("id-ID").format(contribution)}</p>
        <p className="mt-1 text-xs text-black/45">Harga buyer − talent payable − biaya langsung − pajak/payment fee.</p>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <label className="text-sm font-semibold">Buyer Payment Terms<textarea disabled={locked} value={buyerPaymentTerms} onChange={(e) => setBuyerPaymentTerms(e.target.value)} rows={3} className="mt-2 w-full border border-black/15 px-3 py-3 font-normal disabled:bg-black/5" /></label>
        <label className="text-sm font-semibold">Talent Payment Terms<textarea disabled={locked && !legacyMissingTalentTerms} value={talentPaymentTerms} onChange={(e) => setTalentPaymentTerms(e.target.value)} rows={3} placeholder="Contoh: 50% DP, pelunasan H-1 sebelum perform" className="mt-2 w-full border border-black/15 px-3 py-3 font-normal disabled:bg-black/5" /></label>
      </div>
      {legacyMissingTalentTerms ? (
        <div className="mt-3 border border-amber-300 bg-amber-50 p-4">
          <p className="text-xs font-semibold text-amber-800">Booking demo lama: Talent Payment Terms belum ditetapkan. Isi sesuai kesepakatan nyata dengan talent/management; nilai komersial lain tetap terkunci.</p>
          <button onClick={completeLegacyTalentTerms} disabled={busy !== null} className="mt-3 border border-black bg-black px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">
            {busy === "talent_terms" ? "Menyimpan…" : "Simpan Talent Payment Terms"}
          </button>
        </div>
      ) : null}

      <div className="mt-4 grid gap-4">
        <label className="text-sm font-semibold">Cancellation Terms<textarea disabled={locked} value={cancellationTerms} onChange={(e) => setCancellationTerms(e.target.value)} rows={2} className="mt-2 w-full border border-black/15 px-3 py-3 font-normal disabled:bg-black/5" /></label>
        <label className="text-sm font-semibold">Catatan Internal<textarea disabled={locked} value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="mt-2 w-full border border-black/15 px-3 py-3 font-normal disabled:bg-black/5" /></label>
      </div>

      {!locked ? (
        <div className="mt-5 flex flex-wrap gap-2">
          <button onClick={() => save("draft")} disabled={busy !== null} className="border border-black/20 bg-white px-4 py-2 text-sm font-semibold disabled:opacity-40">{busy === "draft" ? "Menyimpan…" : "Simpan Draft"}</button>
          <button onClick={() => save("agreed")} disabled={busy !== null} className="border border-black bg-black px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">{busy === "agreed" ? "Mengunci…" : "Kunci Terms Disepakati"}</button>
        </div>
      ) : null}
      {error ? <p className="mt-3 text-xs font-semibold text-red-700">{error}</p> : null}
    </section>
  );
}
