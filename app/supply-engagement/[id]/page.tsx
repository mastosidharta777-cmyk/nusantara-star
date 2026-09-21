import { notFound } from "next/navigation";

import { SupplyEngagementResponse } from "@/components/supply-engagement-response";
import { verifyAccessToken } from "@/lib/signed-access";
import { loadSupplyEngagementDetail } from "@/lib/supply-engagement-detail";
import { supplyTypeLabel } from "@/lib/supply-onboarding";

export const dynamic = "force-dynamic";

function money(value: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value);
}

function dateTime(value: string | null) {
  return value ? new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" }).format(new Date(value)) + " WIB" : null;
}

function actionLabel(action: string) {
  const labels: Record<string, string> = {
    work_started: "Pekerjaan dimulai",
    delivery_submitted: "Output dikirim untuk ditinjau",
    revision_requested: "Revisi diminta",
    delivery_accepted: "Output diterima",
  };
  return labels[action] ?? action;
}

export default async function SupplyEngagementPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ token?: string }> }) {
  const { id } = await params;
  const { token = "" } = await searchParams;
  if (!verifyAccessToken(token, "supply_engagement", id)) notFound();
  const engagement = await loadSupplyEngagementDetail(id);
  if (!engagement) notFound();

  return <main className="min-h-screen bg-[#f5f3ee] text-[#171713]"><div className="mx-auto max-w-[760px] px-5 py-8 md:px-10 md:py-12"><p className="eyebrow mb-3">Nusantara Star · Work Order</p><h1 className="text-3xl font-semibold tracking-[-0.03em] md:text-5xl">{engagement.project_name}</h1><p className="mt-3 text-sm leading-6 text-black/55">Scope dan komersial Work Order tidak berubah. Timeline di bawah hanya mencatat delivery, revisi, dan acceptance secara operasional.</p><section className="mt-7 border border-black/10 bg-white p-5 md:p-6"><div className="grid gap-5 sm:grid-cols-2"><div><p className="text-xs font-semibold uppercase tracking-[0.12em] text-black/40">Nomor Work Order</p><p className="mt-2 font-semibold">{engagement.work_order_reference}</p></div><div><p className="text-xs font-semibold uppercase tracking-[0.12em] text-black/40">Pihak Supply</p><p className="mt-2 font-semibold">{engagement.supply_name_snapshot}</p><p className="mt-1 text-xs text-black/45">{supplyTypeLabel(engagement.supply_type)}</p></div><div><p className="text-xs font-semibold uppercase tracking-[0.12em] text-black/40">Layanan</p><p className="mt-2 font-semibold">{engagement.service_label_snapshot}</p></div><div><p className="text-xs font-semibold uppercase tracking-[0.12em] text-black/40">Tanggal / kota</p><p className="mt-2 font-semibold">{engagement.event_date ?? "Belum ditentukan"}{engagement.city ? ` · ${engagement.city}` : ""}</p></div>{engagement.delivery_due_at ? <div className="sm:col-span-2"><p className="text-xs font-semibold uppercase tracking-[0.12em] text-black/40">Batas delivery / kesiapan</p><p className="mt-2 font-semibold">{dateTime(engagement.delivery_due_at)}</p></div> : null}<div className="sm:col-span-2"><p className="text-xs font-semibold uppercase tracking-[0.12em] text-black/40">Scope pekerjaan</p><p className="mt-2 whitespace-pre-wrap text-sm leading-6">{engagement.scope_of_work}</p></div><div className="sm:col-span-2"><p className="text-xs font-semibold uppercase tracking-[0.12em] text-black/40">Deliverables</p><ul className="mt-2 space-y-2 text-sm">{engagement.deliverables.map((item) => <li key={item}>• {item}</li>)}</ul></div><div><p className="text-xs font-semibold uppercase tracking-[0.12em] text-black/40">Fee disepakati</p><p className="mt-2 font-semibold">{money(engagement.agreed_fee)}</p></div><div><p className="text-xs font-semibold uppercase tracking-[0.12em] text-black/40">Termin pembayaran</p><p className="mt-2 font-semibold">{engagement.payment_terms}</p></div></div><SupplyEngagementResponse engagementId={engagement.id} token={token} initialStatus={engagement.status} />{engagement.delivery_actions.length ? <div className="mt-6 border-t border-black/10 pt-5"><p className="text-xs font-semibold uppercase tracking-[0.12em] text-black/40">Riwayat delivery</p><ol className="mt-3 space-y-3">{engagement.delivery_actions.map((item) => <li key={item.id} className="border-l-2 border-black/15 pl-3"><p className="text-sm font-semibold">{actionLabel(item.action)}</p><p className="mt-1 text-xs text-black/50">{dateTime(item.created_at)} · {item.actor === "supplier" ? "Pihak supply" : "Nusantara Star"}</p>{item.note ? <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-black/65">{item.note}</p> : null}{item.delivery_url ? <a href={item.delivery_url} target="_blank" rel="noreferrer" className="mt-1 inline-block text-sm font-semibold underline">Buka output yang dikirim</a> : null}</li>)}</ol></div> : null}</section></div></main>;
}
