import Link from "next/link";
import { notFound } from "next/navigation";

import { AdminTalentCommercialProfile } from "@/components/admin-talent-commercial-profile";
import { loadAdminTalentDetail } from "@/lib/admin-talent-detail";

function money(value: number | null) {
  if (value == null) return "—";
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value);
}

export default async function AdminTalentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const detail = await loadAdminTalentDetail(id);
  if (!detail) notFound();

  const { talent, paymentPolicies, media } = detail;

  return (
    <main className="min-h-screen bg-[#f5f3ee] text-[#171713]">
      <div className="mx-auto max-w-[1080px] px-5 py-8 md:px-10 md:py-10">
        <Link href="/admin" className="text-sm font-semibold text-black/55 hover:text-black">← Admin Dashboard</Link>
        <header className="mt-6 border-b border-black/10 pb-7">
          <p className="eyebrow mb-3">Nusantara Star Internal · Profil Talent</p>
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <h1 className="text-3xl font-semibold tracking-[-0.03em] md:text-5xl">{talent.name}</h1>
              <p className="mt-3 text-sm text-black/55">{talent.category} · {talent.base_city || "Kota belum diisi"}</p>
            </div>
            <span className="w-fit border border-black/10 bg-white px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em]">{talent.status}</span>
          </div>
        </header>

        <section className="grid gap-3 py-7 sm:grid-cols-2 lg:grid-cols-4">
          <article className="border border-black/10 bg-white p-4"><p className="text-xs font-semibold uppercase tracking-[0.12em] text-black/40">Rate Minimum</p><p className="mt-3 text-sm font-semibold">{money(talent.budget_min)}</p></article>
          <article className="border border-black/10 bg-white p-4"><p className="text-xs font-semibold uppercase tracking-[0.12em] text-black/40">Rate Maksimum</p><p className="mt-3 text-sm font-semibold">{money(talent.budget_max)}</p></article>
          <article className="border border-black/10 bg-white p-4"><p className="text-xs font-semibold uppercase tracking-[0.12em] text-black/40">Kebijakan Pembayaran</p><p className="mt-3 text-sm font-semibold">{paymentPolicies.length} tahap</p></article>
          <article className="border border-black/10 bg-white p-4"><p className="text-xs font-semibold uppercase tracking-[0.12em] text-black/40">Media Kurasi</p><p className="mt-3 text-sm font-semibold">{media.length} video</p></article>
        </section>

        <AdminTalentCommercialProfile talentId={talent.id} policies={paymentPolicies} media={media} />
      </div>
    </main>
  );
}
