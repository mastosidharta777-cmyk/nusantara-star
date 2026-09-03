import Link from "next/link";

import { AdminNewTalentInvite } from "@/components/admin-new-talent-invite";
import { loadAdminDashboardData } from "@/lib/admin-data";
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
  const { talents, briefs, kpis } = await loadAdminDashboardData();
  return (
    <main className="min-h-screen bg-[#f5f3ee] text-[#171713]">
      <div className="mx-auto max-w-[1440px] px-5 py-8 md:px-10 md:py-10">
        <header className="flex flex-col gap-5 border-b border-black/10 pb-7 md:flex-row md:items-end md:justify-between">
          <div><p className="eyebrow mb-3">Nusantara Star Internal</p><h1 className="text-3xl font-semibold tracking-[-0.03em] md:text-5xl">Dasbor Admin</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-black/60 md:text-base">Brief → pencocokan / direct inquiry → ketersediaan → proposal → kesepakatan → booking terjamin.</p></div>
          <div className="w-fit border border-black/10 bg-white px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-black/60">Akses internal terautentikasi</div>
        </header>
        <section className="grid gap-3 py-7 sm:grid-cols-2 xl:grid-cols-5">{[["Talent aktif",kpis.totalTalents],["Terverifikasi",kpis.verifiedTalents],["Kalender perlu diperbarui",kpis.staleTalents],["Brief baru",kpis.newBriefs],["Brief aktif",kpis.activeBriefs]].map(([label,value])=><article key={label} className="border border-black/10 bg-white p-5"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-black/45">{label}</p><p className="mt-4 text-4xl font-semibold tracking-[-0.04em]">{value}</p></article>)}</section>
        <section className="mb-7 border border-black/10 bg-white"><div className="flex items-center justify-between border-b border-black/10 px-5 py-4"><div><p className="text-sm font-semibold">Brief terbaru</p><p className="mt-1 text-xs text-black/45">20 brief terbaru dari Supabase</p></div><span className="text-xs font-semibold text-black/45">{briefs.length} data</span></div>{briefs.length===0?<div className="px-5 py-10 text-sm text-black/50">Belum ada brief tersimpan.</div>:<div className="overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="border-b border-black/10 bg-black/[0.025] text-xs uppercase tracking-[0.12em] text-black/45"><tr>{["Acara","Tanggal","Kota","Jenis","Talent / kategori","Anggaran","Status","Aksi"].map(x=><th key={x} className="px-5 py-3 font-semibold">{x}</th>)}</tr></thead><tbody>{briefs.map(brief=><tr key={brief.id} className="border-b border-black/5 last:border-0"><td className="px-5 py-4 font-medium">{brief.event_type??"—"}</td><td className="px-5 py-4 text-black/65">{brief.event_date??"—"}</td><td className="px-5 py-4 text-black/65">{brief.city??"—"}</td><td className="px-5 py-4"><span className="border border-black/10 px-2 py-1 text-xs font-semibold uppercase tracking-[0.08em]">{brief.request_mode === "direct_talent" ? "Direct inquiry" : "Cari talent"}</span></td><td className="px-5 py-4 font-medium">{brief.request_mode === "direct_talent" ? brief.requested_talent_name ?? "Referensi talent bermasalah" : brief.talent_category ?? "—"}</td><td className="px-5 py-4 text-black/65">{money(brief.budget_min)} – {money(brief.budget_max)}</td><td className="px-5 py-4"><span className="border border-black/10 px-2 py-1 text-xs font-semibold uppercase tracking-[0.08em]">{brief.status}</span></td><td className="px-5 py-4"><Link href={`/admin/briefs/${brief.id}`} className="font-semibold underline underline-offset-4">Buka brief</Link></td></tr>)}</tbody></table></div>}</section>
        <section className="border border-black/10 bg-white"><div className="flex flex-col gap-4 border-b border-black/10 px-5 py-4 lg:flex-row lg:items-start lg:justify-between"><div><p className="text-sm font-semibold">Database Talent</p><p className="mt-1 text-xs text-black/45">Status internal, kisaran fee, dan pembaruan kalender · {talents.length} talent</p></div><AdminNewTalentInvite /></div><div className="overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="border-b border-black/10 bg-black/[0.025] text-xs uppercase tracking-[0.12em] text-black/45"><tr>{["Talent","Kategori","Kota","Kisaran fee","Status internal","Pembaruan ketersediaan","Aksi"].map(x=><th key={x} className="px-5 py-3 font-semibold">{x}</th>)}</tr></thead><tbody>{talents.map(talent=><tr key={talent.id} className="border-b border-black/5 last:border-0"><td className="px-5 py-4 font-semibold">{talent.name || "Pendaftaran baru"}</td><td className="px-5 py-4 text-black/65">{talent.category || "Belum diisi"}</td><td className="px-5 py-4 text-black/65">{talent.base_city??"—"}</td><td className="whitespace-nowrap px-5 py-4 text-black/65">{money(talent.budget_min)} – {money(talent.budget_max)}</td><td className="px-5 py-4"><span className="border border-black/10 px-2 py-1 text-xs font-semibold uppercase tracking-[0.08em]">{talent.status}</span></td><td className="px-5 py-4"><span className={`inline-flex border px-2 py-1 text-xs font-semibold ${freshnessClass(talent.freshness)}`}>{freshnessLabelId(talent.freshness)}{talent.daysSinceCalendarUpdate!=null?` · ${talent.daysSinceCalendarUpdate} hari`:""}</span></td><td className="px-5 py-4"><Link href={`/admin/talents/${talent.id}`} className="font-semibold underline underline-offset-4">Buka talent</Link></td></tr>)}</tbody></table></div></section>
      </div>
    </main>
  );
}
