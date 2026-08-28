import Link from "next/link";
import { notFound } from "next/navigation";

import { AvailabilityResponseActions } from "@/components/availability-response-actions";
import { loadAvailabilityResponseDetail } from "@/lib/availability-response-detail";
import { verifyAccessToken } from "@/lib/signed-access";

export const dynamic = "force-dynamic";

function money(value: number | null) {
  if (value == null) return "—";
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value);
}

export default async function TalentConfirmationPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ token?: string }> }) {
  const { id } = await params;
  const { token = "" } = await searchParams;
  const hosted = Boolean(process.env.VERCEL_ENV);
  if (hosted && !verifyAccessToken(token, "talent_offer", id)) notFound();

  const detail = await loadAvailabilityResponseDetail(id);
  if (!detail) notFound();
  const { request, brief, talent, offer } = detail;

  return (
    <main className="min-h-screen bg-[#f5f3ee] text-[#171713]">
      <div className="mx-auto max-w-[760px] px-5 py-8 md:px-10 md:py-12">
        <p className="eyebrow mb-3">Nusantara Star · Talent Offer</p>
        <h1 className="text-3xl font-semibold tracking-[-0.03em] md:text-5xl">{talent.name}</h1>
        <p className="mt-3 text-sm leading-6 text-black/55">Konfirmasi untuk event ini mencakup availability dan commercial offer. Ini belum merupakan kontrak atau booking final.</p>
        <section className="mt-7 border border-black/10 bg-white p-5 md:p-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <div><p className="text-xs font-semibold uppercase tracking-[0.12em] text-black/40">Event</p><p className="mt-2 font-semibold">{brief.event_type ?? "—"}</p></div>
            <div><p className="text-xs font-semibold uppercase tracking-[0.12em] text-black/40">Date</p><p className="mt-2 font-semibold">{brief.event_date ?? "—"}</p></div>
            <div><p className="text-xs font-semibold uppercase tracking-[0.12em] text-black/40">City</p><p className="mt-2 font-semibold">{brief.city ?? "—"}</p></div>
            <div><p className="text-xs font-semibold uppercase tracking-[0.12em] text-black/40">Venue</p><p className="mt-2 font-semibold">{brief.venue ?? "—"}</p></div>
            <div><p className="text-xs font-semibold uppercase tracking-[0.12em] text-black/40">Category</p><p className="mt-2 font-semibold">{brief.talent_category ?? "—"}</p></div>
          </div>
          {offer ? <div className="mt-6 border border-black/10 bg-[#f5f3ee] p-4"><p className="text-xs font-semibold uppercase tracking-[0.12em] text-black/45">Saved Offer Snapshot</p><div className="mt-3 grid gap-3 sm:grid-cols-2 text-sm"><p><span className="text-black/45">Availability:</span><br />{offer.availability_status}</p><p><span className="text-black/45">Event fee:</span><br />{money(offer.event_fee)}</p><p><span className="text-black/45">Payment terms:</span><br />{offer.payment_terms ?? "—"}</p><p><span className="text-black/45">Valid until:</span><br />{offer.quote_valid_until ? new Date(offer.quote_valid_until).toLocaleString("id-ID") : "—"}</p></div></div> : null}
          <AvailabilityResponseActions requestId={request.id} currentStatus={request.status} existingOffer={offer} accessToken={token} />
        </section>
        {!hosted ? <Link href={`/admin/briefs/${brief.id}`} className="mt-6 inline-block text-sm font-semibold text-black/55 hover:text-black">← Back to Admin Brief</Link> : null}
      </div>
    </main>
  );
}
