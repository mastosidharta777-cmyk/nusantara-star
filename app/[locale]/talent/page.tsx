import Link from "next/link";
import { notFound } from "next/navigation";

import { categories } from "@/lib/data";
import { isLocale } from "@/lib/i18n";
import { loadPublicTalents, publicCategoryId } from "@/lib/public-talents";

export const dynamic = "force-dynamic";

export default async function TalentPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ category?: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const { category } = await searchParams;
  const allTalents = await loadPublicTalents();
  const selectedCategory = categories.some((item) => item.id === category) ? category : null;
  const talents = selectedCategory ? allTalents.filter((talent) => publicCategoryId(talent.category) === selectedCategory) : allTalents;
  const selectedLabel = selectedCategory ? categories.find((item) => item.id === selectedCategory) : null;
  const categoryLabel = (value: string) => {
    const item = categories.find((candidate) => candidate.id === publicCategoryId(value));
    return item ? (locale === "id" ? item.labelId : item.labelEn) : value;
  };

  return <main className="min-h-screen bg-[#f5f3ee] px-5 py-10 text-[#171713] md:px-10"><div className="mx-auto max-w-6xl">
    <p className="eyebrow">{locale === "id" ? "Talent Terkurasi · Nusantara Star" : "Curated Talent · Nusantara Star"}</p>
    <div className="mt-4 max-w-3xl"><h1 className="text-4xl font-semibold tracking-[-0.04em] md:text-6xl">{selectedLabel ? (locale === "id" ? selectedLabel.labelId : selectedLabel.labelEn) : (locale === "id" ? "Talent terkurasi untuk brief yang tepat." : "Curated talent for the right brief.")}</h1><p className="mt-4 text-sm leading-6 text-black/55">{locale === "id" ? "Profil di bawah hanya menampilkan talent dan media yang sudah melalui tinjauan Nusantara Star." : "Profiles below only show talent and media that have passed Nusantara Star review."}</p></div>
    {selectedCategory ? <Link href={`/${locale}/talent`} className="mt-6 inline-block text-sm font-semibold underline">{locale === "id" ? "Lihat semua talent" : "View all talent"}</Link> : null}
    {talents.length ? <section className="mt-9 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{talents.map((talent) => <Link key={talent.id} href={`/${locale}/talent/${talent.id}`} className="group overflow-hidden border border-black/10 bg-white">
      <div className="aspect-[4/3] bg-black/5">{talent.photo_url ? <img src={talent.photo_url} alt={locale === "id" ? `Foto profil ${talent.name}` : `${talent.name} profile photo`} className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]" /> : <div className="flex h-full items-center justify-center text-xs font-semibold uppercase tracking-[0.12em] text-black/30">{locale === "id" ? "Foto menunggu kurasi" : "Photo pending curation"}</div>}</div>
      <div className="p-5"><p className="text-xs font-semibold uppercase tracking-[0.12em] text-black/40">{categoryLabel(talent.category)}{talent.base_city ? ` · ${talent.base_city}` : ""}</p><h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em]">{talent.name}</h2><p className="mt-3 line-clamp-3 text-sm leading-6 text-black/55">{talent.bio || (locale === "id" ? "Profil terkurasi Nusantara Star." : "Nusantara Star curated profile.")}</p>{talent.genres.length ? <p className="mt-4 text-xs text-black/45">{talent.genres.slice(0, 4).join(" · ")}</p> : null}</div>
    </Link>)}</section> : <section className="mt-9 border border-black/10 bg-white p-8"><p className="text-sm font-semibold">{locale === "id" ? "Belum ada talent terkurasi pada kategori ini." : "No curated talent is available in this category yet."}</p><p className="mt-2 text-sm text-black/50">{locale === "id" ? "Talent baru akan tampil setelah profil, foto, dan video disetujui admin." : "New talent will appear after profile, photo, and video approval."}</p></section>}
  </div></main>;
}
