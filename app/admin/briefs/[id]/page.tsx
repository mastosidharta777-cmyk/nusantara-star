import Link from "next/link";
import { notFound } from "next/navigation";

import { AdminBookingActions } from "@/components/admin-booking-actions";
import { AdminDealReview } from "@/components/admin-deal-review";
import { AdminDealSheetForm } from "@/components/admin-deal-sheet-form";
import { AdminMatchActions } from "@/components/admin-match-actions";
import { AdminOperations } from "@/components/admin-operations";
import { AdminPaymentMilestones } from "@/components/admin-payment-milestones";
import { AdminProposalActions } from "@/components/admin-proposal-actions";
import { loadAdminBriefDetail } from "@/lib/admin-brief-detail";
import { loadDealReviewData } from "@/lib/deal-review-data";
import { loadOperationsData } from "@/lib/operations-data";

export const dynamic = "force-dynamic";

function money(value: number | null) {
  if (value == null) return "—";
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value);
}

function tierLabel(tier: string) {
  if (tier === "strong_match") return "Strong Match";
  if (tier === "acceptable_alternative") return "Acceptable Alternative";
  return "Do Not Offer";
}

export default async function AdminBriefDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const detail = await loadAdminBriefDetail(id);
  if (!detail) notFound();

  const { row, matches, selectedTalent, talentPolicyTemplates, commercialTerms, booking, payments, paymentMilestones } = detail;
  const deal = selectedTalent ? await loadDealReviewData(row.id) : null;
  const dealLocked = deal?.status === "locked";
  const operations = await loadOperationsData(booking?.id ?? null);

  return (
    <main className="min-h-screen bg-[#f5f3ee] text-[#171713]">
      <div className="mx-auto max-w-[1180px] px-5 py-8 md:px-10 md:py-10">
        <Link href="/admin" className="text-sm font-semibold text-black/55 hover:text-black">← Admin Dashboard</Link>

        <header className="mt-6 border-b border-black/10 pb-7">
          <p className="eyebrow mb-3">Nusantara Star Internal · Brief Detail</p>
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div><h1 className="text-3xl font-semibold tracking-[-0.03em] md:text-5xl">{row.event_type ?? "Untitled Brief"}</h1><p className="mt-3 text-sm text-black/55">Brief ID: {row.id}</p></div>
            <span className="w-fit border border-black/10 bg-white px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em]">{row.status}</span>
          </div>
        </header>

        <section className="grid gap-3 py-7 sm:grid-cols-2 lg:grid-cols-5">
          {[["Date", row.event_date ?? "—"], ["City", row.city ?? "—"], ["Category", row.talent_category ?? "—"], ["Budget Min", money(row.budget_min)], ["Budget Max", money(row.budget_max)]].map(([label, value]) => (
            <article key={label} className="border border-black/10 bg-white p-4"><p className="text-xs font-semibold uppercase tracking-[0.12em] text-black/40">{label}</p><p className="mt-3 text-sm font-semibold">{value}</p></article>
          ))}
        </section>

        <section className="border border-black/10 bg-white">
          <div className="border-b border-black/10 px-5 py-4"><p className="text-sm font-semibold">Matching Recommendation</p><p className="mt-1 text-xs text-black/45">Frozen recommendation snapshot. Live confirmation remains the commercial source.</p></div>
          {matches.length === 0 ? <div className="px-5 py-10 text-sm text-black/50">Tidak ada kandidat yang memenuhi aturan shortlist saat ini.</div> : (
            <div className="divide-y divide-black/10">{matches.map((match, index) => (
              <article key={match.talent.id} className="p-5 md:p-6">
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div><p className="text-xs font-semibold uppercase tracking-[0.12em] text-black/40">#{index + 1} · {tierLabel(match.tier)}</p><h2 className="mt-2 text-2xl font-semibold tracking-[-0.02em]">{match.talent.name}</h2><p className="mt-1 text-sm text-black/55">{match.talent.category} · {match.talent.baseCity}</p></div>
                  <div className="text-left md:text-right"><p className="text-3xl font-semibold">{match.score}</p><p className="text-xs uppercase tracking-[0.12em] text-black/40">Match Score</p></div>
                </div>
                <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="border border-black/10 p-3 text-sm"><span className="text-black/45">Rate guidance</span><br />{money(match.talent.budgetMin)} – {money(match.talent.budgetMax)}</div>
                  <div className="border border-black/10 p-3 text-sm"><span className="text-black/45">Availability</span><br />{match.availabilityStatus}</div>
                  <div className="border border-black/10 p-3 text-sm"><span className="text-black/45">Freshness</span><br />{match.freshness}</div>
                  <div className="border border-black/10 p-3 text-sm"><span className="text-black/45">Live confirmation</span><br />{match.requiresLiveConfirmation ? "Required" : "Not required"}</div>
                </div>
                <p className="mt-4 text-sm leading-6 text-black/60">{match.reasons.join(" · ")}</p>
                <AdminMatchActions briefId={row.id} talentId={match.talent.id} decision={match.decision} availabilityRequestId={match.availabilityRequestId} availabilityRequestStatus={match.availabilityRequestStatus} />
              </article>
            ))}</div>
          )}
        </section>

        {!selectedTalent && ["shortlisted", "proposal_sent"].includes(row.status) ? <AdminProposalActions briefId={row.id} status={row.status} /> : null}

        {selectedTalent ? <AdminDealReview briefId={row.id} deal={deal} /> : null}

        {selectedTalent && ["proposal_sent", "buyer_selected", "terms_agreed", "booked"].includes(row.status) ? (
          <details className="mt-5 border border-black/10 bg-white">
            <summary className="cursor-pointer px-5 py-4 text-sm font-semibold">Advanced Deal Details</summary>
            <div className="border-t border-black/10"><AdminDealSheetForm briefId={row.id} talentId={selectedTalent.id} talentName={selectedTalent.name} eventDate={row.event_date} initialTerms={commercialTerms} talentPolicyTemplates={talentPolicyTemplates} /></div>
          </details>
        ) : null}

        {selectedTalent && dealLocked ? <AdminBookingActions briefId={row.id} talentName={selectedTalent.name} booking={booking} payments={payments} /> : null}
        {booking && dealLocked ? <AdminPaymentMilestones bookingId={booking.id} milestones={paymentMilestones} /> : null}
        {booking && dealLocked && ["secured", "pre_show", "incident", "completed"].includes(booking.status) ? <AdminOperations booking={booking} checklist={operations.checklist} incidents={operations.incidents} settlements={operations.settlements} /> : null}
      </div>
    </main>
  );
}
