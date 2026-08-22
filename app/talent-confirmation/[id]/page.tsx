import Link from "next/link";
import { notFound } from "next/navigation";

import { AvailabilityResponseActions } from "@/components/availability-response-actions";
import { loadAvailabilityResponseDetail } from "@/lib/availability-response-detail";

export const dynamic = "force-dynamic";

export default async function TalentConfirmationPage({ params }: { params: Promise<{ id: string }> }) {
  if (process.env.VERCEL_ENV === "production") notFound();

  const { id } = await params;
  const detail = await loadAvailabilityResponseDetail(id);
  if (!detail) notFound();

  const { request, brief, talent } = detail;

  return (
    <main className="min-h-screen bg-[#f5f3ee] text-[#171713]">
      <div className="mx-auto max-w-[760px] px-5 py-8 md:px-10 md:py-12">
        <p className="eyebrow mb-3">Nusantara Star · Live Availability Confirmation</p>
        <h1 className="text-3xl font-semibold tracking-[-0.03em] md:text-5xl">{talent.name}</h1>
        <p className="mt-3 text-sm leading-6 text-black/55">
          Preview portal untuk manager/talent. Konfirmasi ini hanya menyatakan ketersediaan untuk brief ini, bukan persetujuan kontrak atau booking final.
        </p>

        <section className="mt-7 border border-black/10 bg-white p-5 md:p-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-black/40">Event</p>
              <p className="mt-2 font-semibold">{brief.event_type ?? "—"}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-black/40">Date</p>
              <p className="mt-2 font-semibold">{brief.event_date ?? "—"}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-black/40">City</p>
              <p className="mt-2 font-semibold">{brief.city ?? "—"}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-black/40">Venue</p>
              <p className="mt-2 font-semibold">{brief.venue ?? "—"}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-black/40">Category</p>
              <p className="mt-2 font-semibold">{brief.talent_category ?? "—"}</p>
            </div>
          </div>

          <AvailabilityResponseActions requestId={request.id} currentStatus={request.status} />
        </section>

        <Link href={`/admin/briefs/${brief.id}`} className="mt-6 inline-block text-sm font-semibold text-black/55 hover:text-black">
          ← Back to Admin Brief
        </Link>
      </div>
    </main>
  );
}
