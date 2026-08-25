"use client";

import { useState } from "react";

type Match = {
  talent: { id: string; name: string; category: string; genres: string[]; baseCity: string; budgetMin: number; budgetMax: number; reliabilityScore: number };
  score: number;
  tier: string;
  breakdown: Record<string, number>;
  availabilityStatus: string;
  freshness: string;
  requiresLiveConfirmation: boolean;
  reasons: string[];
};

type Result = {
  source: string;
  rosterSource: string;
  rosterSize: number;
  brief: any;
  matches: Match[];
  error?: string;
  detail?: string;
};

const sample = "Cari band cover untuk corporate di Jakarta, Top 40 Rock, bisa acoustic saat dinner lalu full band, upbeat, singalong.";

function rupiah(value: number) {
  if (!value) return "—";
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value);
}

export default function MatchingTestPage() {
  const [text, setText] = useState(sample);
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function run() {
    setBusy(true); setError(""); setResult(null);
    try {
      const res = await fetch(`/api/internal-demo/match?text=${encodeURIComponent(text)}`, { cache: "no-store" });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.detail ?? data?.error ?? "Matching gagal");
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Matching gagal");
    } finally {
      setBusy(false);
    }
  }

  return <main className="min-h-screen bg-[#f5f3ee] px-5 py-10 text-[#171713] md:px-10">
    <div className="mx-auto max-w-5xl">
      <a href="/admin" className="text-xs font-semibold">← Admin Dashboard</a>
      <p className="mt-8 text-xs font-semibold uppercase tracking-[0.18em] text-[#a94732]">Nusantara Star Internal · Matching Test</p>
      <h1 className="mt-3 text-4xl font-semibold tracking-[-0.03em]">Uji brief → ranking talent</h1>
      <p className="mt-2 text-sm text-black/55">Tidak membuat booking atau mengubah data. Hanya membaca roster dan menjalankan matching.</p>

      <section className="mt-7 border border-black/10 bg-white p-5 md:p-6">
        <label className="block text-sm font-semibold">Brief buyer
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={5} className="mt-2 w-full border border-black/15 px-3 py-3 font-normal" />
        </label>
        <button onClick={run} disabled={busy || !text.trim()} className="mt-4 border border-black bg-black px-5 py-3 text-sm font-semibold text-white disabled:opacity-40">{busy ? "Mencari…" : "Test Matching"}</button>
      </section>

      {error ? <p className="mt-5 border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">{error}</p> : null}

      {result ? <>
        <section className="mt-5 grid gap-3 md:grid-cols-4">
          <div className="border border-black/10 bg-white p-4"><p className="text-[10px] uppercase text-black/40">Category</p><p className="mt-1 font-semibold">{result.brief?.talentCategory ?? "—"}</p></div>
          <div className="border border-black/10 bg-white p-4"><p className="text-[10px] uppercase text-black/40">City</p><p className="mt-1 font-semibold">{result.brief?.city ?? "—"}</p></div>
          <div className="border border-black/10 bg-white p-4"><p className="text-[10px] uppercase text-black/40">Genre / Style</p><p className="mt-1 font-semibold">{(result.brief?.genreStyle ?? []).join(", ") || "—"}</p></div>
          <div className="border border-black/10 bg-white p-4"><p className="text-[10px] uppercase text-black/40">Roster</p><p className="mt-1 font-semibold">{result.rosterSize} talent</p></div>
        </section>

        <section className="mt-5 border border-black/10 bg-white">
          <div className="border-b border-black/10 p-5"><h2 className="text-lg font-semibold">Ranking</h2><p className="mt-1 text-xs text-black/45">AI memahami brief; rules tetap menentukan eligibility dan score.</p></div>
          <div className="p-5">
            {result.matches.length ? <div className="space-y-3">{result.matches.map((m, index) => <div key={m.talent.id} className="border border-black/10 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs text-black/45">#{index + 1} · {m.tier.replaceAll("_", " ")}</p><h3 className="mt-1 text-xl font-semibold">{m.talent.name}</h3><p className="mt-1 text-xs text-black/55">{m.talent.category} · {m.talent.baseCity} · {(m.talent.genres ?? []).join(", ")}</p></div><div className="text-right"><p className="text-3xl font-semibold">{m.score}</p><p className="text-[10px] uppercase text-black/40">match score</p></div></div>
              <p className="mt-3 text-xs">Budget internal: {rupiah(m.talent.budgetMin)} – {rupiah(m.talent.budgetMax)}</p>
              <p className="mt-2 text-xs text-black/55">{m.reasons.join(" · ")}</p>
              <details className="mt-3"><summary className="cursor-pointer text-xs font-semibold">Lihat score breakdown</summary><pre className="mt-2 overflow-auto bg-black/[0.03] p-3 text-[11px]">{JSON.stringify(m.breakdown, null, 2)}</pre></details>
            </div>)}</div> : <p className="text-sm text-black/55">Tidak ada kandidat yang lolos aturan shortlist.</p>}
          </div>
        </section>
      </> : null}
    </div>
  </main>;
}
