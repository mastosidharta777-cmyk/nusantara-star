import Link from "next/link";
import { notFound } from "next/navigation";
import { categories } from "@/lib/data";
import { isLocale } from "@/lib/i18n";
import { loadPublicTalents, publicCategoryId } from "@/lib/public-talents";

export const dynamic = "force-dynamic";

export default async function TalentPage({params,searchParams}:{params:Promise<{locale:string}>;searchParams:Promise<{category?:string;genre?:string}>}){
  const {locale}=await params;
  if(!isLocale(locale)) notFound();
  const {category,genre}=await searchParams;
  const allTalents=await loadPublicTalents();
  const selectedCategory=categories.some(item=>item.id===category)?category:null;
  const selectedLabel=selectedCategory?categories.find(item=>item.id===selectedCategory):null;

  const categoryPool=selectedCategory?allTalents.filter(t=>publicCategoryId(t.category)===selectedCategory):allTalents;
  const genreOptions=Array.from(new Set(categoryPool.flatMap(t=>t.genres).map(g=>g.trim()).filter(Boolean))).sort((a,b)=>a.localeCompare(b));
  const selectedGenre=genreOptions.find(g=>g.toLowerCase()===genre?.trim().toLowerCase())||null;
  const hasFilter=Boolean(selectedCategory||selectedGenre);
  const talents=allTalents.filter(t=>{
    const categoryMatch=!selectedCategory||publicCategoryId(t.category)===selectedCategory;
    const genreMatch=!selectedGenre||t.genres.some(g=>g.toLowerCase()===selectedGenre.toLowerCase());
    return categoryMatch&&genreMatch;
  });

  const categoryLabel=(value:string)=>{const item=categories.find(candidate=>candidate.id===publicCategoryId(value));return item?(locale==="id"?item.labelId:item.labelEn):value};
  const categoryDescription=(id:string)=>({
    singer:locale==="id"?"Penyanyi solo dengan karakter dan format panggung yang beragam.":"Solo vocalists across multiple styles and stage formats.",
    band:locale==="id"?"Band untuk corporate, festival, brand activation, wedding, dan private event.":"Bands for corporate, festivals, brand activations, weddings and private events.",
    mc:locale==="id"?"MC dan host untuk acara formal, brand, conference, dan entertainment.":"MCs and hosts for formal events, brands, conferences and entertainment.",
    dj:locale==="id"?"DJ untuk private party, lifestyle event, resort, dan brand activation.":"DJs for private parties, lifestyle events, resorts and brand activations.",
    traditional:locale==="id"?"Pertunjukan tradisi dan etnik untuk cultural showcase dan special event.":"Traditional and ethnic performances for cultural showcases and special events.",
    speaker:locale==="id"?"Speaker, panelist, dan facilitator untuk forum profesional dan corporate.":"Speakers, panelists and facilitators for professional and corporate forums."
  } as Record<string,string>)[id]||"";
  const photo=(talent:(typeof allTalents)[number])=>talent.photo_sprite?
    <div aria-label={locale==="id"?`Foto profil ${talent.name}`:`${talent.name} profile photo`} className="h-full w-full bg-cover bg-no-repeat transition duration-300 group-hover:scale-[1.02]" style={{backgroundImage:`url(${talent.photo_url})`,backgroundSize:"600% 300%",backgroundPosition:`${talent.photo_sprite.col*20}% ${talent.photo_sprite.row*50}%`}}/>:
    <img src={talent.photo_url!} alt={locale==="id"?`Foto profil ${talent.name}`:`${talent.name} profile photo`} className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]"/>;

  const hrefFor=(nextCategory:string|null,nextGenre:string|null)=>{
    const q=new URLSearchParams();
    if(nextCategory)q.set("category",nextCategory);
    if(nextGenre)q.set("genre",nextGenre);
    const query=q.toString();
    return `/${locale}/talent${query?`?${query}`:""}`;
  };

  return <main className="min-h-screen bg-[#f5f3ee] px-5 py-10 text-[#171713] md:px-10"><div className="mx-auto max-w-6xl">
    <p className="eyebrow">{locale==="id"?"Talent Terkurasi · Nusantara Star":"Curated Talent · Nusantara Star"}</p>
    <div className="mt-4 max-w-3xl"><h1 className="text-4xl font-semibold tracking-[-0.04em] md:text-6xl">{selectedLabel?(locale==="id"?selectedLabel.labelId:selectedLabel.labelEn):(selectedGenre?selectedGenre:(locale==="id"?"Temukan talent yang tepat.":"Find the right talent."))}</h1><p className="mt-4 text-sm leading-6 text-black/55">{locale==="id"?"Filter berdasarkan kategori dan genre. Pilihan hanya muncul jika ada talent aktif yang sesuai.":"Filter by category and genre. Options only appear when matching active talent exists."}</p></div>

    <section className="mt-8 border border-black/10 bg-white p-5 md:p-6">
      <div><p className="text-xs font-bold uppercase tracking-[0.12em] text-black/45">{locale==="id"?"Kategori":"Category"}</p><div className="mt-3 flex flex-wrap gap-2"><Link href={hrefFor(null,selectedGenre)} className={`border px-4 py-2 text-xs font-semibold uppercase tracking-[0.08em] ${!selectedCategory?"border-black bg-black text-white":"border-black/15 bg-white text-black/60 hover:border-black"}`}>{locale==="id"?"Semua kategori":"All categories"}</Link>{categories.map(cat=>{const count=allTalents.filter(t=>publicCategoryId(t.category)===cat.id).length;if(!count)return null;const active=cat.id===selectedCategory;return <Link key={cat.id} href={hrefFor(cat.id,null)} className={`border px-4 py-2 text-xs font-semibold uppercase tracking-[0.08em] ${active?"border-black bg-black text-white":"border-black/15 bg-white text-black/60 hover:border-black"}`}>{locale==="id"?cat.labelId:cat.labelEn} · {count}</Link>})}</div></div>
      <div className="mt-5 border-t border-black/10 pt-5"><p className="text-xs font-bold uppercase tracking-[0.12em] text-black/45">Genre</p><div className="mt-3 flex flex-wrap gap-2"><Link href={hrefFor(selectedCategory,null)} className={`border px-3 py-2 text-xs font-semibold ${!selectedGenre?"border-[#a45a42] bg-[#a45a42] text-white":"border-black/15 bg-[#f5f3ee] text-black/60 hover:border-black"}`}>{locale==="id"?"Semua genre":"All genres"}</Link>{genreOptions.map(option=><Link key={option} href={hrefFor(selectedCategory,option)} className={`border px-3 py-2 text-xs font-semibold ${selectedGenre===option?"border-[#a45a42] bg-[#a45a42] text-white":"border-black/15 bg-[#f5f3ee] text-black/60 hover:border-black"}`}>{option}</Link>)}</div>{!genreOptions.length?<p className="mt-3 text-xs text-black/40">{locale==="id"?"Kategori ini tidak menggunakan klasifikasi genre.":"This category does not use genre classification."}</p>:null}</div>
    </section>

    {!hasFilter?<section className="mt-9 grid gap-5 md:grid-cols-2 lg:grid-cols-3">{categories.map(cat=>{const members=allTalents.filter(t=>publicCategoryId(t.category)===cat.id);if(!members.length)return null;const cover=members[0];return <Link key={cat.id} href={hrefFor(cat.id,null)} className="group overflow-hidden border border-black/10 bg-white transition hover:-translate-y-0.5 hover:shadow-lg"><div className="aspect-[16/9] overflow-hidden bg-black/5">{photo(cover)}</div><div className="p-5"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#a45a42]">{locale==="id"?cat.labelId:cat.labelEn}</p><h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em]">{members.length} talent</h2></div><span className="text-2xl text-[#a45a42]">→</span></div><p className="mt-3 text-sm leading-6 text-black/55">{categoryDescription(cat.id)}</p></div></Link>})}</section>:
    <><div className="mt-8 flex items-end justify-between gap-4"><div><p className="eyebrow">{locale==="id"?"Hasil Filter":"Filtered Results"}</p><p className="mt-2 text-sm text-black/50">{talents.length} {locale==="id"?"talent ditemukan":"talent found"}{selectedGenre?` · ${selectedGenre}`:""}</p></div><Link href={`/${locale}/talent`} className="text-sm font-semibold underline">{locale==="id"?"Reset filter":"Reset filters"}</Link></div>{talents.length?<section className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{talents.map(talent=><Link key={talent.id} href={`/${locale}/talent/${talent.id}`} className="group overflow-hidden border border-black/10 bg-white transition hover:-translate-y-0.5 hover:shadow-lg"><div className="aspect-[4/3] overflow-hidden bg-black/5">{photo(talent)}</div><div className="p-5"><p className="text-xs font-semibold uppercase tracking-[0.12em] text-black/40">{categoryLabel(talent.category)}{talent.base_city?` · ${talent.base_city}`:""}</p><h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em]">{talent.name}</h2><p className="mt-3 line-clamp-3 text-sm leading-6 text-black/55">{talent.bio||(locale==="id"?"Profil terkurasi Nusantara Star.":"Nusantara Star curated profile.")}</p>{talent.genres.length?<p className="mt-4 text-xs text-black/45">{talent.genres.slice(0,4).join(" · ")}</p>:null}</div></Link>)}</section>:<section className="mt-5 border border-black/10 bg-white p-8"><p className="text-sm font-semibold">{locale==="id"?"Belum ada talent yang sesuai dengan filter ini.":"No talent matches these filters yet."}</p></section>}</>}
  </div></main>;
}
