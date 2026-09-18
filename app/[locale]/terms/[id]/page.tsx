import { notFound } from "next/navigation";

import { BuyerTermsAcceptance } from "@/components/buyer-terms-acceptance";
import { isLocale } from "@/lib/i18n";
import { loadBuyerTerms, type BuyerPaymentMilestone } from "@/lib/buyer-terms";
import { verifyAccessToken } from "@/lib/signed-access";

export const dynamic = "force-dynamic";

function money(value: number | null | undefined, locale: "id" | "en") {
  if (value == null) return "—";
  return new Intl.NumberFormat(locale === "id" ? "id-ID" : "en-US", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value);
}

function milestoneAmount(row: BuyerPaymentMilestone, locale: "id" | "en") {
  if (row.calculation_type === "percentage" && row.percentage != null) return `${row.percentage}%`;
  if (row.calculation_type === "fixed_amount" && row.amount != null) return money(row.amount, locale);
  if (row.calculation_type === "remaining_balance") return locale === "id" ? "Sisa pembayaran" : "Remaining balance";
  return "—";
}

function dueLabel(row: BuyerPaymentMilestone, locale: "id" | "en") {
  if (row.custom_due_date) return row.custom_due_date;
  const labels: Record<string, { id: string; en: string }> = {
    booking_date: { id: "tanggal booking", en: "booking date" },
    event_date: { id: "tanggal acara", en: "event date" },
    event_completion: { id: "selesai acara", en: "event completion" },
    invoice_date: { id: "tanggal invoice", en: "invoice date" },
  };
  const base = labels[row.due_basis ?? ""]?.[locale] ?? (locale === "id" ? "tanggal yang disepakati" : "agreed date");
  const offset = Number(row.due_offset_days ?? 0);
  if (!offset) return base;
  return locale === "id" ? `${Math.abs(offset)} hari ${offset < 0 ? "sebelum" : "setelah"} ${base}` : `${Math.abs(offset)} days ${offset < 0 ? "before" : "after"} ${base}`;
}

export default async function BuyerTermsPage({ params, searchParams }: { params: Promise<{ locale: string; id: string }>; searchParams: Promise<{ token?: string }> }) {
  const { locale, id } = await params;
  const { token = "" } = await searchParams;
  if (!isLocale(locale)) notFound();
  if (process.env.VERCEL_ENV && !verifyAccessToken(token, "buyer_terms", id)) notFound();

  const data = await loadBuyerTerms(id);
  if (!data) notFound();
  const isId = locale === "id";
  const { booking, deal, brief, talent, proposalItem, offer, snapshot, milestones, accepted, termsReady } = data;
  const offerValidUntil = snapshot?.offer_valid_until ?? offer.quote_valid_until;

  return (
    <main className="min-h-screen bg-[#f5f3ee] px-5 py-10 text-[#171713] md:px-10 md:py-16">
      <div className="mx-auto max-w-[900px]">
        <p className="eyebrow">Nusantara Star · {isId ? "Ketentuan booking" : "Booking terms"}</p>
        <h1 className="mt-4 text-4xl font-semibold tracking-[-0.04em] md:text-6xl">{isId ? "Tinjau sebelum menyetujui." : "Review before accepting."}</h1>
        <p className="mt-5 max-w-2xl text-sm leading-7 text-black/55">{isId ? "Persetujuan ini berlaku untuk snapshot kesepakatan yang sudah dikunci. Persetujuan ketentuan belum otomatis membuat booking terjamin; kondisi jaminan pembayaran tetap harus terpenuhi." : "This acceptance applies to the locked deal snapshot. Accepting the terms does not by itself secure the booking; the financial-security condition must still be satisfied."}</p>

        <section className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            [isId ? "Talent" : "Talent", snapshot?.event.talent_name ?? talent.name],
            [isId ? "Acara" : "Event", snapshot?.event.event_type ?? brief.event_type ?? "—"],
            [isId ? "Tanggal" : "Date", snapshot?.event.event_date ?? booking.event_date ?? brief.event_date ?? "—"],
            [isId ? "Kota" : "City", snapshot?.event.city ?? booking.city ?? brief.city ?? "—"],
          ].map(([label, value]) => <div key={label} className="border border-black/10 bg-white p-4"><p className="text-xs font-semibold uppercase tracking-[0.12em] text-black/40">{label}</p><p className="mt-2 text-sm font-semibold">{value}</p></div>)}
        </section>

        <section className="mt-5 border border-black/10 bg-white p-5 md:p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-black/40">{isId ? "Harga untuk booking ini" : "Price for this booking"}</p>
          <p className="mt-2 text-3xl font-semibold">{money(snapshot?.pricing.buyer_price ?? Number(deal.buyer_price ?? booking.buyer_price), locale)}</p>
          {snapshot ? <div className="mt-4 divide-y divide-black/10 border border-black/10">
            {(snapshot.pricing.breakdown_mode === "detailed"
              ? [
                  [isId ? "Talent fee" : "Talent fee", "talent_fee" in snapshot.pricing.breakdown ? snapshot.pricing.breakdown.talent_fee : 0],
                  [isId ? "Transport" : "Transport", "transport" in snapshot.pricing.breakdown ? snapshot.pricing.breakdown.transport : 0],
                  [isId ? "Akomodasi" : "Accommodation", "accommodation" in snapshot.pricing.breakdown ? snapshot.pricing.breakdown.accommodation : 0],
                  [isId ? "Technical / rider" : "Technical / rider", "technical_rider" in snapshot.pricing.breakdown ? snapshot.pricing.breakdown.technical_rider : 0],
                  [isId ? "Pajak / payment fee" : "Taxes / payment fees", snapshot.pricing.breakdown.taxes_fees],
                ]
              : [
                  [isId ? "Talent fee" : "Talent fee", snapshot.pricing.breakdown.talent_fee],
                  [isId ? "Biaya operasional langsung" : "Direct operating costs", "direct_costs" in snapshot.pricing.breakdown ? snapshot.pricing.breakdown.direct_costs : 0],
                  [isId ? "Pajak / payment fee" : "Taxes / payment fees", snapshot.pricing.breakdown.taxes_fees],
                ]).filter(([, value]) => Number(value) > 0).map(([label, value]) => <div key={String(label)} className="flex justify-between gap-4 px-3 py-2 text-sm"><span className="text-black/55">{String(label)}</span><strong>{money(Number(value), locale)}</strong></div>)}
          </div> : null}
          {(snapshot?.terms.included_costs ?? proposalItem?.included_costs) ? <p className="mt-4 text-sm leading-6"><span className="text-black/45">{isId ? "Termasuk:" : "Included:"}</span><br />{snapshot?.terms.included_costs ?? proposalItem?.included_costs}</p> : null}
          {(snapshot?.terms.excluded_costs ?? proposalItem?.excluded_costs) ? <p className="mt-3 text-sm leading-6"><span className="text-black/45">{isId ? "Tidak termasuk:" : "Excluded:"}</span><br />{snapshot?.terms.excluded_costs ?? proposalItem?.excluded_costs}</p> : null}
        </section>

        <section className="mt-5 border border-black/10 bg-white p-5 md:p-6">
          <h2 className="text-xl font-semibold">{isId ? "Jadwal pembayaran" : "Payment schedule"}</h2>
          <div className="mt-4 divide-y divide-black/10">
            {milestones.map((row, index) => (
              <div key={`${row.sequence_no ?? index}-${row.milestone_type ?? "payment"}`} className="grid gap-2 py-4 sm:grid-cols-[1fr_auto]">
                <div><p className="text-sm font-semibold">{row.milestone_type?.replaceAll("_", " ") ?? `${isId ? "Tahap" : "Milestone"} ${index + 1}`}</p><p className="mt-1 text-xs text-black/45">{dueLabel(row, locale)}</p></div>
                <p className="text-sm font-semibold">{milestoneAmount(row, locale)}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-5 border border-black/10 bg-white p-5 md:p-6">
          <h2 className="text-xl font-semibold">{isId ? "Ketentuan utama" : "Key terms"}</h2>
          <div className="mt-4 space-y-4 text-sm leading-6">
            <p><span className="text-black/45">{isId ? "Pembatalan:" : "Cancellation:"}</span><br />{snapshot?.terms.cancellation_terms ?? deal.cancellation_terms ?? (isId ? "Belum dikunci" : "Not locked")}</p>
            {(snapshot?.terms.rider_notes ?? deal.rider_notes) ? <p><span className="text-black/45">{isId ? "Rider / kebutuhan teknis:" : "Rider / technical requirements:"}</span><br />{snapshot?.terms.rider_notes ?? deal.rider_notes}</p> : null}
            {(snapshot?.terms.special_conditions ?? deal.special_conditions) ? <p><span className="text-black/45">{isId ? "Ketentuan khusus:" : "Special conditions:"}</span><br />{snapshot?.terms.special_conditions ?? deal.special_conditions}</p> : null}
            <p className="text-xs text-black/45">{isId ? "Penawaran talent berlaku sampai" : "Talent offer valid until"}: {offerValidUntil ? new Date(offerValidUntil).toLocaleString(isId ? "id-ID" : "en-US") : "—"}</p>
          </div>
        </section>

        <div className="mt-5">
          <BuyerTermsAcceptance bookingId={booking.id} accessToken={token} accepted={accepted} disabled={!termsReady} />
        </div>
      </div>
    </main>
  );
}
