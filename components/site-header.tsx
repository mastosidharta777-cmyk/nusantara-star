"use client";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { useState } from "react";
import type { Locale } from "@/lib/i18n";
import { copy } from "@/lib/i18n";
import { BrandLogo } from "@/components/brand-logo";

export function SiteHeader({ locale }: { locale: Locale }) {
  const [open, setOpen] = useState(false); const t = copy[locale]; const other = locale === "id" ? "en" : "id";
  return <header className="sticky top-0 z-50 border-b border-black/10 bg-paper/95 backdrop-blur-sm">
    <div className="mx-auto flex h-20 max-w-[1440px] items-center justify-between px-5 md:px-10">
      <Link href={`/${locale}`} className="inline-flex items-center" aria-label="Nusantara Star home"><BrandLogo compact /></Link>
      <nav className="hidden items-center gap-8 text-sm md:flex">
        <Link href={`/${locale}/talent`} className="hover:text-ember">{t.nav.talents}</Link><Link href={`/${locale}#process`} className="hover:text-ember">{t.nav.process}</Link><Link href={`/${locale}#business`} className="hover:text-ember">{t.nav.business}</Link>
        <Link href={`/${other}`} className="border-l border-black/20 pl-8 uppercase">{other}</Link><Link href={`/${locale}/brief`} className="bg-ink px-5 py-3 text-xs font-bold uppercase tracking-widest text-white hover:bg-ember">{t.nav.brief}</Link>
      </nav>
      <button aria-label="Toggle menu" className="md:hidden" onClick={() => setOpen(!open)}>{open ? <X /> : <Menu />}</button>
    </div>
    {open && <nav className="flex flex-col gap-5 border-t border-black/10 bg-paper px-5 py-6 text-lg md:hidden"><Link onClick={() => setOpen(false)} href={`/${locale}/talent`}>{t.nav.talents}</Link><Link onClick={() => setOpen(false)} href={`/${locale}#process`}>{t.nav.process}</Link><Link onClick={() => setOpen(false)} href={`/${locale}#business`}>{t.nav.business}</Link><Link href={`/${other}`}>{other.toUpperCase()}</Link><Link href={`/${locale}/brief`} className="bg-ink px-5 py-4 text-center text-sm text-white">{t.nav.brief}</Link></nav>}
  </header>;
}
