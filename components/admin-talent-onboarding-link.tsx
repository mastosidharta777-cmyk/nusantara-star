"use client";

import { useState } from "react";

export function AdminTalentOnboardingLink({ talentId }: { talentId: string }) {
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function createLink() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/internal-demo/admin/access-link", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ scope: "talent_onboarding", subjectId: talentId }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.detail ?? data?.error ?? "Gagal membuat link pengisian profil");
      setUrl(data.url);
      await navigator.clipboard?.writeText(data.url).catch(() => undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal membuat link pengisian profil");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-5 border border-black/10 bg-white p-5 md:p-6">
      <p className="text-sm font-semibold">Link Pengisian Profil</p>
      <p className="mt-1 text-xs text-black/45">Buat link aman yang berlaku 7 hari untuk talent/manajer. Link hanya membuka form profil, bukan halaman admin.</p>
      <button disabled={busy} onClick={createLink} className="mt-4 border border-black bg-black px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">{busy ? "Membuat…" : "Buat & Salin Link"}</button>
      {url ? <p className="mt-3 break-all text-xs text-black/55">{url}</p> : null}
      {error ? <p className="mt-3 text-sm font-semibold text-red-700">{error}</p> : null}
    </section>
  );
}
