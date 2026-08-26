import { notFound } from "next/navigation";

import { BuyerSelectTalent } from "@/components/buyer-select-talent";
import { isLocale } from "@/lib/i18n";
import { loadBuyerProposal } from "@/lib/buyer-proposal";
import { verifyAccessToken } from "@/lib/signed-access";

export const dynamic = "force-dynamic";

function money(value: number | null, locale: "id" | "en") {
  if (value == null) return "—";
  return new Intl.NumberFormat(locale === "id" ? "id-ID" : "en-US", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value);
}

function categoryLabel(value: string | null, locale: "id" | "en") {
  if (!value) return "—";
  const normalized = value.trim().toLowerCase();
  const labels: Record<string, { id: string; en: string }> = {
    penyanyi: { id: "Penyanyi", en: "Singer" }, singer: { id: "Penyanyi", en: "Singer" }, band: { id: "Band", en: "Band" },
    "mc / host": { id: "MC / Host", en: "MC / Host" }, "mc/host": { id: "MC / Host", en: "MC / Host" }, dj: { id: "DJ", en: "DJ" },
    "traditional & cultural": { id: "Tradisional & Budaya", en: "Traditional & Cultural" },
    "acoustic/duo/trio": { id: "Akustik / Duo / Trio", en: "Acoustic / Duo / Trio" },
    "specialty performer": { id: "Penampil spesial", en: "Specialty Performer" },
  };
  return labels[normalized]?.[locale] ?? value;
}

export default async function ProposalPage({ params, searchParams }: { params: Promise<{ locale: string; id: string }>; searchParams: Promise<{ token?: string }> }) {
  const { locale, id } = await params;
  const { token = "" } = await searchParams;
  if (!isLocale(locale)) notFound();
  if (process.env.VERCEL_ENV === "production" && !verifyAccessToken(token, "buyer_proposal", id)) notFound();

  const data = await loadBuyerProposal(id);
  if (!data) notFound();
  const isId = locale === "id";
  const { brief, proposal, talents, selectedTalentId } = data;

  return (
    <div className="bg-[#f5f3ee] text-[#171713]">
      <section className="mx-auto max-w-[1100px] px-5 py-12 md:px-10 md:py-16">
        <p className="eyebrow mb-3">Nusantara Star · {isId ? "Proposal talent" : "Talent Proposal"}</p>
        <h1 className="max-w-4xl text-4xl font-semibold tracking-[-0.04em] md:text-6xl">{isId ? "Talent terkurasi untuk acara Anda." : "Curated talent for your event."}</h1>
        <p className="mt-5 max-w-2xl text-base leading-7 text-black/60">{isId ? "Setiap pilihan di bawah menggunakan penawaran yang sudah dikonfirmasi khusus untuk acara ini, bukan kisaran fee profil umum." : "Every option below uses an event-specific confirmed offer, not a generic profile rate range."}</p>

        <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {[[isId ? "Acara" : "Event", brief.event_type ?? "—"], [isId ? "Tanggal" : "Date", brief.event_date ?? "—"], [isId ? "Kota" : "City", brief.city ?? "—"], [isId ? "Kategori" : "Category", categoryLabel(brief.talent_category, locale)], [isId ? "Versi proposal" : "Proposal Version", proposal ? `V${proposal.version}` : "—"]].map(([label, value]) => (
            <div key={label} className="border border-black/10 bg-white p-4"><p className="text-xs font-semibold uppercase tracking-[0.12em] text-black/40">{label}</p><p className="mt-3 text-sm font-semibold">{value}</p></div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-[1100px] px-5 pb-16 md:px-10 md:pb-24">
        {!proposal || proposal.status === "expired" || talents.length === 0 ? (
          <div className="border border-black/10 bg-white p-8 text-sm text-black/55">{proposal?.status === "expired" ? isId ? "Proposal ini sudah kedaluwarsa dan perlu dikonfirmasi ulang." : "This proposal has expired and requires reconfirmation." : isId ? "Belum ada proposal yang siap dikirim." : "No proposal is ready yet."}</div>
        ) : (
          <div className="grid gap-5 md:grid-cols-2">
            {talents.map((talent) => (
              <article key={talent.id} className="overflow-hidden border border-black/10 bg-white">
                {talent.profile_image_url ? <div className="aspect-[16/9] overflow-hidden bg-black/5">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={talent.profile_image_url} alt={talent.name} className="h-full w-full object-cover" /></div> : null}
                <div className="p-5 md:p-6">
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-black/40">{categoryLabel(talent.category, locale)} · {talent.base_city ?? "Indonesia"}</p>
                  <h2 className="mt-2 text-3xl font-semibold tracking-[-0.03em]">{talent.name}</h2>
                  {talent.genres?.length ? <p className="mt-2 text-sm text-black/55">{talent.genres.join(" · ")}</p> : null}
                  <p className="mt-5 text-sm leading-6 text-black/60">{talent.bio || (isId ? "Profil lengkap tersedia melalui tim Nusantara Star." : "Full profile available through Nusantara Star.")}</p>
                  <div className="mt-5 grid gap-3 border-t border-black/10 pt-4">
                    <div><p className="text-xs font-semibold uppercase tracking-[0.12em] text-black/40">{isId ? "Fee untuk acara ini" : "Event-Specific Fee"}</p><p className="mt-2 text-xl font-semibold">{money(talent.buyer_price, locale)}</p></div>
                    {talent.included_costs ? <p className="text-sm"><span className="text-black/45">{isId ? "Termasuk:" : "Included:"}</span><br />{talent.included_costs}</p> : null}
                    {talent.excluded_costs ? <p className="text-sm"><span className="text-black/45">{isId ? "Tidak termasuk:" : "Excluded:"}</span><br />{talent.excluded_costs}</p> : null}
                    {talent.payment_terms ? <p className="text-sm"><span className="text-black/45">{isId ? "Ketentuan pembayaran:" : "Payment terms:"}</span><br />{talent.payment_terms}</p> : null}
                    {talent.rider_exceptions ? <p className="text-sm"><span className="text-black/45">{isId ? "Catatan rider:" : "Rider notes:"}</span><br />{talent.rider_exceptions}</p> : null}
                    {talent.offer_valid_until ? <p className="text-xs text-black/45">{isId ? "Penawaran berlaku sampai" : "Offer valid until"}: {new Date(talent.offer_valid_until).toLocaleString(isId ? "id-ID" : "en-US")}</p> : null}
                  </div>
                  <BuyerSelectTalent briefId={brief.id} talentId={talent.id} proposalItemId={talent.proposalItemId} locale={locale} selected={selectedTalentId === talent.id} accessToken={token} />
                </div>
              </article>
            ))}
          </div>
        )}
        <div className="mt-8 border border-black/10 bg-white p-5 text-sm leading-6 text-black/55 md:p-6">{selectedTalentId ? isId ? "Talent sudah dipilih. Tim Nusantara Star akan melanjutkan finalisasi kesepakatan dan booking." : "Talent selected. Nusantara Star will continue to deal finalization and booking." : isId ? "Pemilihan talent belum berarti booking final. Booking baru terjamin setelah ketentuan dan jaminan pembayaran terpenuhi." : "Talent selection is not final booking. Booking is secured only after terms and financial conditions are satisfied."}</div>
      </section>
    </div>
  );
}
