import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import { GET as loadCandidates, POST as createProposal } from "@/app/api/internal-demo/admin/proposal-sent/route";
import { loadBuyerProposal } from "@/lib/buyer-proposal";

export const runtime = "nodejs";

function getServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) throw new Error("Supabase server environment is not configured");
  return createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function GET() {
  if (process.env.VERCEL_ENV === "production") return NextResponse.json({ error: "Not found" }, { status: 404 });
  const supabase = getServerClient();
  const stamp = Date.now();
  let talentId = "";
  let briefId = "";

  try {
    const { data: talent, error: talentError } = await supabase.from("talents").insert({ name: `Proposal Smoke ${stamp}`, category: "singer", status: "curated" }).select("id").single();
    if (talentError || !talent) throw new Error(talentError?.message ?? "Talent seed failed");
    talentId = talent.id;

    const eventDate = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
    const { data: brief, error: briefError } = await supabase.from("briefs").insert({ event_type: "Proposal Smoke", event_date: eventDate, city: "Jakarta", talent_category: "singer", status: "shortlisted" }).select("id").single();
    if (briefError || !brief) throw new Error(briefError?.message ?? "Brief seed failed");
    briefId = brief.id;

    const { error: matchError } = await supabase.from("match_results").insert({ brief_id: briefId, talent_id: talentId, score: 95, tier: "strong_match", score_breakdown: { categoryGenre: 100, taxonomyFit: 100, eventFit: 100, location: 100 }, admin_approved: true, admin_rejected: false });
    if (matchError) throw new Error(matchError.message);

    const { data: requestRow, error: requestError } = await supabase.from("availability_requests").insert({ brief_id: briefId, talent_id: talentId, status: "confirmed", responded_at: new Date().toISOString() }).select("id").single();
    if (requestError || !requestRow) throw new Error(requestError?.message ?? "Availability request seed failed");

    const quoteValidUntil = new Date(Date.now() + 7 * 86400000).toISOString();
    const talentTerms = "Talent requires full payment before show";
    const { data: offer, error: offerError } = await supabase.from("talent_offers").insert({ availability_request_id: requestRow.id, brief_id: briefId, talent_id: talentId, status: "confirmed", availability_status: "confirmed", event_fee: 10000000, currency: "IDR", included_costs: "Performance fee", payment_terms: talentTerms, quote_valid_until: quoteValidUntil, confirmation_source: "manager_portal", confirmed_at: new Date().toISOString() }).select("id").single();
    if (offerError || !offer) throw new Error(offerError?.message ?? "Offer seed failed");

    const candidateResponse = await loadCandidates(new Request(`http://internal/api/internal-demo/admin/proposal-sent?briefId=${briefId}`));
    const candidateBody = await candidateResponse.json();
    const candidateLoaded = candidateResponse.ok && candidateBody?.candidates?.[0]?.eventFee === 10000000 && candidateBody?.candidates?.[0]?.talentPaymentTerms === talentTerms;

    const belowFeeResponse = await createProposal(new Request("http://internal/api/internal-demo/admin/proposal-sent", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ briefId, buyerPrices: { [talentId]: 9000000 }, buyerPaymentTerms: "50% on confirmation, balance before show" }) }));
    const belowFeeRejected = belowFeeResponse.status === 409;

    const buyerTerms = "50% on confirmation, balance before show";
    const sendResponse = await createProposal(new Request("http://internal/api/internal-demo/admin/proposal-sent", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ briefId, buyerPrices: { [talentId]: 12000000 }, buyerPaymentTerms: buyerTerms }) }));
    const sendBody = await sendResponse.json();
    if (!sendResponse.ok) throw new Error(sendBody?.detail ?? sendBody?.error ?? "Proposal route failed");

    const { data: proposalItem, error: itemError } = await supabase.from("proposal_items").select("buyer_price,payment_terms,why_fit_snapshot,media_snapshot,talent_offer_id").eq("brief_id", briefId).single();
    if (itemError || !proposalItem) throw new Error(itemError?.message ?? "Proposal item missing");
    const buyerView = await loadBuyerProposal(briefId);
    const buyerItem = buyerView?.talents?.[0];

    const buyerPriceSeparated = Number(proposalItem.buyer_price) === 12000000 && Number(proposalItem.buyer_price) !== 10000000 && buyerItem?.buyer_price === 12000000;
    const paymentTermsSeparated = proposalItem.payment_terms === buyerTerms && proposalItem.payment_terms !== talentTerms && buyerItem?.payment_terms === buyerTerms;
    const whyFitSnapshot = Array.isArray(proposalItem.why_fit_snapshot?.id) && proposalItem.why_fit_snapshot.id.length > 0;
    const mediaSnapshotShape = Array.isArray(proposalItem.media_snapshot);
    const buyerPayloadNoTalentFee = buyerItem ? !("event_fee" in buyerItem) : false;

    return NextResponse.json({
      ok: candidateLoaded && belowFeeRejected && buyerPriceSeparated && paymentTermsSeparated && whyFitSnapshot && mediaSnapshotShape && buyerPayloadNoTalentFee,
      checks: { candidateLoaded, belowFeeRejected, buyerPriceSeparated, paymentTermsSeparated, whyFitSnapshot, mediaSnapshotShape, buyerPayloadNoTalentFee },
      proposal: { status: sendBody.status, buyerPrice: buyerItem?.buyer_price ?? null },
      cleanup: "automatic",
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  } finally {
    if (briefId) await supabase.from("briefs").delete().eq("id", briefId);
    if (talentId) await supabase.from("talents").delete().eq("id", talentId);
  }
}
