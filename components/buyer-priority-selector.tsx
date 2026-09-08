"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import type { BuyerPreferenceRow } from "@/lib/buyer-priority";

type Option = {
  talentId: string;
  proposalItemId: string;
  name: string;
};

export function BuyerPrioritySelector({
  briefId,
  proposalId,
  locale,
  options,
  preferences,
  locked,
  accessToken,
}: {
  briefId: string;
  proposalId: string;
  locale: "id" | "en";
  options: Option[];
  preferences: BuyerPreferenceRow[];
  locked: boolean;
  accessToken?: string | null;
}) {
  const router = useRouter();
  const isId = locale === "id";
  const maxRanks = Math.min(3, options.length);
  const initialRanks = Array.from({ length: maxRanks }, (_, index) => preferences.find((item) => item.priority_rank === index + 1)?.talent_id ?? "");
  const [ranks, setRanks] = useState<string[]>(initialRanks);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const optionByTalent = useMemo(() => new Map(options.map((item) => [item.talentId, item])), [options]);
  const hasSavedPreferences = preferences.length > 0;

  function setRank(index: number, talentId: string) {
    setRanks((current) => {
      const next = [...current];
      next[index] = talentId;
      for (let i = 0; i < next.length; i += 1) {
        if (i !== index && talentId && next[i] === talentId) next[i] = "";
      }
      if (!talentId) {
        for (let i = index + 1; i < next.length; i += 1) next[i] = "";
      }
      return next;
    });
  }

  async function save() {
    const rankedTalentIds = ranks.filter(Boolean);
    if (!rankedTalentIds.length) return;

    const priorities = rankedTalentIds.map((talentId, index) => {
      const option = optionByTalent.get(talentId);
      if (!option) throw new Error(isId ? "Pilihan talent tidak valid" : "Invalid talent option");
      return {
        proposalItemId: option.proposalItemId,
        talentId: option.talentId,
        priorityRank: index + 1,
      };
    });

    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/internal-demo/buyer/select-talent", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ briefId, proposalId, priorities, accessToken }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.detail ?? body?.error ?? (isId ? "Gagal menyimpan urutan pilihan" : "Failed to save priority order"));
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : (isId ? "Gagal menyimpan urutan pilihan" : "Failed to save priority order"));
    } finally {
      setBusy(false);
    }
  }

  if (locked && hasSavedPreferences) {
    return (
      <section className="mt-8 border border-black/10 bg-white p-5 md:p-6">
        <p className="text-sm font-semibold">{isId ? "Urutan pilihan Anda" : "Your priority order"}</p>
        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          {preferences.map((preference) => (
            <div key={preference.id} className="border border-black/10 p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-black/40">{isId ? `Pilihan #${preference.priority_rank}` : `Priority #${preference.priority_rank}`}</p>
              <p className="mt-2 text-sm font-semibold">{optionByTalent.get(preference.talent_id)?.name ?? "—"}</p>
            </div>
          ))}
        </div>
        <p className="mt-4 text-xs leading-5 text-black/45">{isId ? "Urutan sudah terkunci karena proses deal atau booking telah dimulai. Hanya satu talent yang dapat menjadi booking terjamin." : "The order is locked because deal or booking processing has started. Only one talent can become the secured booking."}</p>
      </section>
    );
  }

  return (
    <section className="mt-8 border border-black/10 bg-white p-5 md:p-6">
      <p className="text-sm font-semibold">{isId ? "Urutkan pilihan talent" : "Rank your talent choices"}</p>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-black/55">
        {isId
          ? "Pilihan #1 akan dilanjutkan terlebih dahulu. Pilihan #2 dan #3 hanya menjadi fallback bila pilihan di atasnya tidak dapat dilanjutkan setelah pemeriksaan validitas atau konfirmasi ulang. Ini tidak membuat booking paralel."
          : "Priority #1 advances first. Priorities #2 and #3 are fallbacks only if a higher choice cannot proceed after validity checks or reconfirmation. This does not create parallel bookings."}
      </p>

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        {Array.from({ length: maxRanks }, (_, index) => {
          const rank = index + 1;
          const disabled = index > 0 && !ranks[index - 1];
          return (
            <label key={rank} className="block">
              <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-black/40">{isId ? `Pilihan #${rank}` : `Priority #${rank}`}</span>
              <select
                value={ranks[index] ?? ""}
                onChange={(event) => setRank(index, event.target.value)}
                disabled={disabled || busy}
                className="w-full border border-black/15 bg-white p-3 text-sm disabled:bg-black/5 disabled:text-black/35"
              >
                <option value="">{rank === 1 ? (isId ? "Pilih talent utama" : "Choose primary talent") : (isId ? "Tidak memilih fallback" : "No fallback")}</option>
                {options.map((option) => {
                  const usedElsewhere = ranks.some((value, valueIndex) => valueIndex !== index && value === option.talentId);
                  return <option key={option.talentId} value={option.talentId} disabled={usedElsewhere}>{option.name}</option>;
                })}
              </select>
            </label>
          );
        })}
      </div>

      <button
        type="button"
        onClick={save}
        disabled={busy || !ranks[0]}
        className="mt-5 border border-black bg-black px-5 py-3 text-sm font-semibold text-white disabled:opacity-40"
      >
        {busy ? (isId ? "Menyimpan…" : "Saving…") : hasSavedPreferences ? (isId ? "Perbarui urutan pilihan" : "Update priority order") : (isId ? "Simpan urutan pilihan" : "Save priority order")}
      </button>
      {hasSavedPreferences ? <p className="mt-3 text-xs text-black/45">{isId ? "Urutan yang tersimpan dapat diperbarui sampai proses deal dimulai." : "The saved order can be updated until deal processing starts."}</p> : null}
      {error ? <p className="mt-3 text-xs font-semibold text-red-700">{error}</p> : null}
    </section>
  );
}
