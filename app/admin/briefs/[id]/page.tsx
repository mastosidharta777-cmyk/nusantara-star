import { createClient } from "@supabase/supabase-js";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AdminBookingActions } from "@/components/admin-booking-actions";
import { AdminDealReview } from "@/components/admin-deal-review";
import { AdminDealSheetForm } from "@/components/admin-deal-sheet-form";
import { AdminDirectInquiryPanel } from "@/components/admin-direct-inquiry-panel";
import { AdminMatchActions } from "@/components/admin-match-actions";
import { AdminOperations } from "@/components/admin-operations";
import { AdminPaymentMilestones } from "@/components/admin-payment-milestones";
import { AdminProposalActions } from "@/components/admin-proposal-actions";
import { loadAdminBriefDetail } from "@/lib/admin-brief-detail";
import { loadDealReviewData } from "@/lib/deal-review-data";
import { loadOperationsData } from "@/lib/operations-data";
import { availabilityLabel, freshnessLabelId } from "@/lib/ui-language";

export const dynamic = "force-dynamic";

function getServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase server environment is not configured");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function money(value: number | null) {
  if (value == null) return "—";
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value);
}

function tierLabel(tier: string) {
  if (tier === "strong_match") return "Kecocokan kuat";
  if (tier === "acceptable_alternative") return "Alternatif yang layak";
  return "Jangan ditawarkan";
}

function briefStatusLabel(value: string) {
  const labels: Record<string, string> = {
    new: "Baru", reviewed: "Sudah ditinjau", shortlisted: "Daftar pilihan siap", proposal_sent: "Proposal dikirim",
    buyer_selected: "Talent dipilih klien", terms_agreed: "Ketentuan disepakati", booked: "Sudah booking", cancelled: "Dibatalkan",
  };
  return labels[value] ?? value.replaceAll("_", " ");
}

export default async function AdminBriefDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const detail = await loadAdminBriefDetail(id);
  if (!detail) notFound();

  const supabase = getServerClient();
  const { data: buyerContact, error: buyerContactError } = await supabase
    .from("briefs")
    .select("buyer_name,buyer_company,buyer_whatsapp,buyer_email,request_mode")
    .eq("id", id)
    .single();
  if (buyerContactError) throw new Error(`Buyer contact load failed: ${buyerContactError.message}`);

  const { row, matches, selectedTalent, talentPolicyTemplates, commercialTerms, booking, payments, paymentMilestones } = detail;
  const deal = selectedTalent ? await loadDealReviewData(row.id) : null;
  const dealLocked = deal?.status === "locked";
  const operations = await loadOperationsData(booking?.id ?? null);
  const whatsappDigits = buyerContact?.buyer_whatsapp?.replace(/\D/g, "") ?? "";
  const hasBuyerContact = Boolean(buyerContact?.buyer_name || buyerContact?.buyer_company || buyerContact?.buyer_whatsapp || buyerContact?.buyer_email);
  const isDirectInquiry = buyerContact?.request_mode === "direct_talent";

  return (
    <main className="min-h-screen bg-[#f5f3ee] text-[#171713]">
      <div className="mx-auto max-w-[1180px] px-5 py-8 md:px-10 md:py-10">
        <Link href="/admin" className="text-sm font-semibold text-black/55 hover:text-black">← Dasbor Admin</Link>

        <header className="mt-6 border-b border-black/10 pb-7">
          <p className="eyebrow mb-3">Nusantara Star Internal · Detail Brief</p>
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div><h1 className="text-3xl font-semibold tracking-[-0.03em] md:text-5xl">{row.event_type ?? "Brief tanpa judul"}</h1><p className="mt-3 text-sm text-black/55">ID Brief: {row.id}</p></div>
            <span className="w-fit border border-black/10 bg-white px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em]">{briefStatusLabel(row.status)}</span>
          </div>
        </header>

        <section className="grid gap-3 py-7 sm:grid-cols-2 lg:grid-cols-5">
          {[["Tanggal", row.event_date ?? "—"], ["Kota", row.city ?? "—"], ["Kategori", row.talent_category ?? "—"], ["Anggaran minimum", money(row.budget_min)], ["Anggaran maksimum", money(row.budget_max)]].map(([label, value]) => (
            <article key={label} className="border border-black/10 bg-white p-4"><p className="text-xs font-semibold uppercase tracking-[0.12em] text-black/40">{label}</p><p className="mt-3 text-sm font-semibold">{value}</p></article>
          ))}
        </section>

        <section className="mb-7 border border-black/10 bg-white">
          <div className="border-b border-black/10 px-5 py-4">
            <p className="text-sm font-semibold">Kontak Buyer</p>
            <p className="mt-1 text-xs text-black/45">Data internal untuk tindak lanjut brief. Jangan diteruskan ke talent tanpa kebutuhan operasional.</p>
          </div>
          {hasBuyerContact ? (
            <div className="grid gap-0 sm:grid-cols-2 lg:grid-cols-4">
              <div className="border-b border-black/10 p-5 sm:border-r lg:border-b-0"><p className="text-xs font-semibold uppercase tracking-[0.12em] text-black/40">Nama</p><p className="mt-2 text-sm font-semibold">{buyerContact?.buyer_name ?? "—"}</p></div>
              <div className="border-b border-black/10 p-5 lg:border-b-0 lg:border-r"><p className="text-xs font-semibold uppercase tracking-[0.12em] text-black/40">Perusahaan</p><p className="mt-2 text-sm font-semibold">{buyerContact?.buyer_company ?? "—"}</p></div>
              <div className="border-b border-black/10 p-5 sm:border-r sm:border-b-0"><p className="text-xs font-semibold uppercase tracking-[0.12em] text-black/40">WhatsApp</p>{buyerContact?.buyer_whatsapp && whatsappDigits ? <a href={`https://wa.me/${whatsappDigits}`} target="_blank" rel="noreferrer" className="mt-2 block text-sm font-semibold underline">{buyerContact.buyer_whatsapp}</a> : <p className="mt-2 text-sm font-semibold">—</p>}</div>
              <div className="p-5"><p className="text-xs font-semibold uppercase tracking-[0.12em] text-black/40">Email</p>{buyerContact?.buyer_email ? <a href={`mailto:${buyerContact.buyer_email}`} className="mt-2 block break-all text-sm font-semibold underline">{buyerContact.buyer_email}</a> : <p className="mt-2 text-sm font-semibold">—</p>}</div>
            </div>
          ) : <div className="px-5 py-7 text-sm text-black/50">Brief ini tidak memiliki kontak buyer tersimpan.</div>}
        </section>

        <AdminDirectInquiryPanel briefId={row.id} />

        {(!isDirectInquiry || matches.length > 0) ? <section className="border border-black/10 bg-white">
          <div className="border-b border-black/10 px-5 py-4"><p className="text-sm font-semibold">{isDirectInquiry ? "Alternatif Pencocokan" : "Rekomendasi Pencocokan"}</p><p className="mt-1 text-xs text-black/45">Rekomendasi ini adalah snapshot saat diproses. Konfirmasi langsung tetap menjadi acuan komersial.</p></div>
          {matches.length === 0 ? <div className="px-5 py-10 text-sm text-black/50">Tidak ada kandidat yang memenuhi aturan daftar pilihan saat ini.</div> : (
            <div className="divide-y divide-black/10">{matches.map((match, index) => (
              <article key={match.talent.id} className="p-5 md:p-6">
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div><p className="text-xs font-semibold uppercase tracking-[0.12em] text-black/40">#{index + 1} · {tierLabel(match.tier)}</p><h2 className="mt-2 text-2xl font-semibold tracking-[-0.02em]">{match.talent.name}</h2><p className="mt-1 text-sm text-black/55">{match.talent.category} · {match.talent.baseCity}</p></div>
                  <div className="text-left md:text-right"><p className="text-3xl font-semibold">{match.score}</p><p className="text-xs uppercase tracking-[0.12em] text-black/40">Skor kecocokan</p></div>
                </div>
                <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="border border-black/10 p-3 text-sm"><span className="text-black/45">Panduan fee</span><br />{money(match.talent.budgetMin)} – {money(match.talent.budgetMax)}</div>
                  <div className="border border-black/10 p-3 text-sm"><span className="text-black/45">Ketersediaan</span><br />{availabilityLabel(match.availabilityStatus)}</div>
                  <div className="border border-black/10 p-3 text-sm"><span className="text-black/45">Pembaruan data</span><br />{freshnessLabelId(match.freshness)}</div>
                  <div className="border border-black/10 p-3 text-sm"><span className="text-black/45">Konfirmasi langsung</span><br />{match.requiresLiveConfirmation ? "Diperlukan" : "Tidak diperlukan"}</div>
                </div>
                <p className="mt-4 text-sm leading-6 text-black/60">{match.reasons.join(" · ")}</p>
                <AdminMatchActions briefId={row.id} talentId={match.talent.id} decision={match.decision} availabilityRequestId={match.availabilityRequestId} availabilityRequestStatus={match.availabilityRequestStatus} />
              </article>
            ))}</div>
          )}
        </section> : null}

        {!selectedTalent && ["shortlisted", "proposal_sent"].includes(row.status) ? <AdminProposalActions briefId={row.id} status={row.status} /> : null}
        {selectedTalent ? <AdminDealReview briefId={row.id} deal={deal} /> : null}

        {selectedTalent && ["proposal_sent", "buyer_selected", "terms_agreed", "booked"].includes(row.status) ? (
          <details className="mt-5 border border-black/10 bg-white">
            <summary className="cursor-pointer px-5 py-4 text-sm font-semibold">Detail Kesepakatan Lanjutan</summary>
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
