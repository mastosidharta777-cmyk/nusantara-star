"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

type Props = {
  briefId: string;
  talentId: string;
  decision: "approved" | "rejected" | "pending";
  availabilityRequestId: string | null;
  availabilityRequestStatus: string | null;
};

export function AdminMatchActions({
  briefId,
  talentId,
  decision,
  availabilityRequestId,
  availabilityRequestStatus,
}: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(action: "approve" | "reject" | "request_live_confirmation") {
    setBusy(action);
    setError(null);
    try {
      const response = await fetch("/api/internal-demo/admin/match-action", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ briefId, talentId, action }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.detail ?? body?.error ?? "Action failed");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setBusy(null);
    }
  }

  const confirmed = availabilityRequestStatus === "confirmed";

  return (
    <div className="mt-5 border-t border-black/10 pt-4">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => run("approve")}
          disabled={busy !== null}
          className="border border-black bg-black px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
        >
          {busy === "approve"
            ? "Saving…"
            : decision === "approved"
              ? confirmed
                ? "Approved for Shortlist"
                : "Approved"
              : confirmed
                ? "Approve & Shortlist"
                : "Approve"}
        </button>
        <button
          type="button"
          onClick={() => run("reject")}
          disabled={busy !== null}
          className="border border-black/20 bg-white px-4 py-2 text-sm font-semibold disabled:opacity-40"
        >
          {busy === "reject" ? "Saving…" : decision === "rejected" ? "Rejected" : "Reject"}
        </button>
        <button
          type="button"
          onClick={() => run("request_live_confirmation")}
          disabled={busy !== null}
          className="border border-black/20 bg-[#f5f3ee] px-4 py-2 text-sm font-semibold disabled:opacity-40"
        >
          {busy === "request_live_confirmation"
            ? "Sending…"
            : availabilityRequestStatus === "pending"
              ? "Live Confirmation Pending"
              : availabilityRequestStatus
                ? `Live Confirmation: ${availabilityRequestStatus}`
                : "Request Live Confirmation"}
        </button>
      </div>

      {availabilityRequestId ? (
        <Link
          href={`/talent-confirmation/${availabilityRequestId}`}
          className="mt-3 inline-block text-xs font-semibold underline underline-offset-4"
        >
          Open Manager Response Preview →
        </Link>
      ) : null}

      <p className="mt-2 text-xs text-black/45">
        Decision: {decision} · Availability request: {availabilityRequestStatus ?? "none"}
      </p>
      {error ? <p className="mt-2 text-xs font-semibold text-red-700">{error}</p> : null}
    </div>
  );
}
