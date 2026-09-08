"use client";

import { useMemo, useState } from "react";

import {
  SUPPLY_CATEGORIES,
  SUPPLY_TYPE_LABELS,
  type SupplyType,
} from "@/lib/supply-onboarding";

export function AdminNewSupplyInvite() {
  const [supplyType, setSupplyType] = useState<SupplyType>("talent");
  const categories = useMemo(() => SUPPLY_CATEGORIES[supplyType], [supplyType]);
  const [category, setCategory] = useState<string>(SUPPLY_CATEGORIES.talent[0]);
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function changeSupplyType(next: SupplyType) {
    setSupplyType(next);
    setCategory(SUPPLY_CATEGORIES[next][0]);
    setUrl(null);
    setMessage(null);
    setError(null);
  }

  async function createInvite() {
    setBusy(true);
    setError(null);
    setMessage(null);
    setUrl(null);
    try {
      const response = await fetch("/api/internal-demo/admin/access-link", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          scope: "talent_onboarding",
          createNewTalent: true,
          supplyType,
          category,
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.detail ?? data?.error ?? "Gagal membuat link pendaftaran");
      setUrl(data.url);
      const copied = await navigator.clipboard?.writeText(data.url).then(() => true).catch(() => false);
      setMessage(copied ? "Link baru dibuat dan sudah disalin." : "Link baru dibuat. Salin link di bawah ini.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal membuat link pendaftaran");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto] md:items-end">
      <label className="text-xs font-semibold uppercase tracking-[0.12em] text-black/55">
        Jenis supply
        <select
          value={supplyType}
          onChange={(event) => changeSupplyType(event.target.value as SupplyType)}
          className="mt-2 w-full border border-black/15 bg-white px-3 py-2.5 text-sm font-medium normal-case tracking-normal text-black"
        >
          {(Object.keys(SUPPLY_TYPE_LABELS) as SupplyType[]).map((value) => (
            <option key={value} value={value}>{SUPPLY_TYPE_LABELS[value]}</option>
          ))}
        </select>
      </label>
      <label className="text-xs font-semibold uppercase tracking-[0.12em] text-black/55">
        Kategori
        <select
          value={category}
          onChange={(event) => setCategory(event.target.value)}
          className="mt-2 w-full border border-black/15 bg-white px-3 py-2.5 text-sm font-medium normal-case tracking-normal text-black"
        >
          {categories.map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
      </label>
      <button
        type="button"
        disabled={busy || !category}
        onClick={createInvite}
        className="border border-black bg-black px-4 py-2.5 text-xs font-semibold text-white disabled:opacity-40"
      >
        {busy ? "Membuat…" : "Buat Link Pendaftaran Baru"}
      </button>
      <div className="md:col-span-3">
        <p className="text-xs text-black/45">Satu link untuk satu profil/PIC dan berlaku 7 hari. Jenis supply dan kategori dikunci dari admin.</p>
        {url ? <p className="mt-2 max-w-full break-all text-xs text-black/60">{url}</p> : null}
        {message ? <p className="mt-2 text-xs font-semibold text-green-700">{message}</p> : null}
        {error ? <p className="mt-2 text-xs font-semibold text-red-700">{error}</p> : null}
      </div>
    </div>
  );
}
