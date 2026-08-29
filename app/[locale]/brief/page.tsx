import { notFound } from "next/navigation";
import { copy, isLocale } from "@/lib/i18n";
import { BriefForm } from "@/components/brief-form";
import { loadPublicTalent } from "@/lib/public-talents";

const categoryDefaults: Record<string,string> = { singer:"Singer", band:"Band", mc:"MC / Host", dj:"DJ", traditional:"Traditional arts", speaker:"Speaker" };

export default async function BriefPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ talent?: string; category?: string }> }) {
  const { locale } = await params; if (!isLocale(locale)) notFound();
  const query = await searchParams;
  const candidate = query.talent ? await loadPublicTalent(query.talent) : null;
  const selectedTalent = candidate && !candidate.id.startsWith("demo-") ? { id:candidate.id, name:candidate.name, category:candidate.category } : null;
  const initialCategory = query.category ? categoryDefaults[query.category] : undefined;
  return <BriefForm locale={locale} copy={copy[locale].brief} selectedTalent={selectedTalent} initialCategory={initialCategory}/>;
}
