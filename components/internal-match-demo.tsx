"use client";

import { useState } from "react";

type MatchResult = {
  talent: {
    id: string;
    name: string;
    category: string;
    genres: string[];
    baseCity: string;
    budgetMin: number;
    budgetMax: number;
    reliabilityScore: number;
  };
  score: number;
  availabilityStatus: string;
  freshness: string;
  requiresLiveConfirmation: boolean;
  reasons: string[];
};

type ApiResult = {
  source: "ai" | "fallback";
  brief: Record<string, unknown>;
  matches: MatchResult[];
};

const examples = [
  "Corporate dinner 12 September 2026 di Jakarta, 500 orang, butuh band pop energetic, budget 20-30 juta.",
  "Wedding 18 September 2026 di Bali, ingin penyanyi pop/jazz yang elegant, budget maksimal 35 juta.",
  "Brand activation 25 September 2026 di Bandung, audience muda, butuh MC energetic, budget 10-15 juta.",
];

const rupiah = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 });

export function InternalMatchDemo() {
  const [text, setText] = useState(examples[0]);
  const [data, setData] = useState<ApiResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function run() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/internal-demo/match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error ?? "Match failed");
      setData(payload);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Match failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-5 py-12 md:px-10 md:py-16">
      <div className="mb-10">
        <p className="text-[10px] font-bold uppercase tracking-[.2em] text-black/45">Internal Demo</p>
        <h1 className="mt-3 font-display text-5xl md:text-7xl">Brief → Matching</h1>
        <p className="mt-5 max-w-2xl leading-7 text-black/55">
          Demo internal Nusantara Star. Data talent di halaman ini seluruhnya simulasi dan tidak terhubung ke roster publik.
        </p>
      </div>

      <div className="grid gap-8 lg:grid-cols-[.85fr_1.15fr]">
        <section className="border border-black/15 bg-white p-6 md:p-8">
          <label className="text-[10px] font-bold uppercase tracking-[.17em] text-black/55">Event brief</label>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={9}
            className="mt-3 w-full border border-black/20 bg-transparent p-4 leading-7 outline-none focus:border-black"
          />
          <div className="mt-4 space-y-2">
            {examples.map((example) => (
              <button key={example} onClick={() => setText(example)} className="block text-left text-xs leading-5 text-black/50 underline-offset-4 hover:underline">
                {example}
              </button>
            ))}
          </div>
          <button
            onClick={run}
            disabled={loading || !text.trim()}
            className="mt-6 h-13 w-full bg-black px-5 text-xs font-bold uppercase tracking-[.15em] text-white disabled:opacity-40"
          >
            {loading ? "Matching…" : "Run Matching"}
          </button>
          {error && <p className="mt-4 text-sm text-red-700">{error}</p>}
        </section>

        <section className="space-y-5">
          {!data && <div className="border border-dashed border-black/20 p-10 text-sm text-black/45">Run a brief to see structured data and ranked demo talent.</div>}
          {data && (
            <>
              <div className="border border-black/15 bg-white p-5">
                <div className="flex items-center justify-between gap-4">
                  <h2 className="font-display text-2xl">Structured brief</h2>
                  <span className="text-[10px] font-bold uppercase tracking-[.14em] text-black/45">Parser: {data.source}</span>
                </div>
                <pre className="mt-4 overflow-x-auto whitespace-pre-wrap text-xs leading-5 text-black/60">{JSON.stringify(data.brief, null, 2)}</pre>
              </div>

              {data.matches.map((match, index) => (
                <article key={match.talent.id} className="border border-black/15 bg-white p-5 md:p-6">
                  <div className="flex items-start justify-between gap-6">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-[.17em] text-black/40">#{index + 1} · {match.talent.category}</p>
                      <h3 className="mt-2 font-display text-3xl">{match.talent.name}</h3>
                      <p className="mt-2 text-sm text-black/55">{match.talent.genres.join(" · ")} · {match.talent.baseCity}</p>
                    </div>
                    <div className="text-right">
                      <div className="font-display text-4xl">{match.score}</div>
                      <div className="text-[10px] font-bold uppercase tracking-[.12em] text-black/40">Match score</div>
                    </div>
                  </div>
                  <div className="mt-5 grid gap-3 text-sm sm:grid-cols-3">
                    <div><span className="block text-[10px] uppercase tracking-[.12em] text-black/40">Rate</span>{rupiah.format(match.talent.budgetMin)}–{rupiah.format(match.talent.budgetMax)}</div>
                    <div><span className="block text-[10px] uppercase tracking-[.12em] text-black/40">Availability</span>{match.availabilityStatus}</div>
                    <div><span className="block text-[10px] uppercase tracking-[.12em] text-black/40">Freshness</span>{match.freshness}</div>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {match.reasons.map((reason) => <span key={reason} className="border border-black/15 px-3 py-1 text-xs text-black/55">{reason}</span>)}
                    {match.requiresLiveConfirmation && <span className="border border-amber-400 bg-amber-50 px-3 py-1 text-xs">Live confirmation required</span>}
                  </div>
                </article>
              ))}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
