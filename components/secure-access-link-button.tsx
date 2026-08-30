"use client";

import { useState } from "react";

type Scope = "buyer_proposal" | "buyer_terms" | "talent_offer";
type Delivery = "open" | "copy";

export function SecureAccessLinkButton({ scope, subjectId, label, delivery = "open" }: { scope: Scope; subjectId: string; label: string; delivery?: Delivery }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generatedUrl, setGeneratedUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function copyUrl(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  async function openSecureLink() {
    setBusy(true);
    setError(null);
    setCopied(false);
    try {
      const response = await fetch("/api/internal-demo/admin/access-link", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ scope, subjectId }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok || !body?.url) throw new Error(body?.error ?? "Gagal membuat secure link");
      if (delivery === "copy") {
        setGeneratedUrl(body.url);
        await copyUrl(body.url);
      } else {
        window.open(body.url, "_blank", "noopener,noreferrer");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal membuat secure link");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <button type="button" onClick={openSecureLink} disabled={busy} className="border border-black bg-black px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">
        {busy ? "Membuat link…" : generatedUrl && delivery === "copy" ? "Buat ulang link" : label}
      </button>
      {generatedUrl && delivery === "copy" ? (
        <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]">
          <input readOnly value={generatedUrl} className="min-w-0 border border-black/15 bg-white p-2 text-xs" />
          <button type="button" onClick={() => copyUrl(generatedUrl)} className="border border-black px-3 py-2 text-xs font-semibold">{copied ? "Tersalin" : "Salin link"}</button>
        </div>
      ) : null}
      {error ? <p className="mt-2 text-xs font-semibold text-red-700">{error}</p> : null}
    </div>
  );
}
