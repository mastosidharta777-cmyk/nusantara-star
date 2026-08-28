import Link from "next/link";
import { notFound } from "next/navigation";
import { categories } from "@/lib/data";
import { isLocale } from "@/lib/i18n";
import { loadPublicTalents, publicCategoryId } from "@/lib/public-talents";

export const dynamic = "force-dynamic";

export default async function TalentPage({params,searchParams}:{params:Promise<{locale:string}>;searchParams:Promise<{category?:string}>}){
  const {locale}=await params;
  if(!isLocale(locale)) notFound();
  const {category}=await searchParams;
  const allTalents=await loadPublicTalents();
  const selectedCategory=categories.some(item=>item.id===category)?category:null;
  const selectedLabel=selectedCategory?categories.find(item=>item.id===selectedCategory):null;
  const talents=selectedCategory?allTalents.filter(t=>publicCategoryId(t.category)===selectedCategory):[];
  const categoryLabel=(value:string)=>{const item=categories.find(candidate=>candidate.id===publicCategoryId(value));return item?(locale==="id"?item.labelId:item.labelEn):value};
  const categoryDescription=(id:string)=>({
    singer:locale==="id"?"Penyanyi solo dengan karakter dan format panggung yang beragam.":"Solo vocalists across multiple styles and stage formats.",
    band:locale==="id"?"Band untuk corporate, festival, brand activation, wedding, dan private event.":"Bands for corporate, festivals, brand activations, weddings and private events.",
    mc:locale==="id"?"MC dan host untuk acara formal, brand, conference, dan entertainment.":"MCs and hosts for formal events, brands, conferences and entertainment.",
    dj:locale==="id"?"DJ untuk private party, lifestyle event, resort, dan brand activation.":"DJs for private parties, lifestyle events, resorts and brand activations.",
    traditional:locale==="id"?"Pertunjukan tradisi dan etnik untuk cultural showcase dan special event.":"Traditional and ethnic performances for cultural showcases and special events.",
    speaker:locale==="id"?"Speaker, panelist, dan facilitator untuk forum profesional dan corporate.":"Speakers, panelists and facilitators for professional and corporate forums."
  } as Record<string,string>)[id]||"";
  const photo=(talent:(typeof allTalents)[number],compact=false)=>talent.photo_sprite?
    <div aria-label={locale==="id"?`Foto profil ${talent.name}`:`${talent.name} profile photo`} className={`h-full w-full bg-cover bg-no-repeat transition duration-300 group-hover:scale-[1.02] ${compact?"":""}`} style={{backgroundImage:`url(${talent.photo_url})`,backgroundSize:"600% 300%",backgroundPosition:`${talent.photo_sprite.col*20}% ${talent.photo_sprite.row*50}%`}}/>:
    <img src={talent.photo_url!} alt={locale==="id"?`Foto profil ${talent.name}`:`${talent.name} profile photo`} className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]"/>;

  if(!selectedCategory){
    return <main className="min-h-screen bg-[#f5f3ee] px-5 py-10 text-[#171713] md:px-10"><div className="mx-auto max-w-6xl">
      <p className="eyebrow">{locale==="id"?"Talent Terkurasi · Nusantara Star":"Curated Talent · Nusantara Star"}</p>
      <div className="mt-4 max-w-3xl"><h1 className="text-4xl font-semibold tracking-[-0.04em] md:text-6xl">{locale==="id"?"Temukan talent berdasarkan kategori.":"Browse talent by category."}</h1><p className="mt-4 text-sm leading-6 text-black/55">{locale==="id"?"Pilih kategori terlebih dahulu. Hanya kategori yang memiliki talent aktif yang ditampilkan.":"Choose a category first. Only categories with active talent are shown."}</p></div>
      <section className="mt-9 grid gap-5 md:grid-cols-2 lg:grid-cols-3">{categories.map(cat=>{const members=allTalents.filter(t=>publicCategoryId(t.category)===cat.id);if(!members.length)return null;const cover=members[0];return <Link key={cat.id} href={`/${locale}/talent?category=${cat.id}`} className="group overflow-hidden border border-black/10 bg-white transition hover:-translate-y-0.5 hover:shadow-lg"><div className="aspect-[16/9] overflow-hidden bg-black/5">{photo(cover,true)}</div><div className="p-5"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#a45a42]">{locale==="id"?cat.labelId:cat.labelEn}</p><h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em]">{members.length} {locale==="id"?"talent":"talent"}</h2></div><span className="text-2xl text-[#a45a42]">→</span></div><p className="mt-3 text-sm leading-6 text-black/55">{categoryDescription(cat.id)}</p></div></Link>})}</section>
    </div></main>;
  }

  return <main className="min-h-screen bg-[#f5f3ee] px-5 py-10 text-[#171713] md:px-10"><div className="mx-auto max-w-6xl">
    <Link href={`/${locale}/talent`} className="text-sm font-semibold text-black/55 hover:text-black">← {locale==="id"?"Semua kategori":"All categories"}</Link>
    <div className="mt-5 flex flex-wrap gap-2">{categories.map(cat=>{const count=allTalents.filter(t=>publicCategoryId(t.category)===cat.id).length;if(!count)return null;const active=cat.id===selectedCategory;return <Link key={cat.id} href={`/${locale}/talent?category=${cat.id}`} className={`border px-4 py-2 text-xs font-semibold uppercase tracking-[0.08em] ${active?"border-black bg-black text-white":"border-black/15 bg-white text-black/60 hover:border-black"}`}>{locale==="id"?cat.labelId:cat.labelEn} · {count}</Link>})}</div>
    <div className="mt-8 max-w-3xl"><p className="eyebrow">{locale==="id"?"Kategori":"Category"}</p><h1 className="mt-3 text-4xl font-semibold tracking-[-0.04em] md:text-6xl">{selectedLabel?(locale==="id"?selectedLabel.labelId:selectedLabel.labelEn):""}</h1><p className="mt-4 text-sm leading-6 text-black/55">{categoryDescription(selectedCategory)}</p></div>
    {talents.length?<section className="mt-9 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{talents.map(talent=><Link key={talent.id} href={`/${locale}/talent/${talent.id}`} className="group overflow-hidden border border-black/10 bg-white transition hover:-translate-y-0.5 hover:shadow-lg"><div className="aspect-[4/3] overflow-hidden bg-black/5">{photo(talent)}</div><div className="p-5"><p className="text-xs font-semibold uppercase tracking-[0.12em] text-black/40">{categoryLabel(talent.category)}{talent.base_city?` · ${talent.base_city}`:""}</p><h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em]">{talent.name}</h2><p className="mt-3 line-clamp-3 text-sm leading-6 text-black/55">{talent.bio||(locale==="id"?"Profil terkurasi Nusantara Star.":"Nusantara Star curated profile.")}</p>{talent.genres.length?<p className="mt-4 text-xs text-black/45">{talent.genres.slice(0,4).join(" · ")}</p>:null}</div></Link>)}</section>:<section className="mt-9 border border-black/10 bg-white p-8"><p className="text-sm font-semibold">{locale==="id"?"Belum ada talent terkurasi pada kategori ini.":"No curated talent is available in this category yet."}</p></section>}
  </div></main>;
}
