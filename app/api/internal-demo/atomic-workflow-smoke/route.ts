import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

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
  let requestId = "";
  let proposalId = "";

  try {
    const { data: talent, error: talentError } = await supabase.from("talents").insert({ name: `Atomic Smoke ${stamp}`, category: "singer", status: "curated" }).select("id").single();
    if (talentError || !talent) throw new Error(talentError?.message ?? "Talent seed failed");
    talentId = talent.id;

    const eventDate = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
    const { data: brief, error: briefError } = await supabase.from("briefs").insert({ event_type: "Atomic Smoke", event_date: eventDate, city: "Jakarta", talent_category: "singer", status: "availability_check" }).select("id").single();
    if (briefError || !brief) throw new Error(briefError?.message ?? "Brief seed failed");
    briefId = brief.id;

    const { error: matchError } = await supabase.from("match_results").insert({ brief_id: briefId, talent_id: talentId, score: 90, tier: "A", admin_approved: true, admin_rejected: false });
    if (matchError) throw new Error(matchError.message);

    const { data: availabilityRequest, error: requestError } = await supabase.from("availability_requests").insert({ brief_id: briefId, talent_id: talentId, status: "pending" }).select("id").single();
    if (requestError || !availabilityRequest) throw new Error(requestError?.message ?? "Availability request seed failed");
    requestId = availabilityRequest.id;

    const quoteValidUntil = new Date(Date.now() + 7 * 86400000).toISOString();
    const response = await supabase.rpc("ns_record_availability_response_v1", {
      p_request_id: requestId,
      p_status: "confirmed",
      p_event_fee: 1000000,
      p_included_costs: "Standard performance",
      p_excluded_costs: null,
      p_payment_terms: "50% booking, 50% before show",
      p_rider_exceptions: null,
      p_quote_valid_until: quoteValidUntil,
    });
    if (response.error) throw new Error(response.error.message);

    const [{ data: requestAfter }, { data: offer }, { data: calendar }, { data: briefAfterAvailability }] = await Promise.all([
      supabase.from("availability_requests").select("status,responded_at").eq("id", requestId).single(),
      supabase.from("talent_offers").select("id,status,availability_status,event_fee").eq("availability_request_id", requestId).single(),
      supabase.from("talent_availability").select("status").eq("talent_id", talentId).eq("event_date", eventDate).single(),
      supabase.from("briefs").select("status").eq("id", briefId).single(),
    ]);

    const availabilityAtomic = requestAfter?.status === "confirmed" && offer?.availability_status === "confirmed" && offer?.event_fee === 1000000 && calendar?.status === "available" && briefAfterAvailability?.status === "shortlisted";
    if (!offer?.id) throw new Error("Talent offer was not created");

    await supabase.from("briefs").update({ status: "proposal_sent" }).eq("id", briefId);
    const { data: proposal, error: proposalError } = await supabase.from("proposals").insert({ brief_id: briefId, version: 1, status: "sent", expires_at: quoteValidUntil, sent_at: new Date().toISOString() }).select("id").single();
    if (proposalError || !proposal) throw new Error(proposalError?.message ?? "Proposal seed failed");
    proposalId = proposal.id;

    const { data: proposalItem, error: itemError } = await supabase.from("proposal_items").insert({
      proposal_id: proposalId,
      brief_id: briefId,
      talent_id: talentId,
      talent_offer_id: offer.id,
      buyer_price: 1200000,
      availability_status: "confirmed",
      offer_valid_until: quoteValidUntil,
      talent_name_snapshot: `Atomic Smoke ${stamp}`,
      talent_category_snapshot: "singer",
    }).select("id").single();
    if (itemError || !proposalItem) throw new Error(itemError?.message ?? "Proposal item seed failed");

    const firstSelection = await supabase.rpc("ns_select_buyer_talent_v1", { p_brief_id: briefId, p_talent_id: talentId, p_proposal_item_id: proposalItem.id });
    if (firstSelection.error) throw new Error(firstSelection.error.message);
    const secondSelection = await supabase.rpc("ns_select_buyer_talent_v1", { p_brief_id: briefId, p_talent_id: talentId, p_proposal_item_id: proposalItem.id });
    if (secondSelection.error) throw new Error(secondSelection.error.message);

    const [{ count: selectionCount }, { data: finalBrief }, { data: finalProposal }] = await Promise.all([
      supabase.from("buyer_selections").select("id", { count: "exact", head: true }).eq("brief_id", briefId),
      supabase.from("briefs").select("status").eq("id", briefId).single(),
      supabase.from("proposals").select("status").eq("id", proposalId).single(),
    ]);

    const buyerSelectionAtomic = selectionCount === 1 && finalBrief?.status === "buyer_selected" && finalProposal?.status === "selected";
    const buyerSelectionIdempotent = selectionCount === 1 && secondSelection.data?.alreadySelected === true;

    return NextResponse.json({
      ok: availabilityAtomic && buyerSelectionAtomic && buyerSelectionIdempotent,
      checks: { availabilityAtomic, buyerSelectionAtomic, buyerSelectionIdempotent },
      cleanup: "automatic",
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ ok: false, error: detail }, { status: 500 });
  } finally {
    if (briefId) {
      await supabase.from("buyer_selections").delete().eq("brief_id", briefId);
      await supabase.from("proposal_items").delete().eq("brief_id", briefId);
      await supabase.from("proposals").delete().eq("brief_id", briefId);
      await supabase.from("talent_offers").delete().eq("brief_id", briefId);
      await supabase.from("availability_requests").delete().eq("brief_id", briefId);
      await supabase.from("talent_availability").delete().eq("talent_id", talentId);
      await supabase.from("match_results").delete().eq("brief_id", briefId);
      await supabase.from("briefs").delete().eq("id", briefId);
    }
    if (talentId) await supabase.from("talents").delete().eq("id", talentId);
  }
}
