import { notFound } from "next/navigation";

import { BuyerSelectTalent } from "@/components/buyer-select-talent";
import { isLocale } from "@/lib/i18n";
import { loadBuyerProposal } from "@/lib/buyer-proposal";

export const dynamic = "force-dynamic";

function money(value: number | null, locale: "id" | "en") {
  if (value == null) return "—";
  return new Intl.NumberFormat(locale === "id" ? "id-ID" : "en-US", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(value);
}

function categoryLabel(value: string | null, locale: "id" | "en") {
  if (!value) return "—";
  const normalized = value.trim().toLowerCase();
  const labels: Record<string, { id: string; en: string }> = {
    penyanyi: { id: "Penyanyi", en: "Singer" },
    singer: { id: "Penyanyi", en: "Singer" },
    band: { id: "Band", en: "Band" },
    "mc / host": { id: "MC / Host", en: "MC / Host" },
    "mc/host": { id: "MC / Host", en: "MC / Host" },
    dj: { id: "DJ", en: "DJ" },
    "traditional & cultural": { id: "Tradisional & Budaya", en: "Traditional & Cultural" },
    "acoustic/duo/trio": { id: "Akustik / Duo / Trio", en: "Acoustic / Duo / Trio" },
    "specialty performer": { id: "Performer Spesial", en: "Specialty Performer" },
  };
  return labels[normalized]?.[locale] ?? value;
}

export default async function ProposalPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  if (process.env.VERCEL_ENV === "production") notFound();

  const { locale, id } = await params;
  if (!isLocale(locale)) notFound();

  const proposal = await loadBuyerProposal(id);
  if (!proposal) notFound();

  const isId = locale === "id";
  const { brief, talents, selectedTalentId } = proposal;

  return (
    <div className="bg-[#f5f3ee] text-[#171713]">
      <section className="mx-auto max-w-[1100px] px-5 py-12 md:px-10 md:py-16">
        <p className="eyebrow mb-3">Nusantara Star · {isId ? "Daftar Pilihan Talent" : "Talent Shortlist"}</p>
        <h1 className="max-w-4xl text-4xl font-semibold tracking-[-0.04em] md:text-6xl">
          {isId ? "Talent pilihan untuk acara Anda." : "Selected talent for your event."}
        </h1>
        <p className="mt-5 max-w-2xl text-base leading-7 text-black/60">
          {isId
            ? "Pilihan berikut telah dikurasi oleh tim Nusantara Star dan dikonfirmasi tersedia untuk tanggal acara Anda."
            : "The following talent has been curated by the Nusantara Star team and confirmed available for your event date."}
        </p>

        <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {[
            [isId ? "Acara" : "Event", brief.event_type ?? "—"],
            [isId ? "Tanggal" : "Date", brief.event_date ?? "—"],
            [isId ? "Kota" : "City", brief.city ?? "—"],
            [isId ? "Kategori" : "Category", categoryLabel(brief.talent_category, locale)],
            [isId ? "Anggaran Maks." : "Max Budget", money(brief.budget_max, locale)],
          ].map(([label, value]) => (
            <div key={label} className="border border-black/10 bg-white p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-black/40">{label}</p>
              <p className="mt-3 text-sm font-semibold">{value}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-[1100px] px-5 pb-16 md:px-10 md:pb-24">
        {talents.length === 0 ? (
          <div className="border border-black/10 bg-white p-8 text-sm text-black/55">
            {isId ? "Belum ada talent yang siap dimasukkan ke Daftar Pilihan." : "No talent is ready for the shortlist yet."}
          </div>
        ) : (
          <div className="grid gap-5 md:grid-cols-2">
            {talents.map((talent) => (
              <article key={talent.id} className="overflow-hidden border border-black/10 bg-white">
                {talent.profile_image_url ? (
                  <div className="aspect-[16/9] overflow-hidden bg-black/5">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={talent.profile_image_url} alt={talent.name} className="h-full w-full object-cover" />
                  </div>
                ) : null}
                <div className="p-5 md:p-6">
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-black/40">
                    {categoryLabel(talent.category, locale)} · {talent.base_city ?? "Indonesia"}
                  </p>
                  <h2 className="mt-2 text-3xl font-semibold tracking-[-0.03em]">{talent.name}</h2>
                  {talent.genres?.length ? <p className="mt-2 text-sm text-black/55">{talent.genres.join(" · ")}</p> : null}
                  <p className="mt-5 text-sm leading-6 text-black/60">
                    {isId
                      ? talent.bio || "Profil lengkap tersedia melalui tim Nusantara Star."
                      : "Full profile available through the Nusantara Star team."}
                  </p>
                  <div className="mt-5 border-t border-black/10 pt-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-black/40">
                      {isId ? "Kisaran Fee Talent" : "Talent Fee Range"}
                    </p>
                    <p className="mt-2 text-lg font-semibold">
                      {money(talent.budget_min, locale)} – {money(talent.budget_max, locale)}
                    </p>
                  </div>
                  <BuyerSelectTalent
                    briefId={brief.id}
                    talentId={talent.id}
                    locale={locale}
                    selected={selectedTalentId === talent.id}
                  />
                </div>
              </article>
            ))}
          </div>
        )}

        <div className="mt-8 border border-black/10 bg-white p-5 text-sm leading-6 text-black/55 md:p-6">
          {selectedTalentId
            ? isId
              ? "Talent sudah dipilih. Tim Nusantara Star akan melanjutkan ke finalisasi fee, terms, dan proses booking."
              : "Talent selected. The Nusantara Star team will proceed with final fee, terms, and booking coordination."
            : isId
              ? "Daftar Pilihan ini bukan konfirmasi booking final. Ketersediaan, fee final, rider, dan detail penampilan akan dikunci setelah buyer memilih talent dan proses komersial disepakati."
              : "This shortlist is not a final booking confirmation. Availability, final fee, rider, and performance details are locked after the buyer selects a talent and commercial terms are agreed."}
        </div>
      </section>
    </div>
  );
}
