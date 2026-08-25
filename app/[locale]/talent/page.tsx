import Link from "next/link";

import { loadPublicTalents } from "@/lib/public-talents";

export const dynamic = "force-dynamic";

export default async function TalentPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const talents = await loadPublicTalents();

  return <main className="min-h-screen bg-[#f5f3ee] px-5 py-10 text-[#171713] md:px-10"><div className="mx-auto max-w-6xl">
    <p className="eyebrow">Curated Talent · Nusantara Star</p>
    <div className="mt-4 max-w-3xl"><h1 className="text-4xl font-semibold tracking-[-0.04em] md:text-6xl">Talent terkurasi untuk brief yang tepat.</h1><p className="mt-4 text-sm leading-6 text-black/55">Profil di bawah hanya menampilkan talent dan media yang sudah melalui review Nusantara Star.</p></div>
    {talents.length ? <section className="mt-9 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{talents.map((talent) => <Link key={talent.id} href={`/${locale}/talent/${talent.id}`} className="group overflow-hidden border border-black/10 bg-white">
      <div className="aspect-[4/3] bg-black/5">{talent.photo_url ? <img src={talent.photo_url} alt={`Foto profil ${talent.name}`} className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]" /> : <div className="flex h-full items-center justify-center text-xs font-semibold uppercase tracking-[0.12em] text-black/30">Foto menunggu kurasi</div>}</div>
      <div className="p-5"><p className="text-xs font-semibold uppercase tracking-[0.12em] text-black/40">{talent.category}{talent.base_city ? ` · ${talent.base_city}` : ""}</p><h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em]">{talent.name}</h2><p className="mt-3 line-clamp-3 text-sm leading-6 text-black/55">{talent.bio || "Profil terkurasi Nusantara Star."}</p>{talent.genres.length ? <p className="mt-4 text-xs text-black/45">{talent.genres.slice(0, 4).join(" · ")}</p> : null}</div>
    </Link>)}</section> : <section className="mt-9 border border-black/10 bg-white p-8"><p className="text-sm font-semibold">Roster publik sedang dikurasi.</p><p className="mt-2 text-sm text-black/50">Talent baru akan tampil setelah profil, foto, dan video disetujui admin.</p></section>}
  </div></main>;
}
