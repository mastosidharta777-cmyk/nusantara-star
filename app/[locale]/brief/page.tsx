import { notFound } from "next/navigation";
import { copy, isLocale } from "@/lib/i18n";
import { BriefForm } from "@/components/brief-form";
export default async function BriefPage({ params }: { params: Promise<{ locale: string }> }) { const { locale } = await params; if (!isLocale(locale)) notFound(); return <BriefForm locale={locale} copy={copy[locale].brief}/> }
