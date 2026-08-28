import Link from "next/link";
import type { Locale } from "@/lib/i18n";
import { BrandLogo } from "@/components/brand-logo";

export function SiteFooter({ locale }: { locale: Locale }) { return <footer className="bg-ink px-5 py-12 text-white md:px-10"><div className="mx-auto flex max-w-[1440px] flex-col justify-between gap-8 border-t border-white/20 pt-8 md:flex-row"><div><BrandLogo inverse/><p className="mt-4 max-w-sm text-sm text-white/55">Curated talent, thoughtfully matched.</p></div><div className="flex gap-7 text-sm text-white/70"><Link href={`/${locale}/talent`}>Talent</Link><Link href={`/${locale}/brief`}>Event Brief</Link><a href="mailto:hello@nusantarastar.com">Contact</a></div><p className="text-xs text-white/40">© 2026 Nusantara Star</p></div></footer> }
