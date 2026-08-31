"use client";

import { useState } from "react";

export function AdminNewTalentInvite() {
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function createInvite() {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/internal-demo/admin/access-link", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ scope: "talent_onboarding", createNewTalent: true }),
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
    <div className="flex max-w-xl flex-col items-start gap-2">
      <button
        type="button"
        disabled={busy}
        onClick={createInvite}
        className="border border-black bg-black px-4 py-2 text-xs font-semibold text-white disabled:opacity-40"
      >
        {busy ? "Membuat…" : "Buat Link Pendaftaran Talent Baru"}
      </button>
      <p className="text-xs text-black/45">Satu link untuk satu talent/manager dan berlaku 7 hari.</p>
      {url ? <p className="max-w-full break-all text-xs text-black/60">{url}</p> : null}
      {message ? <p className="text-xs font-semibold text-green-700">{message}</p> : null}
      {error ? <p className="text-xs font-semibold text-red-700">{error}</p> : null}
    </div>
  );
}
