"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

function digits(value: string) {
  return value.replace(/\D/g, "");
}

function dateLabel(value: string | null) {
  if (!value) return "Belum pernah dikonfirmasi";
  return new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" }).format(new Date(value));
}

export function AdminTalentOperationalBasics({
  talentId,
  initialBaseCity,
  initialBudgetMin,
  initialBudgetMax,
  lastCalendarUpdatedAt,
}: {
  talentId: string;
  initialBaseCity: string | null;
  initialBudgetMin: number | null;
  initialBudgetMax: number | null;
  lastCalendarUpdatedAt: string | null;
}) {
  const router = useRouter();
  const [baseCity, setBaseCity] = useState(initialBaseCity ?? "");
  const [budgetMin, setBudgetMin] = useState(initialBudgetMin ? String(initialBudgetMin) : "");
  const [budgetMax, setBudgetMax] = useState(initialBudgetMax ? String(initialBudgetMax) : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function post(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/internal-demo/admin/talent-commercial-profile", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ talentId, ...body }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.detail ?? data?.error ?? "Gagal menyimpan data operasional");
      router.refresh();
      return data;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menyimpan data operasional");
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function saveBasics() {
    const result = await post({
      action: "update_operational_basics",
      baseCity: baseCity.trim(),
      budgetMin: Number(digits(budgetMin)),
      budgetMax: Number(digits(budgetMax)),
    });
    if (result) setMessage("Data operasional matching tersimpan.");
  }

  async function confirmAvailabilityReview() {
    const confirmed = window.confirm("Catat hanya jika kalender/ketersediaan talent memang sudah dikonfirmasi dengan talent atau manager hari ini. Lanjutkan?");
    if (!confirmed) return;
    const result = await post({ action: "confirm_availability_review" });
    if (result) setMessage("Konfirmasi availability hari ini tercatat.");
  }

  return (
    <section className="mt-5 border border-black/10 bg-white p-5 md:p-6">
      <div>
        <p className="text-sm font-semibold">Data Operasional Matching</p>
        <p className="mt-1 max-w-3xl text-xs leading-5 text-black/45">
          Kisaran fee di sini hanya panduan internal untuk pencocokan awal. Ini bukan quote ke buyer. Fee final tetap harus dikonfirmasi talent/manager untuk setiap acara melalui Talent Offer.
        </p>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-3">
        <label className="text-sm font-semibold">Kota basis
          <input value={baseCity} onChange={(e) => setBaseCity(e.target.value)} placeholder="Contoh: Jakarta" className="mt-2 w-full border border-black/15 px-3 py-3 font-normal" />
        </label>
        <label className="text-sm font-semibold">Fee indikatif minimum (Rp)
          <input value={budgetMin} onChange={(e) => setBudgetMin(digits(e.target.value))} inputMode="numeric" placeholder="10000000" className="mt-2 w-full border border-black/15 px-3 py-3 font-normal" />
        </label>
        <label className="text-sm font-semibold">Fee indikatif maksimum (Rp)
          <input value={budgetMax} onChange={(e) => setBudgetMax(digits(e.target.value))} inputMode="numeric" placeholder="15000000" className="mt-2 w-full border border-black/15 px-3 py-3 font-normal" />
        </label>
      </div>
      <button disabled={busy} onClick={saveBasics} className="mt-4 border border-black bg-black px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">
        {busy ? "Menyimpan…" : "Simpan Data Matching"}
      </button>

      <div className="mt-6 border-t border-black/10 pt-5">
        <p className="text-sm font-semibold">Konfirmasi Kalender / Availability</p>
        <p className="mt-1 text-xs text-black/45">Terakhir dikonfirmasi: {dateLabel(lastCalendarUpdatedAt)}</p>
        <p className="mt-2 max-w-3xl text-xs leading-5 text-black/45">Tombol ini hanya mencatat kapan admin benar-benar memeriksa data availability dengan talent/manager. Tanggal acara tertentu tetap membutuhkan live confirmation bila belum ada status kalender untuk tanggal tersebut.</p>
        <button disabled={busy} onClick={confirmAvailabilityReview} className="mt-3 border border-black/20 px-4 py-2 text-sm font-semibold disabled:opacity-40">Catat Konfirmasi Hari Ini</button>
      </div>

      {message ? <p className="mt-4 text-sm font-semibold text-emerald-700">{message}</p> : null}
      {error ? <p className="mt-4 text-sm font-semibold text-red-700">{error}</p> : null}
    </section>
  );
}
