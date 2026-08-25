import Link from "next/link";
import { notFound } from "next/navigation";

import { loadPublicTalent } from "@/lib/public-talents";

export const dynamic = "force-dynamic";

export default async function TalentDetailPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  const talent = await loadPublicTalent(id);
  if (!talent) notFound();

  return <main className="min-h-screen bg-[#f5f3ee] px-5 py-10 text-[#171713] md:px-10"><div className="mx-auto max-w-5xl">
    <Link href={`/${locale}/talent`} className="text-sm font-semibold text-black/55 hover:text-black">← Kembali ke talent</Link>
    <section className="mt-6 grid gap-7 md:grid-cols-[0.9fr_1.1fr] md:items-start"><div className="overflow-hidden border border-black/10 bg-white"><div className="aspect-[4/5] bg-black/5">{talent.photo_url ? <img src={talent.photo_url} alt={`Foto profil ${talent.name}`} className="h-full w-full object-cover" /> : null}</div></div><div><p className="eyebrow">{talent.category}{talent.base_city ? ` · ${talent.base_city}` : ""}</p><h1 className="mt-3 text-4xl font-semibold tracking-[-0.04em] md:text-6xl">{talent.name}</h1><p className="mt-5 whitespace-pre-wrap text-base leading-7 text-black/60">{talent.bio}</p>{talent.genres.length ? <p className="mt-5 text-sm font-semibold">Genre: <span className="font-normal text-black/55">{talent.genres.join(", ")}</span></p> : null}{talent.performance_formats.length ? <p className="mt-2 text-sm font-semibold">Format: <span className="font-normal text-black/55">{talent.performance_formats.join(", ")}</span></p> : null}{talent.service_cities.length ? <p className="mt-2 text-sm font-semibold">Kota layanan: <span className="font-normal text-black/55">{talent.service_cities.join(", ")}</span></p> : null}{talent.show_duration_minutes ? <p className="mt-2 text-sm font-semibold">Durasi tampil: <span className="font-normal text-black/55">± {talent.show_duration_minutes} menit</span></p> : null}<Link href={`/${locale}/brief`} className="mt-7 inline-block border border-black bg-black px-5 py-3 text-sm font-semibold text-white">Kirim Brief</Link></div></section>
    {talent.videos.length ? <section className="mt-10"><p className="eyebrow">Approved Media</p><h2 className="mt-3 text-3xl font-semibold tracking-[-0.03em]">Lihat penampilan</h2><div className="mt-5 grid gap-5">{talent.videos.map((video) => <article key={video.id} className="border border-black/10 bg-white p-4"><video controls preload="metadata" className="w-full bg-black" src={video.url} /><div className="pt-4"><p className="text-sm font-semibold">{video.title || "Performance video"}</p>{video.description ? <p className="mt-2 text-sm text-black/50">{video.description}</p> : null}</div></article>)}</div></section> : null}
  </div></main>;
}
