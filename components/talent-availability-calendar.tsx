"use client";

import { useEffect, useMemo, useState } from "react";

type AvailabilityStatus = "available" | "tentative" | "unavailable" | "unknown";
type AvailabilityRow = { event_date: string; status: AvailabilityStatus; notes?: string | null; updated_at?: string | null };
type GoogleCalendarItem = { id: string; summary: string; primary: boolean; selected: boolean; timeZone: string | null };
type GoogleStatus = {
  configured: boolean;
  schemaReady: boolean;
  connected: boolean;
  connection: null | {
    calendarId: string;
    calendarSummary: string | null;
    calendarTimezone: string | null;
    connectedAt: string;
    lastSyncedAt: string | null;
    lastSyncError: string | null;
  };
  calendars: GoogleCalendarItem[];
  liveError?: string | null;
};

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

function formatTimestamp(value: string | null | undefined) {
  if (!value) return "Belum pernah";
  return new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export function TalentAvailabilityCalendar({ talentId, token }: { talentId: string; token: string }) {
  const now = new Date();
  const [cursor, setCursor] = useState(() => new Date(now.getFullYear(), now.getMonth(), 1));
  const [rows, setRows] = useState<Record<string, AvailabilityStatus>>({});
  const [sources, setSources] = useState<Record<string, "google" | "manual">>({});
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [googleStatus, setGoogleStatus] = useState<GoogleStatus | null>(null);

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
    const nextSources: Record<string, "google" | "manual"> = {};
    for (const row of (body?.availability ?? []) as AvailabilityRow[]) {
      next[row.event_date] = row.status;
      nextSources[row.event_date] = row.notes?.startsWith("Google Calendar busy • sync:v1") ? "google" : "manual";
    }
    setRows(next);
    setSources(nextSources);
    setLastUpdatedAt(body?.lastCalendarUpdatedAt ?? null);
  }

  async function loadGoogleStatus() {
    const response = await fetch(`/api/talent-onboarding/google-calendar?talentId=${encodeURIComponent(talentId)}&token=${encodeURIComponent(token)}`, { cache: "no-store" });
    const body = await response.json().catch(() => null);
    if (!response.ok) throw new Error(body?.error ?? "Gagal memuat status Google Calendar");
    setGoogleStatus(body as GoogleStatus);
  }

  useEffect(() => {
    load().catch((cause) => setError(cause instanceof Error ? cause.message : "Gagal memuat kalender ketersediaan"));
  }, [year, month]);

  useEffect(() => {
    loadGoogleStatus().catch((cause) => setError(cause instanceof Error ? cause.message : "Gagal memuat status Google Calendar"));
    const url = new URL(window.location.href);
    const calendarResult = url.searchParams.get("calendar");
    if (calendarResult === "connected") setMessage("Google Calendar berhasil terhubung dan disinkronkan.");
    if (calendarResult === "cancelled") setMessage("Koneksi Google Calendar dibatalkan.");
    if (calendarResult === "setup_required") setError("Google Calendar belum siap di database Nusantara Star.");
    if (calendarResult === "error") setError("Google Calendar belum berhasil dihubungkan. Coba lagi.");
    if (calendarResult) {
      url.searchParams.delete("calendar");
      window.history.replaceState({}, "", url.toString());
    }
  }, []);

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
      setSources((current) => {
        const next = { ...current };
        if (status === "unknown") delete next[selectedDate];
        else next[selectedDate] = "manual";
        return next;
      });
      setLastUpdatedAt(body?.lastCalendarUpdatedAt ?? new Date().toISOString());
      setMessage(`${selectedDate} ditandai: ${statusMeta[status].label}.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Gagal menyimpan status ketersediaan");
    } finally {
      setBusy(false);
    }
  }

  async function googleAction(action: "sync" | "select" | "disconnect", calendarId?: string) {
    setGoogleBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/talent-onboarding/google-calendar", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ talentId, token, action, calendarId }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error ?? "Google Calendar belum dapat diperbarui");
      await Promise.all([loadGoogleStatus(), load()]);
      setMessage(action === "disconnect" ? "Google Calendar sudah diputuskan. Status manual tetap tersimpan." : action === "select" ? "Kalender dipilih dan availability sudah disinkronkan." : "Google Calendar berhasil disinkronkan.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Google Calendar belum dapat diperbarui");
    } finally {
      setGoogleBusy(false);
    }
  }

  function connectGoogle() {
    const url = new URL("/api/talent-onboarding/google-calendar/connect", window.location.origin);
    url.searchParams.set("talentId", talentId);
    url.searchParams.set("token", token);
    window.location.assign(url.toString());
  }

  function moveMonth(delta: number) {
    setSelectedDate("");
    setMessage("");
    setCursor((current) => new Date(current.getFullYear(), current.getMonth() + delta, 1));
  }

  const monthLabel = new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric" }).format(cursor);
  const selectedSource = selectedDate ? sources[selectedDate] : undefined;

  return (
    <section className="bg-[#f5f3ee] px-5 pb-6 text-[#171713] md:px-10">
      <div className="mx-auto max-w-3xl border border-black/10 bg-white p-5 md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">Kalender Ketersediaan</p>
            <p className="mt-1 max-w-2xl text-xs leading-5 text-black/50">Tandai tanggal yang sudah pasti tersedia, masih tentatif, atau tidak tersedia. Tanggal yang belum ditandai tetap dianggap perlu konfirmasi ulang saat ada booking.</p>
          </div>
          <span className="text-xs text-black/45">Update terakhir: {formatTimestamp(lastUpdatedAt)}</span>
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
            const source = sources[cell.date];
            return (
              <button
                key={cell.date}
                type="button"
                disabled={isPast}
                onClick={() => setSelectedDate(cell.date)}
                aria-label={`${cell.date}: ${meta.label}${source === "google" ? ", dari Google Calendar" : ""}`}
                className={`aspect-square border p-1 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-30 ${meta.badge} ${selected ? "ring-2 ring-black ring-offset-1" : ""}`}
              >
                <span>{cell.day}</span>
                <span className="mt-1 hidden text-[9px] font-normal leading-none sm:block">{source === "google" ? "Google" : status === "unknown" ? "—" : meta.label}</span>
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
            <p className="mt-1 text-xs text-black/45">{selectedSource === "google" ? "Tanggal ini terdeteksi busy di Google Calendar dan ditandai Tentatif. Pilihan manual Anda akan menjadi override." : "Pilih status untuk tanggal ini."}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {(["available", "tentative", "unavailable", "unknown"] as AvailabilityStatus[]).map((status) => (
                <button key={status} type="button" disabled={busy} onClick={() => setStatus(status)} className={`border px-3 py-2 text-xs font-semibold disabled:opacity-40 ${statusMeta[status].badge}`}>
                  {busy ? "Menyimpan…" : statusMeta[status].label}
                </button>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-black/40">“Belum ditandai” menghapus override manual. Jika Google masih busy, status Tentatif dapat muncul lagi pada sinkronisasi berikutnya.</p>
          </div>
        ) : null}

        <div className="mt-6 border-t border-black/10 pt-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold">Google Calendar <span className="font-normal text-black/45">(opsional)</span></p>
              <p className="mt-1 max-w-2xl text-xs leading-5 text-black/45">Nusantara Star hanya membaca kalender yang Anda pilih untuk mengetahui waktu busy/free. Judul dan detail acara tidak disimpan. Tanggal busy masuk sebagai <b>Tentatif</b>, bukan otomatis “Tidak tersedia”.</p>
            </div>
            {googleStatus?.connected ? <span className="border border-green-700/30 bg-green-50 px-2 py-1 text-[11px] font-semibold text-green-800">Terhubung</span> : null}
          </div>

          {!googleStatus ? <p className="mt-4 text-xs text-black/45">Memeriksa koneksi Google Calendar…</p> : !googleStatus.schemaReady ? (
            <p className="mt-4 border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">Google Calendar sedang disiapkan di Nusantara Star. Kalender manual tetap dapat digunakan.</p>
          ) : !googleStatus.configured ? (
            <p className="mt-4 border border-black/10 bg-[#f8f7f3] p-3 text-xs text-black/55">Integrasi Google Calendar belum diaktifkan oleh Nusantara Star. Kalender manual tetap berfungsi.</p>
          ) : !googleStatus.connected ? (
            <button type="button" disabled={googleBusy} onClick={connectGoogle} className="mt-4 border border-black bg-black px-4 py-3 text-xs font-semibold text-white disabled:opacity-40">Hubungkan Google Calendar</button>
          ) : (
            <div className="mt-4 space-y-4">
              <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
                <label className="block text-xs font-semibold">
                  Kalender yang dipakai
                  <select
                    disabled={googleBusy || !googleStatus.calendars.length}
                    value={googleStatus.connection?.calendarId ?? ""}
                    onChange={(event) => googleAction("select", event.target.value)}
                    className="mt-2 w-full border border-black/15 bg-white px-3 py-3 font-normal disabled:bg-black/5"
                  >
                    {googleStatus.calendars.length ? googleStatus.calendars.map((calendar) => <option key={calendar.id} value={calendar.id}>{calendar.summary}{calendar.primary ? " · Utama" : ""}</option>) : <option value={googleStatus.connection?.calendarId ?? ""}>{googleStatus.connection?.calendarSummary ?? "Google Calendar"}</option>}
                  </select>
                </label>
                <button type="button" disabled={googleBusy} onClick={() => googleAction("sync")} className="border border-black bg-black px-4 py-3 text-xs font-semibold text-white disabled:opacity-40">{googleBusy ? "Memproses…" : "Sinkronkan sekarang"}</button>
              </div>
              <div className="text-xs leading-5 text-black/45">
                <p>Sinkron terakhir: {formatTimestamp(googleStatus.connection?.lastSyncedAt)}</p>
                {googleStatus.connection?.calendarTimezone ? <p>Zona waktu: {googleStatus.connection.calendarTimezone}</p> : null}
                {googleStatus.liveError || googleStatus.connection?.lastSyncError ? <p className="mt-1 text-red-700">Koneksi perlu diperiksa: {googleStatus.liveError || googleStatus.connection?.lastSyncError}</p> : null}
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" disabled={googleBusy} onClick={connectGoogle} className="border border-black/15 px-3 py-2 text-xs font-semibold disabled:opacity-40">Hubungkan ulang</button>
                <button type="button" disabled={googleBusy} onClick={() => googleAction("disconnect")} className="border border-red-700/30 px-3 py-2 text-xs font-semibold text-red-700 disabled:opacity-40">Putuskan Google Calendar</button>
              </div>
            </div>
          )}
        </div>

        {message ? <p className="mt-4 text-sm font-semibold text-green-700">{message}</p> : null}
        {error ? <p className="mt-4 text-sm font-semibold text-red-700">{error}</p> : null}
      </div>
    </section>
  );
}
