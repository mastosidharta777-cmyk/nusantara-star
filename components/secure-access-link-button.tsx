"use client";

import { useState } from "react";

type Scope = "buyer_proposal" | "talent_offer";

export function SecureAccessLinkButton({ scope, subjectId, label }: { scope: Scope; subjectId: string; label: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function openSecureLink() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/internal-demo/admin/access-link", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ scope, subjectId }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok || !body?.url) throw new Error(body?.error ?? "Gagal membuat secure link");
      window.open(body.url, "_blank", "noopener,noreferrer");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal membuat secure link");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <button type="button" onClick={openSecureLink} disabled={busy} className="border border-black bg-black px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">
        {busy ? "Membuat link…" : label}
      </button>
      {error ? <p className="mt-2 text-xs font-semibold text-red-700">{error}</p> : null}
    </div>
  );
}
