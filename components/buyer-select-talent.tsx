"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function BuyerSelectTalent({ briefId, talentId, proposalItemId, locale, selected, accessToken }: { briefId: string; talentId: string; proposalItemId: string; locale: "id" | "en"; selected: boolean; accessToken?: string | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isId = locale === "id";

  async function chooseTalent() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/internal-demo/buyer/select-talent", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ briefId, talentId, proposalItemId, accessToken }) });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.detail ?? body?.error ?? (isId ? "Gagal memilih talent" : "Failed to select talent"));
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : (isId ? "Gagal memilih talent" : "Failed to select talent"));
    } finally { setBusy(false); }
  }

  return <div className="mt-5"><button type="button" onClick={chooseTalent} disabled={busy || selected} className={selected ? "w-full border border-black bg-black px-4 py-3 text-sm font-semibold text-white" : "w-full border border-black px-4 py-3 text-sm font-semibold transition hover:bg-black hover:text-white disabled:opacity-50"}>{selected ? (isId ? "✓ Talent dipilih" : "✓ Talent selected") : busy ? (isId ? "Menyimpan…" : "Saving…") : (isId ? "Pilih talent ini" : "Select this talent")}</button>{error ? <p className="mt-2 text-xs font-semibold text-red-700">{error}</p> : null}</div>;
}
