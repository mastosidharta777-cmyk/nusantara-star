"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function BuyerSelectTalent({
  briefId,
  talentId,
  locale,
  selected,
}: {
  briefId: string;
  talentId: string;
  locale: "id" | "en";
  selected: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isId = locale === "id";

  async function chooseTalent() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/internal-demo/buyer/select-talent", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ briefId, talentId }),
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
    <div className="mt-5">
      <button
        type="button"
        onClick={chooseTalent}
        disabled={busy || selected}
        className={
          selected
            ? "w-full border border-black bg-black px-4 py-3 text-sm font-semibold text-white"
            : "w-full border border-black px-4 py-3 text-sm font-semibold transition hover:bg-black hover:text-white disabled:opacity-50"
        }
      >
        {selected
          ? isId
            ? "✓ Talent Dipilih"
            : "✓ Talent Selected"
          : busy
            ? isId
              ? "Menyimpan…"
              : "Saving…"
            : isId
              ? "Pilih Talent Ini"
              : "Select This Talent"}
      </button>
      {error ? <p className="mt-2 text-xs font-semibold text-red-700">{error}</p> : null}
    </div>
  );
}
