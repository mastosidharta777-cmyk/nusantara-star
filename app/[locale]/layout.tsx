import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isLocale } from "@/lib/i18n";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { getLaunchMode } from "@/lib/launch-control";
export function generateStaticParams() { return [{ locale: "id" }, { locale: "en" }]; }
export function generateMetadata(): Metadata { return getLaunchMode() === "coming_soon" ? { robots: { index: false, follow: false } } : {}; }
export default async function LocaleLayout({ children, params }: { children: React.ReactNode; params: Promise<{ locale: string }> }) { const { locale } = await params; if (!isLocale(locale)) notFound(); const launchMode = getLaunchMode(); return <><SiteHeader locale={locale} launchMode={launchMode}/><main>{children}</main><SiteFooter locale={locale} launchMode={launchMode}/></>; }
