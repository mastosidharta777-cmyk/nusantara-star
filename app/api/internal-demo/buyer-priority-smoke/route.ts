import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import { POST as createProposal } from "@/app/api/internal-demo/admin/proposal-sent/route";

export const runtime = "nodejs";

function getServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) throw new Error("Supabase server environment is not configured");
  return createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

type TalentSeed = { id: string; name: string };
type ProposalItem = { id: string; talent_id: string };

export async function GET() {
  if (process.env.VERCEL_ENV === "production") return NextResponse.json({ error: "Not found" }, { status: 404 });

  const supabase = getServerClient();
  const stamp = Date.now();
  const talentIds: string[] = [];
  let briefId = "";

  try {
    const { data: talents, error: talentError } = await supabase
      .from("talents")
      .insert([
        { name: `Buyer Priority Smoke A ${stamp}`, category: "singer", status: "curated" },
        { name: `Buyer Priority Smoke B ${stamp}`, category: "singer", status: "curated" },
      ])
      .select("id,name");
    if (talentError || !talents || talents.length !== 2) throw new Error(talentError?.message ?? "Talent seed failed");
    const seededTalents = talents as TalentSeed[];
    talentIds.push(...seededTalents.map((talent) => talent.id));

    const eventDate = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
    const quoteValidUntil = new Date(Date.now() + 7 * 86400000).toISOString();
    const { data: brief, error: briefError } = await supabase
      .from("briefs")
      .insert({ event_type: "Buyer Priority Smoke", event_date: eventDate, city: "Jakarta", talent_category: "singer", status: "shortlisted" })
      .select("id")
      .single();
    if (briefError || !brief) throw new Error(briefError?.message ?? "Brief seed failed");
    briefId = brief.id;

    const matchRows = seededTalents.map((talent, index) => ({
      brief_id: briefId,
      talent_id: talent.id,
      score: 95 - index,
      tier: "strong_match",
      score_breakdown: { categoryGenre: 100, taxonomyFit: 100, eventFit: 100, location: 100 },
      admin_approved: true,
      admin_rejected: false,
    }));
    const { error: matchError } = await supabase.from("match_results").insert(matchRows);
    if (matchError) throw new Error(matchError.message);

    for (const [index, talent] of seededTalents.entries()) {
      const { data: requestRow, error: requestError } = await supabase
        .from("availability_requests")
        .insert({ brief_id: briefId, talent_id: talent.id, status: "confirmed", responded_at: new Date().toISOString() })
        .select("id")
        .single();
      if (requestError || !requestRow) throw new Error(requestError?.message ?? "Availability request seed failed");

      const { error: offerError } = await supabase.from("talent_offers").insert({
        availability_request_id: requestRow.id,
        brief_id: briefId,
        talent_id: talent.id,
        status: "confirmed",
        availability_status: "confirmed",
        event_fee: 10000000 + index * 1000000,
        currency: "IDR",
        included_costs: "Performance fee",
        payment_terms: "50% booking, balance before show",
        quote_valid_until: quoteValidUntil,
        confirmation_source: "manager_portal",
        confirmed_at: new Date().toISOString(),
      });
      if (offerError) throw new Error(offerError.message);
    }

    const buyerPrices = Object.fromEntries(seededTalents.map((talent, index) => [talent.id, 12000000 + index * 1000000]));
    const proposalResponse = await createProposal(new Request("http://internal/api/internal-demo/admin/proposal-sent", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ briefId, buyerPrices, buyerPaymentTerms: "50% on confirmation, balance before show" }),
    }));
    const proposalBody = await proposalResponse.json();
    if (!proposalResponse.ok || !proposalBody?.proposalId) throw new Error(proposalBody?.detail ?? proposalBody?.error ?? "Proposal seed failed");
    const proposalId = String(proposalBody.proposalId);

    const { data: itemRows, error: itemError } = await supabase
      .from("proposal_items")
      .select("id,talent_id")
      .eq("proposal_id", proposalId)
      .order("buyer_price", { ascending: true });
    if (itemError || !itemRows || itemRows.length !== 2) throw new Error(itemError?.message ?? "Proposal items missing");
    const items = itemRows as ProposalItem[];
    const itemByTalent = new Map(items.map((item) => [item.talent_id, item.id]));
    const talentA = seededTalents[0];
    const talentB = seededTalents[1];

    const firstOrder = [
      { proposal_item_id: itemByTalent.get(talentA.id), talent_id: talentA.id, priority_rank: 1 },
      { proposal_item_id: itemByTalent.get(talentB.id), talent_id: talentB.id, priority_rank: 2 },
    ];
    const first = await supabase.rpc("ns_set_buyer_priorities_v1", {
      p_brief_id: briefId,
      p_proposal_id: proposalId,
      p_priorities: firstOrder,
    });
    if (first.error) throw new Error(first.error.message);

    const [{ data: firstPreferences }, { data: firstSelection }, { data: firstBrief }, { data: firstProposal }] = await Promise.all([
      supabase.from("buyer_preferences").select("talent_id,priority_rank,status,is_current").eq("brief_id", briefId).eq("is_current", true).order("priority_rank"),
      supabase.from("buyer_selections").select("talent_id,status").eq("brief_id", briefId).single(),
      supabase.from("briefs").select("status").eq("id", briefId).single(),
      supabase.from("proposals").select("status").eq("id", proposalId).single(),
    ]);
    const firstOrderCorrect = firstPreferences?.length === 2
      && firstPreferences[0]?.talent_id === talentA.id
      && firstPreferences[0]?.priority_rank === 1
      && firstPreferences[0]?.status === "active_priority"
      && firstPreferences[1]?.talent_id === talentB.id
      && firstPreferences[1]?.priority_rank === 2
      && firstPreferences[1]?.status === "fallback";
    const firstMirrorCorrect = firstSelection?.talent_id === talentA.id && firstSelection?.status === "selected";
    const stateAdvanced = firstBrief?.status === "buyer_selected" && firstProposal?.status === "selected";

    const secondOrder = [
      { proposal_item_id: itemByTalent.get(talentB.id), talent_id: talentB.id, priority_rank: 1 },
      { proposal_item_id: itemByTalent.get(talentA.id), talent_id: talentA.id, priority_rank: 2 },
    ];
    const second = await supabase.rpc("ns_set_buyer_priorities_v1", {
      p_brief_id: briefId,
      p_proposal_id: proposalId,
      p_priorities: secondOrder,
    });
    if (second.error) throw new Error(second.error.message);

    const [{ data: allPreferences }, { data: secondSelection }, { count: dealCount }, { count: bookingCount }] = await Promise.all([
      supabase.from("buyer_preferences").select("talent_id,priority_rank,status,is_current").eq("brief_id", briefId).order("submitted_at"),
      supabase.from("buyer_selections").select("talent_id,status").eq("brief_id", briefId).single(),
      supabase.from("deals").select("id", { count: "exact", head: true }).eq("brief_id", briefId),
      supabase.from("bookings").select("id", { count: "exact", head: true }).eq("brief_id", briefId),
    ]);
    const currentRows = (allPreferences ?? []).filter((row) => row.is_current);
    const historyRows = (allPreferences ?? []).filter((row) => !row.is_current);
    const reorderCorrect = currentRows.length === 2
      && currentRows.some((row) => row.talent_id === talentB.id && row.priority_rank === 1 && row.status === "active_priority")
      && currentRows.some((row) => row.talent_id === talentA.id && row.priority_rank === 2 && row.status === "fallback");
    const historyPreserved = allPreferences?.length === 4 && historyRows.length === 2 && historyRows.every((row) => row.status === "superseded");
    const secondMirrorCorrect = secondSelection?.talent_id === talentB.id && secondSelection?.status === "selected";
    const noParallelTransaction = (dealCount ?? 0) === 0 && (bookingCount ?? 0) === 0;

    const duplicate = await supabase.rpc("ns_set_buyer_priorities_v1", {
      p_brief_id: briefId,
      p_proposal_id: proposalId,
      p_priorities: [
        { proposal_item_id: itemByTalent.get(talentA.id), talent_id: talentA.id, priority_rank: 1 },
        { proposal_item_id: itemByTalent.get(talentA.id), talent_id: talentA.id, priority_rank: 2 },
      ],
    });
    const duplicateRejected = Boolean(duplicate.error);

    return NextResponse.json({
      ok: firstOrderCorrect && firstMirrorCorrect && stateAdvanced && reorderCorrect && historyPreserved && secondMirrorCorrect && noParallelTransaction && duplicateRejected,
      checks: {
        firstOrderCorrect,
        firstMirrorCorrect,
        stateAdvanced,
        reorderCorrect,
        historyPreserved,
        secondMirrorCorrect,
        noParallelTransaction,
        duplicateRejected,
      },
      cleanup: "automatic",
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error), cleanup: "automatic" }, { status: 500 });
  } finally {
    if (briefId) {
      await supabase.from("buyer_preferences").delete().eq("brief_id", briefId);
      await supabase.from("buyer_selections").delete().eq("brief_id", briefId);
      await supabase.from("proposal_items").delete().eq("brief_id", briefId);
      await supabase.from("proposals").delete().eq("brief_id", briefId);
      await supabase.from("talent_offers").delete().eq("brief_id", briefId);
      await supabase.from("availability_requests").delete().eq("brief_id", briefId);
      await supabase.from("match_results").delete().eq("brief_id", briefId);
      await supabase.from("briefs").delete().eq("id", briefId);
    }
    if (talentIds.length) await supabase.from("talents").delete().in("id", talentIds);
  }
}
