"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { SecureAccessLinkButton } from "@/components/secure-access-link-button";
import { availabilityLabel } from "@/lib/ui-language";

type Props = {
  briefId: string;
  talentId: string;
  availabilityRequestId: string | null;
  availabilityRequestStatus: string | null;
};

export function AdminDirectInquiryActions({ briefId, talentId, availabilityRequestId, availabilityRequestStatus }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function requestConfirmation() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/internal-demo/admin/match-action", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ briefId, talentId, action: "request_live_confirmation" }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.detail ?? body?.error ?? "Permintaan konfirmasi gagal");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Permintaan konfirmasi gagal");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-5 border-t border-black/10 pt-4">
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={requestConfirmation} disabled={busy || availabilityRequestStatus === "pending"} className="border border-black bg-black px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">
          {busy ? "Mengirim…" : availabilityRequestStatus === "pending" ? "Menunggu konfirmasi talent/manager" : availabilityRequestStatus ? `Konfirmasi: ${availabilityLabel(availabilityRequestStatus)}` : "Cek ketersediaan & minta penawaran"}
        </button>
        {availabilityRequestId ? <SecureAccessLinkButton scope="talent_offer" subjectId={availabilityRequestId} label="Buka tautan aman manajer" /> : null}
      </div>
      <p className="mt-2 text-xs text-black/45">Permintaan langsung buyer. Tindakan ini memulai live confirmation; bukan booking dan bukan Buyer Selection.</p>
      {error ? <p className="mt-2 text-xs font-semibold text-red-700">{error}</p> : null}
    </div>
  );
}
