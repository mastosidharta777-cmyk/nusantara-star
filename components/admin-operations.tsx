"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { SecureAccessLinkButton } from "@/components/secure-access-link-button";
import type { OperationsChecklistItem, OperationsIncident, TalentSettlement } from "@/lib/operations-data";
import { bookingStatusLabel } from "@/lib/ui-language";

type Booking = {
  id: string;
  status: string;
  event_date: string;
  talent_payable: number | null;
  pre_show_at?: string | null;
  completed_at?: string | null;
};

const incidentOptions = [
  ["buyer_cancellation", "Pembatalan oleh klien"],
  ["talent_cancellation", "Pembatalan oleh talent"],
  ["postponement", "Penundaan"],
  ["no_show", "Tidak hadir"],
  ["late_arrival", "Terlambat hadir"],
  ["shortened_performance", "Durasi tampil dipersingkat"],
  ["technical_failure", "Kendala teknis"],
  ["payment_dispute", "Sengketa pembayaran"],
  ["force_majeure", "Keadaan kahar"],
  ["other", "Lainnya"],
] as const;

function money(value: number | null) {
  if (value == null) return "—";
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(value);
}

function incidentLabel(value: string) {
  return incidentOptions.find(([option]) => option === value)?.[1] ?? value;
}

function partyLabel(party: string) {
  if (party === "buyer") return "Buyer/EO";
  if (party === "talent") return "Talent/Manager";
  if (party === "admin") return "NS Admin";
  return "System";
}

function checklistStatusLabel(status: OperationsChecklistItem["status"]) {
  if (status === "done") return "Selesai";
  if (status === "not_applicable") return "Tidak berlaku";
  return "Menunggu";
}

export function AdminOperations({
  booking,
  checklist,
  incidents,
  settlements,
  advanceConfirmed,
  recoveryBlockingIncidentId,
}: {
  booking: Booking;
  checklist: OperationsChecklistItem[];
  incidents: OperationsIncident[];
  settlements: TalentSettlement[];
  advanceConfirmed: boolean;
  recoveryBlockingIncidentId: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [incidentType, setIncidentType] = useState("technical_failure");
  const [incidentSummary, setIncidentSummary] = useState("");
  const [incidentDetails, setIncidentDetails] = useState("");
  const [resolutionNotes, setResolutionNotes] = useState<Record<string, string>>({});
  const [settlementAmount, setSettlementAmount] = useState("");
  const [settlementProvider, setSettlementProvider] = useState("");
  const [settlementReference, setSettlementReference] = useState("");

  const paid = useMemo(
    () => settlements.filter((row) => row.status === "paid").reduce((sum, row) => sum + Number(row.amount ?? 0), 0),
    [settlements],
  );
  const remaining = Math.max(0, Number(booking.talent_payable ?? 0) - paid);
  const openIncidents = incidents.filter((row) => row.status === "open");
  const checklistReady = checklist.length > 0 && checklist.every((item) => item.status !== "pending");

  async function act(action: string, extra: Record<string, unknown> = {}) {
    setBusy(action + (typeof extra.itemId === "string" ? `:${extra.itemId}` : ""));
    setError(null);
    try {
      const response = await fetch("/api/internal-demo/admin/operations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ bookingId: booking.id, action, ...extra }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.detail ?? body?.error ?? "Aksi operasional gagal");
      if (action === "report_incident") {
        setIncidentSummary("");
        setIncidentDetails("");
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Aksi operasional gagal");
    } finally {
      setBusy(null);
    }
  }

  async function recordSettlement() {
    const amount = Number(settlementAmount);
    if (!Number.isSafeInteger(amount) || amount <= 0) {
      setError("Nominal pembayaran tidak valid");
      return;
    }
    if (!settlementReference.trim()) {
      setError("Bukti atau referensi pembayaran wajib diisi");
      return;
    }

    setBusy("settlement");
    setError(null);
    try {
      const key = `${booking.id}:${settlementReference.trim()}:${amount}`;
      const response = await fetch("/api/internal-demo/admin/settlement", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          bookingId: booking.id,
          amount,
          provider: settlementProvider,
          providerReference: settlementReference,
          idempotencyKey: key,
        }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.detail ?? body?.error ?? "Pencatatan pembayaran gagal");
      setSettlementAmount("");
      setSettlementProvider("");
      setSettlementReference("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Pencatatan pembayaran gagal");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="mt-7 border border-black/10 bg-white p-5 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">Operasional</p>
          <p className="mt-1 text-xs text-black/45">Pra-acara → tampil → selesai/insiden → penyelesaian pembayaran</p>
        </div>
        <span className="border border-black/15 px-3 py-2 text-xs font-semibold uppercase">
          {bookingStatusLabel(booking.status)}
        </span>
      </div>

      {booking.status === "secured" && advanceConfirmed ? (
        <button
          onClick={() => act("initialize_pre_show")}
          disabled={busy !== null}
          className="mt-5 bg-black px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
        >
          Mulai checklist pra-acara
        </button>
      ) : null}

      {booking.status === "secured" && !advanceConfirmed ? (
        <div className="mt-5 border border-amber-500/30 bg-amber-50 p-4 text-sm text-amber-950">
          <p className="font-semibold">Show Advance belum confirmed.</p>
          <p className="mt-1 text-xs leading-5">Checklist pra-acara baru boleh dimulai setelah revision Show Advance aktif dikonfirmasi Buyer/EO dan Talent/Manager.</p>
        </div>
      ) : null}

      {booking.status === "pre_show" && !advanceConfirmed ? (
        <div className="mt-5 border border-red-700/20 bg-red-50 p-4 text-sm text-red-900">
          <p className="font-semibold">Operasional pause: Show Advance berubah setelah konfirmasi.</p>
          <p className="mt-1 text-xs leading-5">Reconfirm revision terbaru. Setelah final confirmation, task operasional akan dibuka ulang untuk revision baru.</p>
        </div>
      ) : null}

      {["pre_show", "incident"].includes(booking.status) && advanceConfirmed ? (
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <div className="border border-black/10 bg-[#f5f3ee] p-4">
            <p className="text-sm font-semibold">Buyer / EO checklist</p>
            <p className="mt-1 text-xs leading-5 text-black/45">Venue/access, logistics, call sheet, dan emergency contacts.</p>
            <div className="mt-3">
              <SecureAccessLinkButton scope="buyer_pre_show" subjectId={booking.id} label="Buat link Buyer / EO" delivery="copy" />
            </div>
          </div>
          <div className="border border-black/10 bg-[#f5f3ee] p-4">
            <p className="text-sm font-semibold">Talent / Manager checklist</p>
            <p className="mt-1 text-xs leading-5 text-black/45">Rider, lineup/backline, logistics acknowledgement, call sheet, dan emergency contacts.</p>
            <div className="mt-3">
              <SecureAccessLinkButton scope="talent_pre_show" subjectId={booking.id} label="Buat link Talent / Manager" delivery="copy" />
            </div>
          </div>
        </div>
      ) : null}

      {checklist.length > 0 ? (
        <div className="mt-6">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <p className="text-sm font-semibold">Checklist Pra-acara</p>
              <p className="mt-1 text-xs text-black/45">Admin hanya mengerjakan task internal. Task pihak lain direspons melalui secure link.</p>
            </div>
            <p className="text-xs font-semibold">{checklist.filter((item) => item.status !== "pending").length}/{checklist.length} selesai</p>
          </div>

          <div className="mt-3 divide-y divide-black/10 border border-black/10">
            {checklist.map((item) => {
              const adminOwned = item.required_parties.includes("admin");
              return (
                <div key={item.id} className="p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-sm font-medium">{item.checkpoint_code} · {item.label}</p>
                      <p className="mt-1 text-xs text-black/45">Batas waktu {item.due_date}</p>
                    </div>
                    <span className={`w-fit border px-2 py-1 text-xs font-semibold ${item.status === "pending" ? "border-amber-500/30 bg-amber-50 text-amber-950" : "border-emerald-700/20 bg-emerald-50 text-emerald-900"}`}>
                      {checklistStatusLabel(item.status)}
                    </span>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    {item.required_parties.map((party) => {
                      const confirmation = item.confirmations.find((row) => row.party === party);
                      return (
                        <span key={party} className="border border-black/10 px-2 py-1 text-xs">
                          {partyLabel(party)}: {confirmation ? (confirmation.response === "done" ? "✓" : "N/A") : "menunggu"}
                        </span>
                      );
                    })}
                  </div>

                  {adminOwned && booking.status === "pre_show" && advanceConfirmed ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => act("set_checklist_status", { itemId: item.id, status: "done" })}
                        disabled={busy !== null}
                        className="border border-black bg-black px-3 py-2 text-xs font-semibold text-white disabled:opacity-40"
                      >
                        Konfirmasi selesai
                      </button>
                      <button
                        type="button"
                        onClick={() => act("set_checklist_status", { itemId: item.id, status: "not_applicable" })}
                        disabled={busy !== null}
                        className="border border-black px-3 py-2 text-xs font-semibold disabled:opacity-40"
                      >
                        Tidak berlaku
                      </button>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {!["completed", "cancelled"].includes(booking.status) ? (
        <div className="mt-6 border-t border-black/10 pt-5">
          <p className="text-sm font-semibold">Insiden</p>
          <div className="mt-3 grid gap-2 md:grid-cols-[220px_1fr_auto]">
            <select value={incidentType} onChange={(event) => setIncidentType(event.target.value)} className="border border-black/15 p-2 text-sm">
              {incidentOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <input value={incidentSummary} onChange={(event) => setIncidentSummary(event.target.value)} placeholder="Ringkasan kejadian" className="border border-black/15 p-2 text-sm" />
            <button
              onClick={() => act("report_incident", { incidentType, summary: incidentSummary, details: incidentDetails })}
              disabled={busy !== null || !incidentSummary.trim()}
              className="border border-black px-4 py-2 text-sm font-semibold disabled:opacity-40"
            >
              Catat insiden
            </button>
          </div>
          <textarea value={incidentDetails} onChange={(event) => setIncidentDetails(event.target.value)} placeholder="Detail kejadian (opsional)" className="mt-2 min-h-20 w-full border border-black/15 p-2 text-sm" />
        </div>
      ) : null}

      {incidents.length > 0 ? (
        <div className="mt-4 space-y-2">
          {incidents.map((incident) => (
            <div key={incident.id} className="border border-black/10 p-3 text-sm">
              <div className="flex flex-wrap justify-between gap-2">
                <strong>{incidentLabel(incident.incident_type)}</strong>
                <span className="text-xs uppercase">{incident.status === "open" ? "Terbuka" : "Selesai"}</span>
              </div>
              <p className="mt-1 text-black/65">{incident.summary}</p>
              <p className="mt-1 text-xs text-black/45">
                Dilaporkan oleh {partyLabel(incident.reported_by_party)} · {new Date(incident.occurred_at).toLocaleString("id-ID")}
              </p>
              {incident.details ? <p className="mt-2 text-xs leading-5 text-black/55">{incident.details}</p> : null}
              {incident.evidence.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {incident.evidence.map((evidence) => {
                    const href = evidence.provider === "external_url" ? evidence.external_url : evidence.signed_url;
                    return href ? (
                      <a key={evidence.id} href={href} target="_blank" rel="noreferrer" className="border border-black/15 px-3 py-2 text-xs font-semibold underline">
                        {evidence.evidence_type === "link" ? "Buka link bukti" : evidence.original_filename ?? "Buka bukti"}
                      </a>
                    ) : null;
                  })}
                </div>
              ) : null}
              {incident.status === "open" && incident.id === recoveryBlockingIncidentId ? (
                <div className="mt-3 border border-amber-500/30 bg-amber-50 p-3 text-xs leading-5 text-amber-950">
                  Incident ini menjadi dasar recovery talent pengganti. Selesaikan atau tutup recovery terlebih dahulu sebelum incident dapat di-resolve.
                </div>
              ) : incident.status === "open" ? (
                <div className="mt-3 grid gap-2 md:grid-cols-[1fr_auto]">
                  <input
                    value={resolutionNotes[incident.id] ?? ""}
                    onChange={(event) => setResolutionNotes((current) => ({ ...current, [incident.id]: event.target.value }))}
                    placeholder="Catatan keputusan / penyelesaian"
                    className="border border-black/15 p-2 text-xs"
                  />
                  <button
                    onClick={() => act("resolve_incident", { incidentId: incident.id, resolutionNotes: resolutionNotes[incident.id] ?? "" })}
                    disabled={busy !== null || !(resolutionNotes[incident.id] ?? "").trim()}
                    className="border border-black px-3 py-2 text-xs font-semibold disabled:opacity-40"
                  >
                    Selesaikan insiden
                  </button>
                </div>
              ) : incident.resolution_notes ? (
                <p className="mt-3 border border-black/10 bg-[#f5f3ee] p-3 text-xs leading-5"><strong>Keputusan:</strong> {incident.resolution_notes}</p>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      {booking.status === "pre_show" && advanceConfirmed && !checklistReady ? (
        <div className="mt-6 border border-amber-500/30 bg-amber-50 p-4 text-sm text-amber-950">
          Pertunjukan belum dapat ditandai selesai karena masih ada task pra-acara yang pending.
        </div>
      ) : null}

      {booking.status === "pre_show" && openIncidents.length === 0 && advanceConfirmed && checklistReady ? (
        <button
          onClick={() => act("complete_show")}
          disabled={busy !== null}
          className="mt-6 bg-black px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
        >
          Tandai pertunjukan selesai
        </button>
      ) : null}

      <div className="mt-6 border-t border-black/10 pt-5">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="text-sm font-semibold">Penyelesaian Pembayaran Talent</p>
            <p className="mt-1 text-xs text-black/45">Mencatat pembayaran aktual; kewajiban terencana tetap mengikuti jadwal pembayaran.</p>
          </div>
          <div className="text-right text-xs text-black/55">Dibayar {money(paid)} · Sisa {money(remaining)}</div>
        </div>

        {["secured", "pre_show", "completed"].includes(booking.status) && remaining > 0 ? (
          <div className="mt-3 grid gap-2 md:grid-cols-4">
            <input type="number" min="1" step="1" value={settlementAmount} onChange={(event) => setSettlementAmount(event.target.value)} placeholder="Nominal" className="border border-black/15 p-2 text-sm" />
            <input value={settlementProvider} onChange={(event) => setSettlementProvider(event.target.value)} placeholder="Bank/penyedia" className="border border-black/15 p-2 text-sm" />
            <input value={settlementReference} onChange={(event) => setSettlementReference(event.target.value)} placeholder="Bukti/referensi transfer" className="border border-black/15 p-2 text-sm" />
            <button onClick={recordSettlement} disabled={busy !== null} className="border border-black px-4 py-2 text-sm font-semibold disabled:opacity-40">Catat dibayar</button>
          </div>
        ) : null}

        {settlements.length > 0 ? (
          <div className="mt-3 space-y-2">
            {settlements.map((row) => (
              <div key={row.id} className="border border-black/10 p-3 text-sm">
                {money(row.amount)} · {row.provider ?? "—"} · {row.provider_reference} · <strong>{row.status === "paid" ? "Dibayar" : row.status}</strong>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      {error ? <p className="mt-4 text-xs font-semibold text-red-700">{error}</p> : null}
    </section>
  );
}
