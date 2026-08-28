import Link from "next/link";
import { notFound } from "next/navigation";

import { AdminTalentCommercialProfile } from "@/components/admin-talent-commercial-profile";
import { AdminTalentOnboardingLink } from "@/components/admin-talent-onboarding-link";
import { AdminTalentOnboardingReview } from "@/components/admin-talent-onboarding-review";
import { AdminTalentOperationalBasics } from "@/components/admin-talent-operational-basics";
import { loadAdminTalentDetail } from "@/lib/admin-talent-detail";

function money(value: number | null) {
  if (value == null) return "—";
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value);
}

export default async function AdminTalentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const detail = await loadAdminTalentDetail(id);
  if (!detail) notFound();
  const { talent, paymentPolicies } = detail;

  return <main className="min-h-screen bg-[#f5f3ee] text-[#171713]"><div className="mx-auto max-w-[1080px] px-5 py-8 md:px-10 md:py-10">
    <Link href="/admin" className="text-sm font-semibold text-black/55 hover:text-black">← Admin Dashboard</Link>
    <header className="mt-6 border-b border-black/10 pb-7"><p className="eyebrow mb-3">Nusantara Star Internal · Profil Talent</p><div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between"><div><h1 className="text-3xl font-semibold tracking-[-0.03em] md:text-5xl">{talent.name}</h1><p className="mt-3 text-sm text-black/55">{talent.category} · {talent.base_city || "Kota belum diisi"}</p></div><span className="w-fit border border-black/10 bg-white px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em]">{talent.status}</span></div></header>

    <section className="grid gap-3 py-7 sm:grid-cols-3"><article className="border border-black/10 bg-white p-4"><p className="text-xs font-semibold uppercase tracking-[0.12em] text-black/40">Rate Minimum</p><p className="mt-3 text-sm font-semibold">{money(talent.budget_min)}</p></article><article className="border border-black/10 bg-white p-4"><p className="text-xs font-semibold uppercase tracking-[0.12em] text-black/40">Rate Maksimum</p><p className="mt-3 text-sm font-semibold">{money(talent.budget_max)}</p></article><article className="border border-black/10 bg-white p-4"><p className="text-xs font-semibold uppercase tracking-[0.12em] text-black/40">Termin Pembayaran</p><p className="mt-3 text-sm font-semibold">{paymentPolicies.length ? `${paymentPolicies.length} tahap` : "Belum diatur"}</p></article></section>

    <AdminTalentOperationalBasics talentId={talent.id} initialBaseCity={talent.base_city} initialBudgetMin={talent.budget_min} initialBudgetMax={talent.budget_max} lastCalendarUpdatedAt={talent.last_calendar_updated_at} />
    <AdminTalentOnboardingLink talentId={talent.id} />
    <div className="mt-5"><AdminTalentOnboardingReview talentId={talent.id} /></div>

    <details className="border border-black/10 bg-white p-5">
      <summary className="cursor-pointer text-sm font-semibold">Pengaturan komersial <span className="font-normal text-black/45">(opsional, internal)</span></summary>
      <p className="mt-3 text-xs text-black/45">Dipakai untuk menyimpan termin pembayaran default talent. Bukan bagian review media dan tidak ditampilkan langsung sebagai kontak buyer.</p>
      <div className="mt-5"><AdminTalentCommercialProfile talentId={talent.id} policies={paymentPolicies} /></div>
    </details>
  </div></main>;
}
