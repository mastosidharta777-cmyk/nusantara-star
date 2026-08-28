import { NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

type ReadyCandidate = {
  match: { talent_id: string; score: number; tier: string };
  offer: {
    id: string;
    talent_id: string;
    status: string;
    availability_status: string;
    event_fee: number;
    currency: string | null;
    included_costs: string | null;
    excluded_costs: string | null;
    payment_terms: string | null;
    rider_exceptions: string | null;
    quote_valid_until: string | null;
  };
  talent: {
    id: string;
    name: string;
    category: string;
    base_city: string | null;
    genres: string[] | null;
    bio: string | null;
    profile_image_url: string | null;
  };
};

function getServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) throw new Error("Supabase server environment is not configured");
  return createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function loadReadyCandidates(supabase: SupabaseClient, briefId: string): Promise<ReadyCandidate[]> {
  const [{ data: approvedMatches, error: matchError }, { data: offers, error: offerError }, { data: talents, error: talentError }] = await Promise.all([
    supabase.from("match_results").select("talent_id,score,tier").eq("brief_id", briefId).eq("admin_approved", true).eq("admin_rejected", false).order("score", { ascending: false }),
    supabase.from("talent_offers").select("id,talent_id,status,availability_status,event_fee,currency,included_costs,excluded_costs,payment_terms,rider_exceptions,quote_valid_until").eq("brief_id", briefId).eq("status", "confirmed").eq("availability_status", "confirmed"),
    supabase.from("talents").select("id,name,category,base_city,genres,bio,profile_image_url"),
  ]);
  if (matchError) throw new Error(matchError.message);
  if (offerError) throw new Error(offerError.message);
  if (talentError) throw new Error(talentError.message);

  const nowMs = Date.now();
  const offerMap = new Map((offers ?? []).filter((offer) => !offer.quote_valid_until || new Date(offer.quote_valid_until).getTime() > nowMs).map((offer) => [offer.talent_id, offer]));
  const talentMap = new Map((talents ?? []).map((talent) => [talent.id, talent]));

  return (approvedMatches ?? []).flatMap((match) => {
    const offer = offerMap.get(match.talent_id);
    const talent = talentMap.get(match.talent_id);
    if (!offer || !talent || !offer.event_fee || Number(offer.event_fee) <= 0) return [];
    return [{ match, offer: { ...offer, event_fee: Number(offer.event_fee) }, talent } as ReadyCandidate];
  }).slice(0, 5);
}

export async function GET(request: Request) {
  try {
    const briefId = new URL(request.url).searchParams.get("briefId") ?? "";
    if (!briefId) return NextResponse.json({ error: "Invalid brief id" }, { status: 400 });

    const supabase = getServerClient();
    const { data: brief, error: briefError } = await supabase.from("briefs").select("id,status").eq("id", briefId).single();
    if (briefError || !brief) return NextResponse.json({ error: "Brief not found" }, { status: 404 });
    if (!["shortlisted", "proposal_sent"].includes(brief.status)) return NextResponse.json({ error: "Brief is not ready for proposal" }, { status: 409 });

    const ready = await loadReadyCandidates(supabase, briefId);
    return NextResponse.json({
      ok: true,
      candidates: ready.map(({ talent, offer }) => ({
        talentId: talent.id,
        name: talent.name,
        eventFee: Number(offer.event_fee),
        currency: offer.currency ?? "IDR",
        quoteValidUntil: offer.quote_valid_until,
      })),
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: "Proposal candidate load failed", detail }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const briefId = typeof body?.briefId === "string" ? body.briefId : "";
    const buyerPrices = body?.buyerPrices && typeof body.buyerPrices === "object" && !Array.isArray(body.buyerPrices) ? body.buyerPrices as Record<string, unknown> : {};
    if (!briefId) return NextResponse.json({ error: "Invalid brief id" }, { status: 400 });

    const supabase = getServerClient();
    const { data: brief, error: briefError } = await supabase.from("briefs").select("id,status").eq("id", briefId).single();
    if (briefError || !brief) return NextResponse.json({ error: "Brief not found" }, { status: 404 });
    if (!["shortlisted", "proposal_sent"].includes(brief.status)) return NextResponse.json({ error: "Brief is not ready for proposal" }, { status: 409 });

    const ready = await loadReadyCandidates(supabase, briefId);
    if (!ready.length) return NextResponse.json({ error: "No approved talent with a valid confirmed event offer" }, { status: 409 });

    const { data: current, error: currentError } = await supabase.from("proposals").select("id,version,status").eq("brief_id", briefId).order("version", { ascending: false }).limit(1).maybeSingle();
    if (currentError) throw new Error(currentError.message);
    if (current && ["sent", "viewed", "selected"].includes(current.status)) return NextResponse.json({ ok: true, briefId, proposalId: current.id, version: current.version, status: current.status, reused: true });

    const priced = ready.map((item) => {
      const buyerPrice = Number(buyerPrices[item.talent.id]);
      if (!Number.isSafeInteger(buyerPrice) || buyerPrice <= 0) throw new Error(`Buyer price is required for ${item.talent.name}`);
      if (buyerPrice < Number(item.offer.event_fee)) throw new Error(`Buyer price for ${item.talent.name} cannot be below the confirmed talent fee in this V1 flow`);
      return { ...item, buyerPrice };
    });

    const version = (current?.version ?? 0) + 1;
    const expiries = priced.map(({ offer }) => offer.quote_valid_until).filter(Boolean).map((value) => new Date(String(value)).getTime());
    const expiresAt = expiries.length ? new Date(Math.min(...expiries)).toISOString() : null;
    const now = new Date().toISOString();

    const { data: proposal, error: proposalError } = await supabase.from("proposals").insert({ brief_id: briefId, version, status: "sent", expires_at: expiresAt, sent_at: now, updated_at: now }).select("id,version").single();
    if (proposalError || !proposal) throw new Error(proposalError?.message ?? "Proposal creation failed");

    const itemRows = priced.map(({ match, offer, talent, buyerPrice }) => ({
      proposal_id: proposal.id,
      brief_id: briefId,
      talent_id: talent.id,
      talent_offer_id: offer.id,
      buyer_price: buyerPrice,
      currency: offer.currency ?? "IDR",
      availability_status: offer.availability_status,
      included_costs: offer.included_costs,
      excluded_costs: offer.excluded_costs,
      payment_terms: offer.payment_terms,
      rider_exceptions: offer.rider_exceptions,
      offer_valid_until: offer.quote_valid_until,
      talent_name_snapshot: talent.name,
      talent_category_snapshot: talent.category,
      talent_base_city_snapshot: talent.base_city,
      talent_genres_snapshot: talent.genres ?? [],
      talent_bio_snapshot: talent.bio,
      talent_profile_image_url_snapshot: talent.profile_image_url,
      match_score_snapshot: match.score,
      match_tier_snapshot: match.tier,
    }));

    const { error: itemError } = await supabase.from("proposal_items").insert(itemRows);
    if (itemError) {
      await supabase.from("proposals").delete().eq("id", proposal.id);
      throw new Error(itemError.message);
    }

    const { data: updatedRows, error: updateError } = await supabase.from("briefs").update({ status: "proposal_sent" }).eq("id", briefId).in("status", ["shortlisted", "proposal_sent"]).select("id,status");
    if (updateError || !updatedRows?.length) {
      await supabase.from("proposals").delete().eq("id", proposal.id);
      if (updateError) throw new Error(updateError.message);
      return NextResponse.json({ error: "Brief already advanced beyond proposal stage" }, { status: 409 });
    }

    return NextResponse.json({ ok: true, briefId, proposalId: proposal.id, version: proposal.version, status: "proposal_sent", readyTalentCount: itemRows.length });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown error";
    console.error("Proposal snapshot action failed", detail);
    return NextResponse.json({ error: "Proposal snapshot action failed", detail }, { status: 409 });
  }
}
