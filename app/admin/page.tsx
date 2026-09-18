import Link from "next/link";

import { AdminNewSupplyInvite } from "@/components/admin-new-supply-invite";
import { loadAdminDashboardData } from "@/lib/admin-data";
import { loadOperationsInbox } from "@/lib/operations-inbox";
import { supplyServiceSummary, supplyTypeLabel } from "@/lib/supply-onboarding";
import { freshnessLabelId } from "@/lib/ui-language";

export const dynamic = "force-dynamic";

function money(value: number | null) {
  if (value == null) return "—";
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value);
}
function freshnessClass(value: string) {
  if (value === "fresh") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (value === "needs_confirmation") return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-red-200 bg-red-50 text-red-700";
}

export default async function AdminPage() {
  const [{ talents, supplyIntake, briefs, kpis }, operations] = await Promise.all([loadAdminDashboardData(), loadOperationsInbox()]);
  return (
    <main className="min-h-screen bg-[#f5f3ee] text-[#171713]">
      <div className="mx-auto max-w-[1440px] px-5 py-8 md:px-10 md:py-10">
        <header className="flex flex-col gap-5 border-b border-black/10 pb-7 md:flex-row md:items-end md:justify-between">
          <div><p className="eyebrow mb-3">Nusantara Star Internal</p><h1 className="text-3xl font-semibold tracking-[-0.03em] md:text-5xl">Dasbor Admin</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-black/60 md:text-base">Brief → pencocokan / direct inquiry → ketersediaan → proposal → kesepakatan → booking terjamin.</p></div>
          <div className="w-fit border border-black/10 bg-white px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-black/60">Akses internal terautentikasi</div>
        </header>

        <section className="grid gap-3 py-7 sm:grid-cols-2 xl:grid-cols-5">{[["Talent aktif",kpis.totalTalents],["Terverifikasi",kpis.verifiedTalents],["Kalender perlu diperbarui",kpis.staleTalents],["Brief baru",kpis.newBriefs],["Brief aktif",kpis.activeBriefs]].map(([label,value])=><article key={label} className="border border-black/10 bg-white p-5"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-black/45">{label}</p><p className="mt-4 text-4xl font-semibold tracking-[-0.04em]">{value}</p></article>)}</section>

        <section className="mb-7 border border-black/10 bg-white">
          <div className="flex flex-col gap-3 border-b border-black/10 px-5 py-4 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-sm font-semibold">Operations Inbox</p>
              <p className="mt-1 text-xs leading-5 text-black/45">Hanya exception yang membutuhkan perhatian. Status dihitung langsung dari data operasional; tidak membuat state baru.</p>
            </div>
            <div className="flex gap-2 text-xs font-semibold">
              <span className="border border-red-200 bg-red-50 px-3 py-2 text-red-700">{operations.urgentCount} urgent</span>
              <span className="border border-amber-200 bg-amber-50 px-3 py-2 text-amber-800">{operations.paymentCount} settlement</span>
              <span className="border border-black/10 px-3 py-2 text-black/55">{operations.items.length} perlu perhatian</span>
            </div>
          </div>
          {operations.items.length === 0 ? (
            <div className="px-5 py-8 text-sm text-black/50">Tidak ada exception operasional yang perlu ditangani saat ini.</div>
          ) : (
            <div>
              {operations.items.map((item) => (
                <article key={item.key} className="grid gap-4 border-b border-black/5 px-5 py-4 last:border-0 md:grid-cols-[110px_1fr_auto] md:items-center">
                  <div>
                    <span className={item.priority === "urgent" ? "inline-flex border border-red-200 bg-red-50 px-2 py-1 text-xs font-semibold uppercase tracking-[0.08em] text-red-700" : "inline-flex border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-semibold uppercase tracking-[0.08em] text-amber-800"}>
                      {item.priority === "urgent" ? "Urgent" : "Action"}
                    </span>
                  </div>
                  <div>
                    <p className="text-sm font-semibold">{item.title}</p>
                    <p className="mt-1 text-xs leading-5 text-black/50">{item.eventLabel}{item.eventDate ? ` · ${item.eventDate}` : ""}{item.city ? ` · ${item.city}` : ""}</p>
                    <p className="mt-1 text-sm leading-5 text-black/65">{item.detail}</p>
                    {item.amount != null ? <p className="mt-1 text-sm font-semibold">{money(item.amount)}</p> : null}
                  </div>
                  <Link href={`/admin/briefs/${item.briefId}`} className="w-fit font-semibold underline underline-offset-4">Review</Link>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="mb-7 border border-black/10 bg-white p-5 md:p-6">
          <div className="mb-5"><p className="text-sm font-semibold">Pendaftaran Supply Baru</p><p className="mt-1 text-xs text-black/45">Admin menentukan jenis supply dan kategori sebelum link dibuat. Talent tetap memakai flow Talent yang sudah ada.</p></div>
          <AdminNewSupplyInvite />
        </section>

        <section className="mb-7 border border-black/10 bg-white"><div className="flex items-center justify-between border-b border-black/10 px-5 py-4"><div><p className="text-sm font-semibold">Brief terbaru</p><p className="mt-1 text-xs text-black/45">20 brief terbaru dari Supabase</p></div><span className="text-xs font-semibold text-black/45">{briefs.length} data</span></div>{briefs.length===0?<div className="px-5 py-10 text-sm text-black/50">Belum ada brief tersimpan.</div>:<div className="overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="border-b border-black/10 bg-black/[0.025] text-xs uppercase tracking-[0.12em] text-black/45"><tr>{["Acara","Tanggal","Kota","Jenis","Talent / kategori","Anggaran","Status","Aksi"].map(x=><th key={x} className="px-5 py-3 font-semibold">{x}</th>)}</tr></thead><tbody>{briefs.map(brief=><tr key={brief.id} className="border-b border-black/5 last:border-0"><td className="px-5 py-4 font-medium">{brief.event_type??"—"}</td><td className="px-5 py-4 text-black/65">{brief.event_date??"—"}</td><td className="px-5 py-4 text-black/65">{brief.city??"—"}</td><td className="px-5 py-4"><span className="border border-black/10 px-2 py-1 text-xs font-semibold uppercase tracking-[0.08em]">{brief.request_mode === "direct_talent" ? "Direct inquiry" : "Cari talent"}</span></td><td className="px-5 py-4 font-medium">{brief.request_mode === "direct_talent" ? brief.requested_talent_name ?? "Referensi talent bermasalah" : brief.talent_category ?? "—"}</td><td className="px-5 py-4 text-black/65">{money(brief.budget_min)} – {money(brief.budget_max)}</td><td className="px-5 py-4"><span className="border border-black/10 px-2 py-1 text-xs font-semibold uppercase tracking-[0.08em]">{brief.status}</span></td><td className="px-5 py-4"><Link href={`/admin/briefs/${brief.id}`} className="font-semibold underline underline-offset-4">Buka brief</Link></td></tr>)}</tbody></table></div>}</section>

        <section className="mb-7 border border-black/10 bg-white"><div className="flex items-center justify-between border-b border-black/10 px-5 py-4"><div><p className="text-sm font-semibold">Database Talent</p><p className="mt-1 text-xs text-black/45">Hanya supply_type Talent · {talents.length} talent</p></div></div><div className="overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="border-b border-black/10 bg-black/[0.025] text-xs uppercase tracking-[0.12em] text-black/45"><tr>{["Talent","Kategori","Kota","Kisaran fee","Status internal","Pembaruan ketersediaan","Aksi"].map(x=><th key={x} className="px-5 py-3 font-semibold">{x}</th>)}</tr></thead><tbody>{talents.map(talent=><tr key={talent.id} className="border-b border-black/5 last:border-0"><td className="px-5 py-4 font-semibold">{talent.name || "Pendaftaran baru"}</td><td className="px-5 py-4 text-black/65">{talent.category || "Belum diisi"}</td><td className="px-5 py-4 text-black/65">{talent.base_city??"—"}</td><td className="whitespace-nowrap px-5 py-4 text-black/65">{money(talent.budget_min)} – {money(talent.budget_max)}</td><td className="px-5 py-4"><span className="border border-black/10 px-2 py-1 text-xs font-semibold uppercase tracking-[0.08em]">{talent.status}</span></td><td className="px-5 py-4"><span className={`inline-flex border px-2 py-1 text-xs font-semibold ${freshnessClass(talent.freshness)}`}>{freshnessLabelId(talent.freshness)}{talent.daysSinceCalendarUpdate!=null?` · ${talent.daysSinceCalendarUpdate} hari`:""}</span></td><td className="px-5 py-4"><Link href={`/admin/talents/${talent.id}`} className="font-semibold underline underline-offset-4">Buka talent</Link></td></tr>)}</tbody></table></div></section>

        <section className="border border-black/10 bg-white"><div className="flex items-center justify-between border-b border-black/10 px-5 py-4"><div><p className="text-sm font-semibold">Professional & Production Partner Intake</p><p className="mt-1 text-xs text-black/45">Terpisah dari Talent dan belum masuk matching/catalog Talent.</p></div><span className="text-xs font-semibold text-black/45">{supplyIntake.length} profil</span></div>{supplyIntake.length===0?<div className="px-5 py-10 text-sm text-black/50">Belum ada Professional atau Production Partner.</div>:<div className="overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="border-b border-black/10 bg-black/[0.025] text-xs uppercase tracking-[0.12em] text-black/45"><tr>{["Jenis","Nama","Layanan utama","Layanan tambahan","Kota","Onboarding","Status internal","Publik","Aksi"].map(x=><th key={x} className="px-5 py-3 font-semibold">{x}</th>)}</tr></thead><tbody>{supplyIntake.map(item=>{const services=supplyServiceSummary(item.supply_type,item.supply_service_ids,item.primary_supply_service_id,item.supply_other_service);return <tr key={item.id} className="border-b border-black/5 last:border-0"><td className="px-5 py-4 font-semibold">{supplyTypeLabel(item.supply_type)}</td><td className="px-5 py-4">{item.name || "Pendaftaran baru"}</td><td className="px-5 py-4 text-black/65">{services.primary}</td><td className="px-5 py-4 text-black/65">{services.additional.join(", ") || "—"}</td><td className="px-5 py-4 text-black/65">{item.base_city??"—"}</td><td className="px-5 py-4"><span className="border border-black/10 px-2 py-1 text-xs font-semibold uppercase tracking-[0.08em]">{item.onboarding_status}</span></td><td className="px-5 py-4">{item.status}</td><td className="px-5 py-4">{item.public_visible ? "Ya" : "Tidak"}</td><td className="px-5 py-4"><Link href={`/admin/talents/${item.id}`} className="font-semibold underline underline-offset-4">Buka profil</Link></td></tr>})}</tbody></table></div>}</section>
      </div>
    </main>
  );
}
