import { notFound } from "next/navigation";
import { copy, isLocale } from "@/lib/i18n";
import { BriefForm } from "@/components/brief-form";
import { loadPublicTalent } from "@/lib/public-talents";
import { loadPublicBriefResult } from "@/lib/public-brief-result";

const categoryDefaults: Record<string,string> = { singer:"Singer", band:"Band", mc:"MC / Host", dj:"DJ", traditional:"Traditional arts", speaker:"Speaker" };

export default async function BriefPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ talent?: string; category?: string; ref?: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  const query = await searchParams;
  const referencedBrief = query.ref ? await loadPublicBriefResult(query.ref) : null;
  const initialResult = query.talent ? null : referencedBrief;
  const candidate = query.talent ? await loadPublicTalent(query.talent) : null;
  const selectedTalent = candidate && !candidate.id.startsWith("demo-")
    ? {
        id: candidate.id,
        name: candidate.name,
        category: candidate.category,
        performanceFormats: candidate.performance_formats ?? [],
      }
    : null;
  const initialCategory = query.category ? categoryDefaults[query.category] : undefined;

  return <BriefForm
    key={`${query.talent ?? "discovery"}:${query.ref ?? "new"}`}
    locale={locale}
    copy={copy[locale].brief}
    selectedTalent={selectedTalent}
    initialCategory={initialCategory}
    initialResult={initialResult}
    sourceBriefId={query.talent ? referencedBrief?.briefId ?? null : null}
    sourceBrief={query.talent ? referencedBrief?.brief ?? null : null}
  />;
}
