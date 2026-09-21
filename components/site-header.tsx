"use client";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { useState } from "react";
import type { Locale } from "@/lib/i18n";
import { copy } from "@/lib/i18n";
import { BrandLogo } from "@/components/brand-logo";
import type { LaunchMode } from "@/lib/launch-control";

export function SiteHeader({ locale, launchMode }: { locale: Locale; launchMode: LaunchMode }) {
  const [open, setOpen] = useState(false); const t = copy[locale]; const other = locale === "id" ? "en" : "id";
  const isPublicLaunch = launchMode === "live";
  return <header className="sticky top-0 z-50 border-b border-black/10 bg-paper/95 backdrop-blur-sm">
    <div className="mx-auto flex h-20 max-w-[1440px] items-center justify-between px-5 md:px-10">
      <Link href={`/${locale}`} className="inline-flex items-center" aria-label="Nusantara Star home"><BrandLogo compact /></Link>
      <nav className="hidden items-center gap-8 text-sm md:flex">
        {isPublicLaunch ? <><Link href={`/${locale}/talent`} className="hover:text-ember">{t.nav.talents}</Link><Link href={`/${locale}#process`} className="hover:text-ember">{t.nav.process}</Link><Link href={`/${locale}/brief`} className="hover:text-ember">{t.nav.business}</Link></> : null}
        <Link href={`/${other}`} className={isPublicLaunch ? "border-l border-black/20 pl-8 uppercase" : "uppercase"}>{other}</Link>
        {isPublicLaunch ? <Link href={`/${locale}/brief`} className="bg-ink px-5 py-3 text-xs font-bold uppercase tracking-widest text-white hover:bg-ember">{t.nav.brief}</Link> : <a href="mailto:hello@nusantarastar.com" className="text-xs font-bold uppercase tracking-widest hover:text-ember">{locale === "id" ? "Kontak" : "Contact"}</a>}
      </nav>
      <button aria-label="Toggle menu" className="md:hidden" onClick={() => setOpen(!open)}>{open ? <X /> : <Menu />}</button>
    </div>
    {open && <nav className="flex flex-col gap-5 border-t border-black/10 bg-paper px-5 py-6 text-lg md:hidden">
      {isPublicLaunch ? <><Link onClick={() => setOpen(false)} href={`/${locale}/talent`}>{t.nav.talents}</Link><Link onClick={() => setOpen(false)} href={`/${locale}#process`}>{t.nav.process}</Link><Link onClick={() => setOpen(false)} href={`/${locale}/brief`}>{t.nav.business}</Link></> : null}
      <Link href={`/${other}`}>{other.toUpperCase()}</Link>
      {isPublicLaunch ? <Link onClick={() => setOpen(false)} href={`/${locale}/brief`} className="bg-ink px-5 py-4 text-center text-sm text-white">{t.nav.brief}</Link> : <a href="mailto:hello@nusantarastar.com" className="bg-ink px-5 py-4 text-center text-sm text-white">{locale === "id" ? "Kontak" : "Contact"}</a>}
    </nav>}
  </header>;
}
