"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { getSupabaseBrowserClient } from "@/lib/supabase";
import type { OperationalIncident, PreShowParty, PreShowResponse, PreShowTask, PreShowWorkspace } from "@/lib/pre-show-workspace";

const INCIDENT_OPTIONS = [
  ["late_arrival", "Keterlambatan"],
  ["technical_failure", "Kendala teknis"],
  ["shortened_performance", "Durasi tampil dipersingkat"],
  ["no_show", "Tidak hadir / no-show"],
  ["talent_cancellation", "Pembatalan oleh talent"],
  ["buyer_cancellation", "Pembatalan oleh buyer"],
  ["postponement", "Penundaan"],
  ["payment_dispute", "Masalah pembayaran"],
  ["force_majeure", "Keadaan kahar / force majeure"],
  ["other", "Lainnya"],
] as const;

function partyLabel(party: string) {
  if (party === "buyer") return "Buyer / EO";
  if (party === "talent") return "Talent / Manager";
  if (party === "admin") return "Nusantara Star";
  return "System";
}

function incidentLabel(value: string) {
  return INCIDENT_OPTIONS.find(([key]) => key === value)?.[1] ?? value.replaceAll("_", " ");
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

function incidentStatusLabel(incident: OperationalIncident) {
  return incident.status === "open" ? "Menunggu penanganan NS" : "Selesai ditangani";
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
  const [incidentBusy, setIncidentBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [incidentType, setIncidentType] = useState("late_arrival");
  const [incidentSummary, setIncidentSummary] = useState("");
  const [incidentDetails, setIncidentDetails] = useState("");
  const [evidenceUrl, setEvidenceUrl] = useState("");
  const [evidenceFile, setEvidenceFile] = useState<File | null>(null);
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
    if (data.checklistPausedByIncident) {
      setError("Checklist sedang pause karena ada laporan kejadian aktif. Tunggu Nusantara Star menyelesaikan penanganan.");
      return;
    }
    setBusyItem(task.id);
    setError(null);
    setMessage(null);
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

  async function addEvidence(incidentId: string) {
    if (evidenceUrl.trim()) {
      const linkResponse = await fetch("/api/pre-show/incident/evidence", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ bookingId, incidentId, party, token, externalUrl: evidenceUrl.trim() }),
      });
      const linkBody = await linkResponse.json().catch(() => null);
      if (!linkResponse.ok) throw new Error(linkBody?.error ?? "Link bukti gagal disimpan");
    }

    if (evidenceFile) {
      const prepare = await fetch("/api/pre-show/incident/evidence", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          bookingId,
          incidentId,
          party,
          token,
          fileName: evidenceFile.name,
          mimeType: evidenceFile.type,
          sizeBytes: evidenceFile.size,
        }),
      });
      const prepared = await prepare.json().catch(() => null);
      if (!prepare.ok || !prepared?.path || !prepared?.token || !prepared?.evidenceId) {
        throw new Error(prepared?.error ?? "Persiapan unggah bukti gagal");
      }

      const client = getSupabaseBrowserClient();
      if (!client) throw new Error("Penyimpanan bukti belum tersedia");
      const { error: uploadError } = await client.storage
        .from("incident-evidence")
        .uploadToSignedUrl(prepared.path, prepared.token, evidenceFile, { contentType: evidenceFile.type });
      if (uploadError) throw uploadError;

      const verify = await fetch("/api/pre-show/incident/evidence", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ bookingId, incidentId, party, token, evidenceId: prepared.evidenceId }),
      });
      const verifyBody = await verify.json().catch(() => null);
      if (!verify.ok) throw new Error(verifyBody?.error ?? "Bukti terunggah tetapi belum dapat diverifikasi");
    }
  }

  async function reportIncident() {
    if (!incidentSummary.trim()) {
      setError("Ringkasan kejadian wajib diisi.");
      return;
    }
    setIncidentBusy(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/pre-show/incident", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          bookingId,
          party,
          token,
          incidentType,
          summary: incidentSummary,
          details: incidentDetails,
        }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok || !body?.incidentId) throw new Error(body?.error ?? "Laporan kejadian gagal disimpan");

      try {
        await addEvidence(body.incidentId);
        setMessage("Laporan kejadian tersimpan. Nusantara Star akan meninjau dan menentukan tindak lanjut.");
      } catch (evidenceError) {
        setMessage("Laporan kejadian sudah tersimpan, tetapi bukti belum berhasil ditambahkan.");
        setError(evidenceError instanceof Error ? evidenceError.message : "Bukti gagal ditambahkan");
      }

      setIncidentSummary("");
      setIncidentDetails("");
      setEvidenceUrl("");
      setEvidenceFile(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Laporan kejadian gagal disimpan");
    } finally {
      setIncidentBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#f5f3ee] px-5 py-10 text-[#171713] md:px-10 md:py-16">
      <div className="mx-auto max-w-[980px]">
        <p className="eyebrow">Nusantara Star · Operasional Acara</p>
        <h1 className="mt-4 text-4xl font-semibold tracking-[-0.04em] md:text-6xl">
          {party === "buyer" ? "Workspace Buyer / EO." : "Workspace Talent / Manager."}
        </h1>
        <p className="mt-5 max-w-3xl text-sm leading-7 text-black/55">
          Gunakan halaman ini untuk checklist pra-acara dan laporan kejadian operasional. Laporan pihak tidak otomatis dianggap sebagai keputusan final; Nusantara Star tetap melakukan peninjauan dan menentukan tindak lanjut.
        </p>

        {data.checklistPausedByIncident ? (
          <section className="mt-6 border border-red-700/20 bg-red-50 p-4 text-sm text-red-900">
            <p className="font-semibold">Ada laporan kejadian yang sedang ditangani.</p>
            <p className="mt-1 text-xs leading-5">Checklist sementara tidak dapat diubah sampai Nusantara Star menyelesaikan incident aktif. Halaman ini tetap dapat digunakan untuk melihat status atau menambah laporan/bukti.</p>
          </section>
        ) : null}

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

        <section className="mt-5 border border-black/10 bg-white p-5 md:p-6">
          <h2 className="text-xl font-semibold">Laporkan kejadian</h2>
          <p className="mt-1 text-xs leading-5 text-black/45">
            Gunakan hanya untuk fakta operasional yang perlu ditangani. Waktu laporan dicatat otomatis oleh sistem.
          </p>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <label className="text-xs font-semibold">
              Jenis kejadian
              <select value={incidentType} onChange={(event) => setIncidentType(event.target.value)} className="mt-1 w-full border border-black/15 bg-white p-3 text-sm font-normal">
                {INCIDENT_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <label className="text-xs font-semibold">
              Ringkasan
              <input value={incidentSummary} onChange={(event) => setIncidentSummary(event.target.value)} maxLength={300} placeholder="Contoh: Talent tiba 30 menit setelah call time" className="mt-1 w-full border border-black/15 bg-white p-3 text-sm font-normal" />
            </label>
          </div>

          <label className="mt-3 block text-xs font-semibold">
            Detail <span className="font-normal text-black/40">(opsional)</span>
            <textarea value={incidentDetails} onChange={(event) => setIncidentDetails(event.target.value)} maxLength={3000} className="mt-1 min-h-24 w-full border border-black/15 bg-white p-3 text-sm font-normal" placeholder="Tuliskan apa yang terjadi, dampaknya, dan kondisi saat ini." />
          </label>

          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <label className="text-xs font-semibold">
              Foto / PDF bukti <span className="font-normal text-black/40">(opsional, maks. 15 MB)</span>
              <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(event) => setEvidenceFile(event.target.files?.[0] ?? null)} className="mt-1 block w-full border border-black/15 bg-white p-2 text-xs font-normal" />
            </label>
            <label className="text-xs font-semibold">
              Link bukti <span className="font-normal text-black/40">(opsional)</span>
              <input value={evidenceUrl} onChange={(event) => setEvidenceUrl(event.target.value)} placeholder="https://..." className="mt-1 w-full border border-black/15 bg-white p-3 text-sm font-normal" />
            </label>
          </div>

          <button type="button" onClick={reportIncident} disabled={incidentBusy || !incidentSummary.trim()} className="mt-4 bg-black px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">
            {incidentBusy ? "Menyimpan laporan…" : "Kirim laporan kejadian"}
          </button>
        </section>

        {data.incidents.length > 0 ? (
          <section className="mt-5 border border-black/10 bg-white">
            <div className="border-b border-black/10 p-5 md:p-6">
              <h2 className="text-xl font-semibold">Riwayat kejadian</h2>
              <p className="mt-1 text-xs text-black/45">Sumber laporan ditampilkan agar fakta dan keputusan admin tidak tercampur.</p>
            </div>
            <div className="divide-y divide-black/10">
              {data.incidents.map((incident) => (
                <article key={incident.id} className="p-5 md:p-6">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-black/40">{incidentLabel(incident.incident_type)}</p>
                      <p className="mt-2 font-semibold">{incident.summary}</p>
                      <p className="mt-1 text-xs text-black/45">
                        Dilaporkan oleh {partyLabel(incident.reported_by_party)} · {new Date(incident.occurred_at).toLocaleString("id-ID")}
                      </p>
                    </div>
                    <span className={`w-fit border px-3 py-2 text-xs font-semibold ${incident.status === "open" ? "border-amber-500/30 bg-amber-50 text-amber-950" : "border-emerald-700/20 bg-emerald-50 text-emerald-900"}`}>
                      {incidentStatusLabel(incident)}
                    </span>
                  </div>
                  {incident.details ? <p className="mt-3 text-sm leading-6 text-black/60">{incident.details}</p> : null}
                  {incident.evidence.length > 0 ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {incident.evidence.map((evidence) => {
                        const href = evidence.provider === "external_url" ? evidence.external_url : evidence.signed_url;
                        const label = evidence.evidence_type === "link" ? "Buka link bukti" : evidence.original_filename ?? "Buka bukti";
                        return href ? <a key={evidence.id} href={href} target="_blank" rel="noreferrer" className="border border-black/15 px-3 py-2 text-xs font-semibold underline">{label}</a> : null;
                      })}
                    </div>
                  ) : null}
                  {incident.status === "resolved" && incident.resolution_notes ? (
                    <div className="mt-3 border border-black/10 bg-[#f5f3ee] p-3 text-xs leading-5">
                      <strong>Catatan penyelesaian NS:</strong> {incident.resolution_notes}
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
          </section>
        ) : null}

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
                        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-black/40">{task.checkpoint_code} · batas {task.due_date}</p>
                        <h3 className="mt-2 text-lg font-semibold">{task.label}</h3>
                      </div>
                      <span className={`w-fit border px-3 py-2 text-xs font-semibold ${task.status === "pending" ? "border-amber-500/30 bg-amber-50 text-amber-950" : "border-emerald-700/20 bg-emerald-50 text-emerald-900"}`}>
                        {statusLabel(task.status)}
                      </span>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
                      {task.required_parties.map((requiredParty) => {
                        const confirmation = task.confirmations.find((item) => item.party === requiredParty);
                        return <span key={requiredParty} className="border border-black/10 px-2 py-1 text-xs">{partyLabel(requiredParty)}: {confirmation ? (confirmation.response === "done" ? "✓ confirmed" : "N/A") : "menunggu"}</span>;
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
                      <textarea value={notes[task.id] ?? ""} onChange={(event) => setNotes((current) => ({ ...current, [task.id]: event.target.value }))} disabled={data.checklistPausedByIncident} className="mt-1 min-h-20 w-full border border-black/15 bg-white p-2 text-sm disabled:bg-black/5" placeholder="Tambahkan catatan hanya jika ada yang perlu diketahui pihak lain." />
                    </label>

                    <div className="mt-3 flex flex-wrap gap-2">
                      <button type="button" onClick={() => respond(task, "done")} disabled={busyItem !== null || data.checklistPausedByIncident} className="bg-black px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">
                        {busyItem === task.id ? "Menyimpan…" : ownConfirmation?.response === "done" ? "Konfirmasi ulang selesai" : "Konfirmasi selesai"}
                      </button>
                      <button type="button" onClick={() => respond(task, "not_applicable")} disabled={busyItem !== null || data.checklistPausedByIncident} className="border border-black px-4 py-2 text-sm font-semibold disabled:opacity-40">
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
            {data.checklistPausedByIncident
              ? "Checklist sedang pause karena incident aktif."
              : data.allTasksComplete
                ? "Semua task pra-acara untuk revision ini sudah selesai."
                : "Masih ada task pra-acara yang menunggu Buyer/EO, Talent/Manager, atau Nusantara Star."}
          </p>
          <p className="mt-2 text-xs leading-5 text-black/45">
            Jika Show Advance berubah, konfirmasi checklist operasional akan dibuka ulang untuk revision terbaru.
          </p>
          {message ? <p className="mt-3 text-xs font-semibold text-emerald-800">{message}</p> : null}
          {error ? <p className="mt-3 text-xs font-semibold text-red-700">{error}</p> : null}
        </section>
      </div>
    </main>
  );
}
