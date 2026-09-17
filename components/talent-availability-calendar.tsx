"use client";

import { useEffect, useMemo, useState } from "react";

type AvailabilityStatus = "available" | "tentative" | "unavailable" | "unknown";
type AvailabilityRow = { event_date: string; status: AvailabilityStatus; updated_at?: string | null };

const statusMeta: Record<AvailabilityStatus, { label: string; badge: string }> = {
  available: { label: "Tersedia", badge: "border-green-700 bg-green-50 text-green-800" },
  tentative: { label: "Tentatif", badge: "border-amber-600 bg-amber-50 text-amber-800" },
  unavailable: { label: "Tidak tersedia", badge: "border-red-700 bg-red-50 text-red-800" },
  unknown: { label: "Belum ditandai", badge: "border-black/15 bg-white text-black/55" },
};

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function isoDate(year: number, month: number, day: number) {
  return `${year}-${pad(month + 1)}-${pad(day)}`;
}

function monthBounds(year: number, month: number) {
  return {
    from: isoDate(year, month, 1),
    to: isoDate(year, month, new Date(year, month + 1, 0).getDate()),
  };
}

function localToday() {
  const now = new Date();
  return isoDate(now.getFullYear(), now.getMonth(), now.getDate());
}

export function TalentAvailabilityCalendar({ talentId, token }: { talentId: string; token: string }) {
  const now = new Date();
  const [cursor, setCursor] = useState(() => new Date(now.getFullYear(), now.getMonth(), 1));
  const [rows, setRows] = useState<Record<string, AvailabilityStatus>>({});
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const bounds = monthBounds(year, month);
  const today = localToday();

  const cells = useMemo(() => {
    const firstWeekday = new Date(year, month, 1).getDay();
    const days = new Date(year, month + 1, 0).getDate();
    const result: Array<{ date: string; day: number } | null> = [];
    for (let i = 0; i < firstWeekday; i += 1) result.push(null);
    for (let day = 1; day <= days; day += 1) result.push({ date: isoDate(year, month, day), day });
    while (result.length % 7) result.push(null);
    return result;
  }, [year, month]);

  async function load() {
    setError("");
    const response = await fetch(`/api/talent-onboarding/availability?talentId=${encodeURIComponent(talentId)}&token=${encodeURIComponent(token)}&from=${bounds.from}&to=${bounds.to}`, { cache: "no-store" });
    const body = await response.json().catch(() => null);
    if (!response.ok) throw new Error(body?.error ?? "Gagal memuat kalender ketersediaan");
    const next: Record<string, AvailabilityStatus> = {};
    for (const row of (body?.availability ?? []) as AvailabilityRow[]) next[row.event_date] = row.status;
    setRows(next);
    setLastUpdatedAt(body?.lastCalendarUpdatedAt ?? null);
  }

  useEffect(() => {
    load().catch((cause) => setError(cause instanceof Error ? cause.message : "Gagal memuat kalender ketersediaan"));
  }, [year, month]);

  async function setStatus(status: AvailabilityStatus) {
    if (!selectedDate) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/talent-onboarding/availability", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ talentId, token, eventDate: selectedDate, status }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error ?? "Gagal menyimpan status ketersediaan");
      setRows((current) => ({ ...current, [selectedDate]: status }));
      setLastUpdatedAt(body?.lastCalendarUpdatedAt ?? new Date().toISOString());
      setMessage(`${selectedDate} ditandai: ${statusMeta[status].label}.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Gagal menyimpan status ketersediaan");
    } finally {
      setBusy(false);
    }
  }

  function moveMonth(delta: number) {
    setSelectedDate("");
    setMessage("");
    setCursor((current) => new Date(current.getFullYear(), current.getMonth() + delta, 1));
  }

  const monthLabel = new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric" }).format(cursor);
  const lastUpdatedLabel = lastUpdatedAt ? new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(new Date(lastUpdatedAt)) : "Belum pernah diperbarui";

  return (
    <section className="bg-[#f5f3ee] px-5 pb-6 text-[#171713] md:px-10">
      <div className="mx-auto max-w-3xl border border-black/10 bg-white p-5 md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">Kalender Ketersediaan</p>
            <p className="mt-1 max-w-2xl text-xs leading-5 text-black/50">Tandai tanggal yang sudah pasti tersedia, masih tentatif, atau tidak tersedia. Tanggal yang belum ditandai tetap dianggap perlu konfirmasi ulang saat ada booking.</p>
          </div>
          <span className="text-xs text-black/45">Update terakhir: {lastUpdatedLabel}</span>
        </div>

        <div className="mt-5 flex items-center justify-between gap-3">
          <button type="button" onClick={() => moveMonth(-1)} className="border border-black/15 px-3 py-2 text-xs font-semibold">← Bulan lalu</button>
          <p className="text-sm font-semibold capitalize">{monthLabel}</p>
          <button type="button" onClick={() => moveMonth(1)} className="border border-black/15 px-3 py-2 text-xs font-semibold">Bulan berikut →</button>
        </div>

        <div className="mt-4 grid grid-cols-7 gap-1 text-center text-[11px] font-semibold text-black/45">
          {['Min','Sen','Sel','Rab','Kam','Jum','Sab'].map((day) => <div key={day} className="py-1">{day}</div>)}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {cells.map((cell, index) => {
            if (!cell) return <div key={`empty-${index}`} className="aspect-square" />;
            const status = rows[cell.date] ?? "unknown";
            const isPast = cell.date < today;
            const selected = selectedDate === cell.date;
            const meta = statusMeta[status];
            return (
              <button
                key={cell.date}
                type="button"
                disabled={isPast}
                onClick={() => setSelectedDate(cell.date)}
                aria-label={`${cell.date}: ${meta.label}`}
                className={`aspect-square border p-1 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-30 ${meta.badge} ${selected ? "ring-2 ring-black ring-offset-1" : ""}`}
              >
                <span>{cell.day}</span>
                <span className="mt-1 hidden text-[9px] font-normal leading-none sm:block">{status === "unknown" ? "—" : meta.label}</span>
              </button>
            );
          })}
        </div>

        <div className="mt-4 flex flex-wrap gap-2 text-xs">
          {(["available", "tentative", "unavailable"] as AvailabilityStatus[]).map((status) => <span key={status} className={`border px-2 py-1 ${statusMeta[status].badge}`}>{statusMeta[status].label}</span>)}
        </div>

        {selectedDate ? (
          <div className="mt-5 border-t border-black/10 pt-5">
            <p className="text-sm font-semibold">{selectedDate}</p>
            <p className="mt-1 text-xs text-black/45">Pilih status untuk tanggal ini.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {(["available", "tentative", "unavailable", "unknown"] as AvailabilityStatus[]).map((status) => (
                <button key={status} type="button" disabled={busy} onClick={() => setStatus(status)} className={`border px-3 py-2 text-xs font-semibold disabled:opacity-40 ${statusMeta[status].badge}`}>
                  {busy ? "Menyimpan…" : statusMeta[status].label}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <div className="mt-5 border-t border-black/10 pt-4">
          <p className="text-xs font-semibold">Google Calendar</p>
          <p className="mt-1 text-xs leading-5 text-black/45">Sinkronisasi Google Calendar akan menjadi langkah berikutnya. V1 manual ini memakai tabel availability yang sudah menjadi sumber data matching Nusantara Star, sehingga dapat dipakai tanpa menunggu OAuth Google.</p>
        </div>

        {message ? <p className="mt-4 text-sm font-semibold text-green-700">{message}</p> : null}
        {error ? <p className="mt-4 text-sm font-semibold text-red-700">{error}</p> : null}
      </div>
    </section>
  );
}
