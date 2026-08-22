"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type ResponseStatus = "confirmed" | "tentative" | "unavailable";

type Props = {
  requestId: string;
  currentStatus: string;
};

export function AvailabilityResponseActions({ requestId, currentStatus }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState<ResponseStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function respond(status: ResponseStatus) {
    setBusy(status);
    setError(null);
    try {
      const response = await fetch("/api/internal-demo/availability-response", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ requestId, status }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.detail ?? body?.error ?? "Response failed");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Response failed");
    } finally {
      setBusy(null);
    }
  }

  const options: Array<[ResponseStatus, string]> = [
    ["confirmed", "Confirmed"],
    ["tentative", "Tentative"],
    ["unavailable", "Unavailable"],
  ];

  return (
    <div className="mt-6 border-t border-black/10 pt-5">
      <p className="text-sm font-semibold">Manager Response</p>
      <p className="mt-1 text-xs text-black/45">Current status: {currentStatus}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        {options.map(([status, label]) => (
          <button
            key={status}
            type="button"
            onClick={() => respond(status)}
            disabled={busy !== null}
            className={
              currentStatus === status
                ? "border border-black bg-black px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
                : "border border-black/20 bg-white px-4 py-2 text-sm font-semibold disabled:opacity-40"
            }
          >
            {busy === status ? "Saving…" : currentStatus === status ? `${label} ✓` : label}
          </button>
        ))}
      </div>
      {error ? <p className="mt-3 text-xs font-semibold text-red-700">{error}</p> : null}
    </div>
  );
}
