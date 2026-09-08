import Link from "next/link";
import { notFound } from "next/navigation";

import { AdminMusicOnboardingReview } from "@/components/admin-music-onboarding-review";
import { AdminSupplyOnboardingLink } from "@/components/admin-supply-onboarding-link";
import { AdminSupplyOnboardingReview } from "@/components/admin-supply-onboarding-review";
import { AdminTalentCommercialProfile } from "@/components/admin-talent-commercial-profile";
import { AdminTalentOnboardingLink } from "@/components/admin-talent-onboarding-link";
import { AdminTalentOnboardingReview } from "@/components/admin-talent-onboarding-review";
import { AdminTalentOperationalBasics } from "@/components/admin-talent-operational-basics";
import { loadAdminTalentDetail } from "@/lib/admin-talent-detail";
import { supplyTypeLabel } from "@/lib/supply-onboarding";

function money(value: number | null) {
  if (value == null) return "—";
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value);
}

export default async function AdminTalentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const detail = await loadAdminTalentDetail(id);
  if (!detail) notFound();
  const { talent, paymentPolicies } = detail;
  const isTalent = talent.supply_type === "talent";
  const nonTalentSupplyType = talent.supply_type === "professional" || talent.supply_type === "production_partner" ? talent.supply_type : null;
  const supplyLabel = supplyTypeLabel(talent.supply_type);

  return <main className="min-h-screen bg-[#f5f3ee] text-[#171713]"><div className="mx-auto max-w-[1080px] px-5 py-8 md:px-10 md:py-10">
    <Link href="/admin" className="text-sm font-semibold text-black/55 hover:text-black">← Admin Dashboard</Link>
    <header className="mt-6 border-b border-black/10 pb-7"><p className="eyebrow mb-3">Nusantara Star Internal · Profil {supplyLabel}</p><div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between"><div><h1 className="text-3xl font-semibold tracking-[-0.03em] md:text-5xl">{talent.name || "Pendaftaran baru"}</h1><p className="mt-3 text-sm text-black/55">{talent.category || "Kategori belum diisi"} · {talent.base_city || "Kota belum diisi"}</p></div><div className="flex flex-wrap gap-2"><span className="w-fit border border-black/10 bg-white px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em]">{talent.status}</span><span className="w-fit border border-black/10 bg-white px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em]">{talent.onboarding_status}</span></div></div></header>

    {isTalent ? <>
      <section className="grid gap-3 py-7 sm:grid-cols-3"><article className="border border-black/10 bg-white p-4"><p className="text-xs font-semibold uppercase tracking-[0.12em] text-black/40">Rate Minimum</p><p className="mt-3 text-sm font-semibold">{money(talent.budget_min)}</p></article><article className="border border-black/10 bg-white p-4"><p className="text-xs font-semibold uppercase tracking-[0.12em] text-black/40">Rate Maksimum</p><p className="mt-3 text-sm font-semibold">{money(talent.budget_max)}</p></article><article className="border border-black/10 bg-white p-4"><p className="text-xs font-semibold uppercase tracking-[0.12em] text-black/40">Termin Pembayaran</p><p className="mt-3 text-sm font-semibold">{paymentPolicies.length ? `${paymentPolicies.length} tahap` : "Belum diatur"}</p></article></section>

      <AdminTalentOperationalBasics talentId={talent.id} initialBaseCity={talent.base_city} initialBudgetMin={talent.budget_min} initialBudgetMax={talent.budget_max} lastCalendarUpdatedAt={talent.last_calendar_updated_at} />
      <AdminTalentOnboardingLink talentId={talent.id} />
      <div className="mt-5"><AdminMusicOnboardingReview talentId={talent.id} /><AdminTalentOnboardingReview talentId={talent.id} /></div>

      <details className="border border-black/10 bg-white p-5">
        <summary className="cursor-pointer text-sm font-semibold">Pengaturan komersial <span className="font-normal text-black/45">(opsional, internal)</span></summary>
        <p className="mt-3 text-xs text-black/45">Dipakai untuk menyimpan termin pembayaran default talent. Bukan bagian review media dan tidak ditampilkan langsung sebagai kontak buyer.</p>
        <div className="mt-5"><AdminTalentCommercialProfile talentId={talent.id} policies={paymentPolicies} /></div>
      </details>
    </> : nonTalentSupplyType ? <>
      <section className="grid gap-3 py-7 sm:grid-cols-3">
        <article className="border border-black/10 bg-white p-4"><p className="text-xs font-semibold uppercase tracking-[0.12em] text-black/40">Jenis Supply</p><p className="mt-3 text-sm font-semibold">{supplyLabel}</p></article>
        <article className="border border-black/10 bg-white p-4"><p className="text-xs font-semibold uppercase tracking-[0.12em] text-black/40">Onboarding</p><p className="mt-3 text-sm font-semibold">{talent.onboarding_status}</p></article>
        <article className="border border-black/10 bg-white p-4"><p className="text-xs font-semibold uppercase tracking-[0.12em] text-black/40">Publik</p><p className="mt-3 text-sm font-semibold">{talent.public_visible ? "Aktif" : "Tidak aktif"}</p></article>
      </section>
      <p className="border border-black/10 bg-white p-4 text-sm text-black/55">Profil {supplyLabel} terpisah dari matching dan katalog Talent. Persetujuan onboarding hanya memverifikasi database internal; publikasi membutuhkan aktivasi terpisah.</p>
      <AdminSupplyOnboardingLink supplyId={talent.id} supplyType={nonTalentSupplyType} />
      <AdminSupplyOnboardingReview supplyId={talent.id} />
    </> : null}
  </div></main>;
}
