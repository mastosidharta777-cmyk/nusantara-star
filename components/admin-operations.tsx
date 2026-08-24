"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import type { OperationsChecklistItem, OperationsIncident, TalentSettlement } from "@/lib/operations-data";

type Booking = {
  id: string;
  status: string;
  event_date: string;
  talent_payable: number | null;
  pre_show_at?: string | null;
  completed_at?: string | null;
};

function money(value: number | null) {
  if (value == null) return "—";
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value);
}

const incidentOptions = [
  ["buyer_cancellation", "Buyer cancellation"], ["talent_cancellation", "Talent cancellation"], ["postponement", "Postponement"],
  ["no_show", "No-show"], ["late_arrival", "Late arrival"], ["shortened_performance", "Shortened performance"],
  ["technical_failure", "Technical failure"], ["payment_dispute", "Payment dispute"], ["force_majeure", "Force majeure"], ["other", "Other"],
] as const;

export function AdminOperations({ booking, checklist, incidents, settlements }: { booking: Booking; checklist: OperationsChecklistItem[]; incidents: OperationsIncident[]; settlements: TalentSettlement[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [incidentType, setIncidentType] = useState("technical_failure");
  const [incidentSummary, setIncidentSummary] = useState("");
  const [settlementAmount, setSettlementAmount] = useState("");
  const [settlementProvider, setSettlementProvider] = useState("");
  const [settlementReference, setSettlementReference] = useState("");

  const settlementPaid = useMemo(() => settlements.filter((row) => row.status === "paid").reduce((sum, row) => sum + Number(row.amount ?? 0), 0), [settlements]);
  const settlementRemaining = Math.max(0, Number(booking.talent_payable ?? 0) - settlementPaid);
  const openIncidents = incidents.filter((row) => row.status === "open");

  async function operationsAction(action: string, extra: Record<string, unknown> = {}) {
    setBusy(action); setError(null);
    try {
      const response = await fetch("/api/internal-demo/admin/operations", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ bookingId: booking.id, action, ...extra }) });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.detail ?? result?.error ?? "Operations action failed");
      if (action === "report_incident") setIncidentSummary("");
      router.refresh();
    } catch (err) { setError(err instanceof Error ? err.message : "Operations action failed"); } finally { setBusy(null); }
  }

  async function recordSettlement() {
    const amount = Number(settlementAmount);
    if (!Number.isSafeInteger(amount) || amount <= 0) { setError("Settlement amount is invalid"); return; }
    if (!settlementReference.trim()) { setError("Payment evidence/reference is required"); return; }
    setBusy("settlement"); setError(null);
    try {
      const idempotencyKey = `${booking.id}:${settlementReference.trim()}:${amount}`;
      const response = await fetch("/api/internal-demo/admin/settlement", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ bookingId: booking.id, amount, provider: settlementProvider, providerReference: settlementReference, idempotencyKey }) });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.detail ?? result?.error ?? "Settlement failed");
      setSettlementAmount(""); setSettlementProvider(""); setSettlementReference(""); router.refresh();
    } catch (err) { setError(err instanceof Error ? err.message : "Settlement failed"); } finally { setBusy(null); }
  }

  return <section className="mt-7 border border-black/10 bg-white p-5 md:p-6">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-sm font-semibold">Operations</p><p className="mt-1 text-xs text-black/45">Pre-show → Show → Completion / Incident → Settlement</p></div><span className="border border-black/15 px-3 py-2 text-xs font-semibold uppercase">{booking.status}</span></div>

    {booking.status === "secured" ? <button onClick={() => operationsAction("initialize_pre_show")} disabled={busy !== null} className="mt-5 bg-black px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">Start Pre-show Checklist</button> : null}

    {checklist.length > 0 ? <div className="mt-6"><p className="text-sm font-semibold">Pre-show Checklist</p><div className="mt-3 divide-y divide-black/10 border border-black/10">{checklist.map((item) => <div key={item.id} className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm font-medium">{item.checkpoint_code} · {item.label}</p><p className="mt-1 text-xs text-black/45">Due {item.due_date}</p></div><select value={item.status} disabled={busy !== null || booking.status === "completed"} onChange={(e) => operationsAction("set_checklist_status", { itemId: item.id, status: e.target.value })} className="border border-black/15 p-2 text-xs"><option value="pending">Pending</option><option value="done">Done</option><option value="not_applicable">N/A</option></select></div>)}</div></div> : null}

    {!["completed", "cancelled"].includes(booking.status) ? <div className="mt-6 border-t border-black/10 pt-5"><p className="text-sm font-semibold">Incident</p><div className="mt-3 grid gap-2 md:grid-cols-[220px_1fr_auto]"><select value={incidentType} onChange={(e) => setIncidentType(e.target.value)} className="border border-black/15 p-2 text-sm">{incidentOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><input value={incidentSummary} onChange={(e) => setIncidentSummary(e.target.value)} placeholder="Ringkasan kejadian" className="border border-black/15 p-2 text-sm" /><button onClick={() => operationsAction("report_incident", { incidentType, summary: incidentSummary })} disabled={busy !== null || !incidentSummary.trim()} className="border border-black px-4 py-2 text-sm font-semibold disabled:opacity-40">Report</button></div></div> : null}

    {incidents.length > 0 ? <div className="mt-4 space-y-2">{incidents.map((incident) => <div key={incident.id} className="border border-black/10 p-3 text-sm"><div className="flex flex-wrap justify-between gap-2"><strong>{incident.incident_type.replaceAll("_", " ")}</strong><span className="text-xs uppercase">{incident.status}</span></div><p className="mt-1 text-black/65">{incident.summary}</p>{incident.status === "open" ? <button onClick={() => operationsAction("resolve_incident", { incidentId: incident.id })} disabled={busy !== null} className="mt-3 border border-black px-3 py-2 text-xs font-semibold disabled:opacity-40">Resolve Incident</button> : null}</div>)}</div> : null}

    {["secured", "pre_show"].includes(booking.status) && openIncidents.length === 0 ? <button onClick={() => operationsAction("complete_show")} disabled={busy !== null} className="mt-6 bg-black px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">Mark Show Completed</button> : null}

    <div className="mt-6 border-t border-black/10 pt-5"><div className="flex flex-wrap items-end justify-between gap-2"><div><p className="text-sm font-semibold">Talent Settlement</p><p className="mt-1 text-xs text-black/45">Actual payout only; planned obligations remain in payment milestones.</p></div><div className="text-right text-xs text-black/55">Paid {money(settlementPaid)} · Remaining {money(settlementRemaining)}</div></div>
      {["secured", "pre_show", "completed"].includes(booking.status) && settlementRemaining > 0 ? <div className="mt-3 grid gap-2 md:grid-cols-4"><input type="number" min="1" step="1" value={settlementAmount} onChange={(e) => setSettlementAmount(e.target.value)} placeholder="Amount" className="border border-black/15 p-2 text-sm" /><input value={settlementProvider} onChange={(e) => setSettlementProvider(e.target.value)} placeholder="Bank/provider" className="border border-black/15 p-2 text-sm" /><input value={settlementReference} onChange={(e) => setSettlementReference(e.target.value)} placeholder="Transfer/reference evidence" className="border border-black/15 p-2 text-sm" /><button onClick={recordSettlement} disabled={busy !== null} className="border border-black px-4 py-2 text-sm font-semibold disabled:opacity-40">Record Paid</button></div> : null}
      {settlements.length > 0 ? <div className="mt-3 space-y-2">{settlements.map((row) => <div key={row.id} className="border border-black/10 p-3 text-sm">{money(row.amount)} · {row.provider ?? "—"} · {row.provider_reference} · <strong>{row.status}</strong></div>)}</div> : null}
    </div>
    {error ? <p className="mt-4 text-xs font-semibold text-red-700">{error}</p> : null}
  </section>;
}
