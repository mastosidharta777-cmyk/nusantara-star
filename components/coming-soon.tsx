import Image from "next/image";
import { ArrowUpRight, Check, Sparkles } from "lucide-react";
import type { Locale } from "@/lib/i18n";
import { SupplyInterestForm } from "@/components/supply-interest-form";

export function ComingSoon({ locale }: { locale: Locale }) {
  const indonesian = locale === "id";

  return <div className="overflow-hidden bg-[#0b1513] text-white">
    <section className="relative isolate min-h-[calc(100svh-80px)] overflow-hidden px-5 md:px-10">
      <Image src="/images/hero-indonesian-audience.png" alt="" fill priority sizes="100vw" className="-z-20 object-cover opacity-35 saturate-[.75]" />
      <div className="absolute inset-0 -z-10 bg-[linear-gradient(110deg,rgba(6,13,12,.96)_6%,rgba(6,13,12,.78)_53%,rgba(28,66,53,.68))]" />
      <div className="absolute -right-24 top-16 -z-10 h-[32rem] w-[32rem] rounded-full border border-[#d77a5e]/35" />
      <div className="absolute -right-6 top-44 -z-10 h-[22rem] w-[22rem] rounded-full border border-white/15" />
      <div className="absolute bottom-0 left-0 right-0 h-40 bg-gradient-to-t from-[#0b1513] to-transparent" />
      <div className="mx-auto flex min-h-[calc(100svh-80px)] max-w-[1440px] flex-col justify-between py-9 md:py-14">
        <div className="flex items-center justify-between gap-5 text-[10px] font-bold uppercase tracking-[.2em] text-white/60"><span>Nusantara Star</span><span className="flex items-center gap-2 text-[#e4957d]"><Sparkles size={13} /> {indonesian ? "Roster sedang dikurasi" : "Roster in final curation"}</span></div>
        <div className="grid gap-12 pb-8 pt-16 lg:grid-cols-[minmax(0,1.5fr)_minmax(260px,.5fr)] lg:items-end lg:pb-16">
          <div className="max-w-5xl"><p className="text-xs font-bold uppercase tracking-[.18em] text-[#e4957d]">Coming soon · Jakarta, Indonesia</p><h1 className="mt-6 font-display text-[clamp(4rem,10vw,9rem)] leading-[.82] tracking-[-.075em]">{indonesian ? <>Panggung<br />yang tepat.</> : <>The right<br />stage.</>}</h1><p className="mt-8 max-w-xl text-base leading-7 text-white/70 md:text-lg">{indonesian ? "Nusantara Star sedang membangun roster terkurasi untuk kebutuhan panggung, produksi, dan kolaborasi musik yang serius." : "Nusantara Star is building a considered roster for serious live, production and music collaboration needs."}</p><div className="mt-10 flex flex-col gap-3 sm:flex-row"><a href="mailto:hello@nusantarastar.com?subject=Kebutuhan%20Talent%20Nusantara%20Star" className="group inline-flex min-h-14 items-center justify-center gap-3 bg-[#e4957d] px-7 text-xs font-bold uppercase tracking-[.13em] text-[#0b1513] transition hover:bg-white">{indonesian ? "Butuh talent untuk acara" : "Find talent for an event"}<ArrowUpRight size={17} className="transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5" /></a><a href="#supply-intake" className="inline-flex min-h-14 items-center justify-center border border-white/35 px-7 text-xs font-bold uppercase tracking-[.13em] transition hover:border-white hover:bg-white/10">{indonesian ? "Saya Talent / Profesional" : "I am talent / professional"}</a></div></div>
          <aside className="border-l border-white/20 pl-5 text-sm leading-6 text-white/65 md:pl-7"><p className="text-[10px] font-bold uppercase tracking-[.18em] text-white/45">Nusantara Star / 01</p><p className="mt-4 font-display text-2xl leading-tight text-white">Curated talent, thoughtfully matched.</p><p className="mt-4">{indonesian ? "Kami membuka roster secara bertahap agar setiap profil, kebutuhan, dan komunikasi tetap terjaga." : "We are opening the roster deliberately, so every profile, requirement and conversation remains considered."}</p></aside>
        </div>
      </div>
    </section>
    <section id="supply-intake" className="border-t border-white/10 bg-[#101e1a] px-5 py-16 md:px-10 md:py-24"><div className="mx-auto grid max-w-[1440px] gap-12 lg:grid-cols-[minmax(0,.8fr)_minmax(360px,1fr)] lg:items-start"><div className="max-w-xl"><p className="text-xs font-bold uppercase tracking-[.18em] text-[#e4957d]">Open roster / by curation</p><h2 className="mt-5 font-display text-5xl leading-[.9] tracking-[-.055em] md:text-7xl">{indonesian ? <>Punya karya<br />untuk dibawa?</> : <>Have work<br />to bring?</>}</h2><p className="mt-7 text-sm leading-7 text-white/65 md:text-base">{indonesian ? "Kirim identitas singkat dan satu portofolio utama. Jika pembukaan roster sesuai, kami mengirim undangan pengisian profil—bukan langsung memasukkan Anda ke katalog publik." : "Send a short identity and one main portfolio. When a roster opening fits, we send a profile-onboarding invitation—never an automatic public listing."}</p><ul className="mt-8 space-y-3 text-sm text-white/70">{(indonesian ? ["Talent panggung dan performer", "Professional musik: studio, kreatif, teknis", "Production partner dan penyedia layanan"] : ["Live talent and performers", "Music professionals: studio, creative and technical", "Production partners and service providers"]).map((item) => <li key={item} className="flex gap-3"><Check size={17} className="mt-0.5 shrink-0 text-[#e4957d]" />{item}</li>)}</ul></div><SupplyInterestForm locale={locale} /></div></section>
  </div>;
}
