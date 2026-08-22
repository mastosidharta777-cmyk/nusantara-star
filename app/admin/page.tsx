import Link from "next/link";
import { notFound } from "next/navigation";

import { loadAdminDashboardData } from "@/lib/admin-data";

export const dynamic = "force-dynamic";

function money(value: number | null) {
  if (value == null) return "—";
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(value);
}

function freshnessLabel(value: string) {
  if (value === "fresh") return "Fresh";
  if (value === "needs_confirmation") return "Needs Confirmation";
  if (value === "stale") return "Stale";
  return "Never Updated";
}

function freshnessClass(value: string) {
  if (value === "fresh") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (value === "needs_confirmation") return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-red-200 bg-red-50 text-red-700";
}

export default async function AdminPage() {
  if (process.env.VERCEL_ENV === "production") notFound();

  const { talents, briefs, kpis } = await loadAdminDashboardData();

  return (
    <main className="min-h-screen bg-[#f5f3ee] text-[#171713]">
      <div className="mx-auto max-w-[1440px] px-5 py-8 md:px-10 md:py-10">
        <header className="flex flex-col gap-5 border-b border-black/10 pb-7 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="eyebrow mb-3">Nusantara Star Internal</p>
            <h1 className="text-3xl font-semibold tracking-[-0.03em] md:text-5xl">Admin Dashboard</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-black/60 md:text-base">
              Brief → matching → availability confirmation. Preview-only V1, connected to Supabase.
            </p>
          </div>
          <div className="w-fit border border-black/10 bg-white px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-black/60">
            Preview Only
          </div>
        </header>

        <section className="grid gap-3 py-7 sm:grid-cols-2 xl:grid-cols-5">
          {[
            ["Active Talents", kpis.totalTalents],
            ["Verified", kpis.verifiedTalents],
            ["Stale Calendar", kpis.staleTalents],
            ["New Briefs", kpis.newBriefs],
            ["Active Briefs", kpis.activeBriefs],
          ].map(([label, value]) => (
            <article key={label} className="border border-black/10 bg-white p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-black/45">{label}</p>
              <p className="mt-4 text-4xl font-semibold tracking-[-0.04em]">{value}</p>
            </article>
          ))}
        </section>

        <section className="mb-7 border border-black/10 bg-white">
          <div className="flex items-center justify-between border-b border-black/10 px-5 py-4">
            <div>
              <p className="text-sm font-semibold">Recent Briefs</p>
              <p className="mt-1 text-xs text-black/45">Latest 20 briefs from Supabase</p>
            </div>
            <span className="text-xs font-semibold text-black/45">{briefs.length} records</span>
          </div>

          {briefs.length === 0 ? (
            <div className="px-5 py-10 text-sm text-black/50">
              Belum ada brief tersimpan. Brief pertama yang dipersist ke Supabase akan muncul di sini.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-black/10 bg-black/[0.025] text-xs uppercase tracking-[0.12em] text-black/45">
                  <tr>
                    <th className="px-5 py-3 font-semibold">Event</th>
                    <th className="px-5 py-3 font-semibold">Date</th>
                    <th className="px-5 py-3 font-semibold">City</th>
                    <th className="px-5 py-3 font-semibold">Talent</th>
                    <th className="px-5 py-3 font-semibold">Budget</th>
                    <th className="px-5 py-3 font-semibold">Status</th>
                    <th className="px-5 py-3 font-semibold">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {briefs.map((brief) => (
                    <tr key={brief.id} className="border-b border-black/5 last:border-0">
                      <td className="px-5 py-4 font-medium">{brief.event_type ?? "—"}</td>
                      <td className="px-5 py-4 text-black/65">{brief.event_date ?? "—"}</td>
                      <td className="px-5 py-4 text-black/65">{brief.city ?? "—"}</td>
                      <td className="px-5 py-4 text-black/65">{brief.talent_category ?? "—"}</td>
                      <td className="px-5 py-4 text-black/65">
                        {money(brief.budget_min)} – {money(brief.budget_max)}
                      </td>
                      <td className="px-5 py-4">
                        <span className="border border-black/10 px-2 py-1 text-xs font-semibold uppercase tracking-[0.08em]">
                          {brief.status}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <Link href={`/admin/briefs/${brief.id}`} className="font-semibold underline underline-offset-4">
                          Open Brief
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="border border-black/10 bg-white">
          <div className="flex flex-col gap-2 border-b border-black/10 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold">Talent Database</p>
              <p className="mt-1 text-xs text-black/45">Internal status, rate, and calendar freshness</p>
            </div>
            <span className="text-xs font-semibold text-black/45">{talents.length} talents</span>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-black/10 bg-black/[0.025] text-xs uppercase tracking-[0.12em] text-black/45">
                <tr>
                  <th className="px-5 py-3 font-semibold">Talent</th>
                  <th className="px-5 py-3 font-semibold">Category</th>
                  <th className="px-5 py-3 font-semibold">City</th>
                  <th className="px-5 py-3 font-semibold">Rate</th>
                  <th className="px-5 py-3 font-semibold">Internal Status</th>
                  <th className="px-5 py-3 font-semibold">Availability Freshness</th>
                </tr>
              </thead>
              <tbody>
                {talents.map((talent) => (
                  <tr key={talent.id} className="border-b border-black/5 last:border-0">
                    <td className="px-5 py-4 font-semibold">{talent.name}</td>
                    <td className="px-5 py-4 text-black/65">{talent.category}</td>
                    <td className="px-5 py-4 text-black/65">{talent.base_city ?? "—"}</td>
                    <td className="whitespace-nowrap px-5 py-4 text-black/65">
                      {money(talent.budget_min)} – {money(talent.budget_max)}
                    </td>
                    <td className="px-5 py-4">
                      <span className="border border-black/10 px-2 py-1 text-xs font-semibold uppercase tracking-[0.08em]">
                        {talent.status}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <span className={`inline-flex border px-2 py-1 text-xs font-semibold ${freshnessClass(talent.freshness)}`}>
                        {freshnessLabel(talent.freshness)}
                        {talent.daysSinceCalendarUpdate != null ? ` · ${talent.daysSinceCalendarUpdate}d` : ""}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
