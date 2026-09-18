"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import type { PreShowParty, PreShowResponse, PreShowTask, PreShowWorkspace } from "@/lib/pre-show-workspace";

function partyLabel(party: string) {
  if (party === "buyer") return "Buyer / EO";
  if (party === "talent") return "Talent / Manager";
  if (party === "admin") return "Nusantara Star";
  return "System";
}

function localDateTime(value: string | null) {
  if (!value) return "—";
  return value.replace("T", " ").slice(0, 16);
}

function statusLabel(status: PreShowTask["status"]) {
  if (status === "done") return "Selesai";
  if (status === "not_applicable") return "Tidak berlaku";
  return "Menunggu";
}

export function PreShowWorkspaceForm({
  bookingId,
  party,
  token,
  data,
}: {
  bookingId: string;
  party: PreShowParty;
  token: string;
  data: PreShowWorkspace;
}) {
  const router = useRouter();
  const [busyItem, setBusyItem] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      data.partyTasks.map((task) => {
        const own = task.confirmations.find((confirmation) => confirmation.party === party);
        return [task.id, own?.note ?? ""];
      }),
    ),
  );

  const completedOwn = useMemo(
    () => data.partyTasks.filter((task) => task.confirmations.some((confirmation) => confirmation.party === party)).length,
    [data.partyTasks, party],
  );

  async function respond(task: PreShowTask, response: PreShowResponse) {
    setBusyItem(task.id);
    setError(null);
    try {
      const request = await fetch("/api/pre-show/task", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          bookingId,
          itemId: task.id,
          party,
          response,
          note: notes[task.id] ?? "",
          token,
        }),
      });
      const body = await request.json().catch(() => null);
      if (!request.ok) throw new Error(body?.error ?? body?.detail ?? "Gagal memperbarui checklist");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memperbarui checklist");
    } finally {
      setBusyItem(null);
    }
  }

  return (
    <main className="min-h-screen bg-[#f5f3ee] px-5 py-10 text-[#171713] md:px-10 md:py-16">
      <div className="mx-auto max-w-[980px]">
        <p className="eyebrow">Nusantara Star · Pre-Show</p>
        <h1 className="mt-4 text-4xl font-semibold tracking-[-0.04em] md:text-6xl">
          {party === "buyer" ? "Checklist Buyer / EO." : "Checklist Talent / Manager."}
        </h1>
        <p className="mt-5 max-w-3xl text-sm leading-7 text-black/55">
          Konfirmasi hanya hal yang memang Anda kuasai. Task bersama baru dianggap selesai setelah semua pihak yang dibutuhkan merespons pada Show Advance revision yang sama.
        </p>

        <section className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["Talent", data.event.talent_name],
            ["Acara", data.event.event_type ?? "—"],
            ["Tanggal", data.booking.event_date],
            ["Kota", data.booking.city ?? "—"],
          ].map(([label, value]) => (
            <div key={label} className="border border-black/10 bg-white p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-black/40">{label}</p>
              <p className="mt-2 text-sm font-semibold">{value}</p>
            </div>
          ))}
        </section>

        <section className="mt-5 border border-black/10 bg-white p-5 md:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-sm font-semibold">Acuan operasional</p>
              <p className="mt-1 text-xs text-black/45">Show Advance revision {data.advance.revision_no}</p>
            </div>
            <div className="border border-black/10 px-3 py-2 text-xs font-semibold">
              Task Anda {completedOwn}/{data.partyTasks.length} sudah direspons
            </div>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-2">
            <div className="border border-black/10 p-3 text-sm">
              <span className="text-black/45">Venue</span><br />
              <strong>{data.advance.venue_name ?? data.booking.venue ?? "—"}</strong><br />
              {data.advance.venue_address ?? "—"}
            </div>
            <div className="border border-black/10 p-3 text-sm">
              <span className="text-black/45">Schedule</span><br />
              Call: {localDateTime(data.advance.call_at_local)}<br />
              Soundcheck: {localDateTime(data.advance.soundcheck_at_local)}<br />
              Show: {localDateTime(data.advance.show_start_at_local)}
            </div>
            <div className="border border-black/10 p-3 text-sm">
              <span className="text-black/45">Onsite / technical PIC</span><br />
              {data.advance.onsite_pic_name ?? "—"} · {data.advance.onsite_pic_phone ?? "—"}<br />
              {data.advance.technical_pic_name ?? "—"} · {data.advance.technical_pic_phone ?? "—"}
            </div>
            <div className="border border-black/10 p-3 text-sm">
              <span className="text-black/45">Talent PIC / lineup</span><br />
              {data.advance.talent_pic_name ?? "—"} · {data.advance.talent_pic_phone ?? "—"}<br />
              {data.advance.personnel_count ?? "—"} orang · {data.advance.lineup_notes ?? "—"}
            </div>
          </div>
        </section>

        <section className="mt-5 border border-black/10 bg-white">
          <div className="border-b border-black/10 p-5 md:p-6">
            <h2 className="text-xl font-semibold">Task yang memerlukan Anda</h2>
            <p className="mt-1 text-xs leading-5 text-black/45">
              Menekan “Konfirmasi selesai” berarti data pada acuan operasional di atas masih benar untuk checkpoint ini.
            </p>
          </div>

          {data.partyTasks.length === 0 ? (
            <div className="p-6 text-sm text-black/50">Tidak ada task untuk pihak Anda pada checklist ini.</div>
          ) : (
            <div className="divide-y divide-black/10">
              {data.partyTasks.map((task) => {
                const ownConfirmation = task.confirmations.find((confirmation) => confirmation.party === party);
                const waitingParties = task.required_parties.filter(
                  (requiredParty) => !task.confirmations.some((confirmation) => confirmation.party === requiredParty),
                );
                return (
                  <article key={task.id} className="p-5 md:p-6">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-black/40">
                          {task.checkpoint_code} · batas {task.due_date}
                        </p>
                        <h3 className="mt-2 text-lg font-semibold">{task.label}</h3>
                      </div>
                      <span className={`w-fit border px-3 py-2 text-xs font-semibold ${task.status === "pending" ? "border-amber-500/30 bg-amber-50 text-amber-950" : "border-emerald-700/20 bg-emerald-50 text-emerald-900"}`}>
                        {statusLabel(task.status)}
                      </span>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
                      {task.required_parties.map((requiredParty) => {
                        const confirmation = task.confirmations.find((item) => item.party === requiredParty);
                        return (
                          <span key={requiredParty} className="border border-black/10 px-2 py-1 text-xs">
                            {partyLabel(requiredParty)}: {confirmation ? (confirmation.response === "done" ? "✓ confirmed" : "N/A") : "menunggu"}
                          </span>
                        );
                      })}
                    </div>

                    {ownConfirmation ? (
                      <p className="mt-3 text-xs text-black/50">
                        Respons Anda saat ini: <strong>{ownConfirmation.response === "done" ? "Confirmed" : "Tidak berlaku"}</strong>.
                        {waitingParties.length > 0 ? ` Menunggu ${waitingParties.map(partyLabel).join(", ")}.` : ""}
                      </p>
                    ) : null}

                    <label className="mt-4 block text-xs font-semibold">
                      Catatan <span className="font-normal text-black/40">(opsional)</span>
                      <textarea
                        value={notes[task.id] ?? ""}
                        onChange={(event) => setNotes((current) => ({ ...current, [task.id]: event.target.value }))}
                        className="mt-1 min-h-20 w-full border border-black/15 bg-white p-2 text-sm"
                        placeholder="Tambahkan catatan hanya jika ada yang perlu diketahui pihak lain."
                      />
                    </label>

                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => respond(task, "done")}
                        disabled={busyItem !== null}
                        className="bg-black px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
                      >
                        {busyItem === task.id ? "Menyimpan…" : ownConfirmation?.response === "done" ? "Konfirmasi ulang selesai" : "Konfirmasi selesai"}
                      </button>
                      <button
                        type="button"
                        onClick={() => respond(task, "not_applicable")}
                        disabled={busyItem !== null}
                        className="border border-black px-4 py-2 text-sm font-semibold disabled:opacity-40"
                      >
                        Tidak berlaku
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        <section className="mt-5 border border-black/10 bg-white p-5 text-sm md:p-6">
          <p className="font-semibold">Status keseluruhan</p>
          <p className="mt-2 text-black/55">
            {data.allTasksComplete
              ? "Semua task pra-acara untuk revision ini sudah selesai."
              : "Masih ada task pra-acara yang menunggu Buyer/EO, Talent/Manager, atau Nusantara Star."}
          </p>
          <p className="mt-2 text-xs leading-5 text-black/45">
            Jika Show Advance berubah, konfirmasi checklist operasional akan dibuka ulang untuk revision terbaru.
          </p>
          {error ? <p className="mt-3 text-xs font-semibold text-red-700">{error}</p> : null}
        </section>
      </div>
    </main>
  );
}
