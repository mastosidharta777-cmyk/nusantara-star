import { notFound } from "next/navigation";
import { copy, isLocale } from "@/lib/i18n";
import { TalentDirectory } from "@/components/talent-directory";
export default async function TalentPage({ params }: { params: Promise<{ locale: string }> }) { const { locale } = await params; if (!isLocale(locale)) notFound(); return <TalentDirectory locale={locale} copy={copy[locale].directory}/> }
