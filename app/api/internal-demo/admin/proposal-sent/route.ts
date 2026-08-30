import { NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

type WhyFitSnapshot = { id: string[]; en: string[] };
type MediaSnapshot = {
  id: string;
  provider: "cloudflare_r2";
  storage_key: string;
  title: string | null;
  description: string | null;
  asset_type: string;
};
type MatchSnapshot = { talent_id: string; score: number; tier: string; score_breakdown: Record<string, unknown> | null };
type OfferSnapshot = {
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
type TalentSnapshot = {
  id: string;
  name: string;
  category: string;
  base_city: string | null;
  genres: string[] | null;
  bio: string | null;
  profile_image_url: string | null;
};
type ReadyCandidate = {
  match: MatchSnapshot | null;
  offer: OfferSnapshot;
  talent: TalentSnapshot;
  whyFit: WhyFitSnapshot;
  media: MediaSnapshot[];
};

type BriefMode = {
  request_mode: "discovery" | "direct_talent";
  requested_talent_id: string | null;
};

function getServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) throw new Error("Supabase server environment is not configured");
  return createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

function scorePart(value: Record<string, unknown> | null, key: string) {
  const n = Number(value?.[key]);
  return Number.isFinite(n) ? n : 0;
}

function buildWhyFit(breakdown: Record<string, unknown> | null): WhyFitSnapshot {
  const id: string[] = [];
  const en: string[] = [];
  const add = (idText: string, enText: string) => { id.push(idText); en.push(enText); };
  if (scorePart(breakdown, "categoryGenre") >= 80) add("Kategori dan gaya musik sesuai brief.", "Category and music style align with the brief.");
  if (scorePart(breakdown, "taxonomyFit") >= 70) add("Format penampilan sesuai kebutuhan acara.", "Performance format aligns with the event needs.");
  if (scorePart(breakdown, "eventFit") >= 80) add("Profil talent cocok untuk jenis acara ini.", "The talent profile fits this type of event.");
  if (scorePart(breakdown, "location") >= 90) add("Lokasi dan jangkauan layanan mendukung kebutuhan event.", "Location and service coverage support the event requirements.");
  if (!id.length) add("Dipilih sebagai kandidat terkurasi berdasarkan brief Anda.", "Selected as a curated candidate based on your brief.");
  return { id: id.slice(0, 3), en: en.slice(0, 3) };
}

function buildDirectWhyFit(): WhyFitSnapshot {
  return {
    id: ["Talent ini Anda minta secara langsung.", "Ketersediaan dan penawaran telah dikonfirmasi khusus untuk acara ini."],
    en: ["You requested this talent directly.", "Availability and offer were confirmed specifically for this event."],
  };
}

async function attachMedia(supabase: SupabaseClient, candidates: Omit<ReadyCandidate, "media">[]): Promise<ReadyCandidate[]> {
  if (!candidates.length) return [];
  const talentIds = candidates.map((item) => item.talent.id);
  const { data: assets, error: assetError } = await supabase
    .from("talent_assets")
    .select("id,talent_id,provider,storage_key,title,description,asset_type,sort_order")
    .in("talent_id", talentIds)
    .eq("provider", "cloudflare_r2")
    .eq("upload_status", "uploaded")
    .eq("review_status", "approved")
    .eq("buyer_visible", true)
    .in("asset_type", ["showreel", "live_performance", "event_clip"])
    .order("sort_order", { ascending: true });
  if (assetError) throw new Error(assetError.message);

  const mediaByTalent = new Map<string, MediaSnapshot[]>();
  for (const asset of assets ?? []) {
    const current = mediaByTalent.get(asset.talent_id) ?? [];
    if (current.length < 3) current.push({ id: asset.id, provider: "cloudflare_r2", storage_key: asset.storage_key, title: asset.title, description: asset.description, asset_type: asset.asset_type });
    mediaByTalent.set(asset.talent_id, current);
  }

  return candidates.map((item) => ({ ...item, media: mediaByTalent.get(item.talent.id) ?? [] }));
}

async function loadReadyCandidates(supabase: SupabaseClient, briefId: string, mode: BriefMode): Promise<ReadyCandidate[]> {
  const [{ data: approvedMatches, error: matchError }, { data: offers, error: offerError }, { data: talents, error: talentError }] = await Promise.all([
    supabase.from("match_results").select("talent_id,score,tier,score_breakdown").eq("brief_id", briefId).eq("admin_approved", true).eq("admin_rejected", false).order("score", { ascending: false }),
    supabase.from("talent_offers").select("id,talent_id,status,availability_status,event_fee,currency,included_costs,excluded_costs,payment_terms,rider_exceptions,quote_valid_until").eq("brief_id", briefId).eq("status", "confirmed").eq("availability_status", "confirmed"),
    supabase.from("talents").select("id,name,category,base_city,genres,bio,profile_image_url"),
  ]);
  if (matchError) throw new Error(matchError.message);
  if (offerError) throw new Error(offerError.message);
  if (talentError) throw new Error(talentError.message);

  const nowMs = Date.now();
  const offerMap = new Map(
    (offers ?? [])
      .filter((offer) => Boolean(offer.quote_valid_until) && new Date(String(offer.quote_valid_until)).getTime() > nowMs)
      .map((offer) => [offer.talent_id, offer]),
  );
  const talentMap = new Map((talents ?? []).map((talent) => [talent.id, talent]));

  if (mode.request_mode === "direct_talent") {
    if (!mode.requested_talent_id) return [];
    const offer = offerMap.get(mode.requested_talent_id);
    const talent = talentMap.get(mode.requested_talent_id);
    if (!offer || !talent || !offer.event_fee || Number(offer.event_fee) <= 0) return [];
    return attachMedia(supabase, [{
      match: null,
      offer: { ...offer, event_fee: Number(offer.event_fee) } as OfferSnapshot,
      talent: talent as TalentSnapshot,
      whyFit: buildDirectWhyFit(),
    }]);
  }

  const base = (approvedMatches ?? []).flatMap((match) => {
    const offer = offerMap.get(match.talent_id);
    const talent = talentMap.get(match.talent_id);
    if (!offer || !talent || !offer.event_fee || Number(offer.event_fee) <= 0) return [];
    return [{
      match: match as MatchSnapshot,
      offer: { ...offer, event_fee: Number(offer.event_fee) } as OfferSnapshot,
      talent: talent as TalentSnapshot,
      whyFit: buildWhyFit((match.score_breakdown ?? null) as Record<string, unknown> | null),
    }];
  }).slice(0, 5);

  return attachMedia(supabase, base);
}

export async function GET(request: Request) {
  try {
    const briefId = new URL(request.url).searchParams.get("briefId") ?? "";
    if (!briefId) return NextResponse.json({ error: "Invalid brief id" }, { status: 400 });

    const supabase = getServerClient();
    const { data: brief, error: briefError } = await supabase.from("briefs").select("id,status,request_mode,requested_talent_id").eq("id", briefId).single();
    if (briefError || !brief) return NextResponse.json({ error: "Brief not found" }, { status: 404 });
    if (!["shortlisted", "proposal_sent"].includes(brief.status)) return NextResponse.json({ error: "Brief is not ready for proposal" }, { status: 409 });

    const ready = await loadReadyCandidates(supabase, briefId, brief as BriefMode);
    return NextResponse.json({
      ok: true,
      requestMode: brief.request_mode,
      candidates: ready.map(({ talent, offer }) => ({
        talentId: talent.id,
        name: talent.name,
        eventFee: Number(offer.event_fee),
        currency: offer.currency ?? "IDR",
        talentPaymentTerms: offer.payment_terms,
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
    const buyerPaymentTerms = typeof body?.buyerPaymentTerms === "string" ? body.buyerPaymentTerms.trim() : "";
    if (!briefId) return NextResponse.json({ error: "Invalid brief id" }, { status: 400 });
    if (!buyerPaymentTerms || buyerPaymentTerms.length > 1200) return NextResponse.json({ error: "Buyer-facing payment terms are required" }, { status: 400 });

    const supabase = getServerClient();
    const { data: brief, error: briefError } = await supabase.from("briefs").select("id,status,request_mode,requested_talent_id").eq("id", briefId).single();
    if (briefError || !brief) return NextResponse.json({ error: "Brief not found" }, { status: 404 });
    if (!["shortlisted", "proposal_sent"].includes(brief.status)) return NextResponse.json({ error: "Brief is not ready for proposal" }, { status: 409 });

    const ready = await loadReadyCandidates(supabase, briefId, brief as BriefMode);
    if (!ready.length) return NextResponse.json({ error: "No valid confirmed event offer is ready for proposal" }, { status: 409 });

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

    const itemRows = priced.map(({ match, offer, talent, buyerPrice, whyFit, media }) => ({
      proposal_id: proposal.id,
      brief_id: briefId,
      talent_id: talent.id,
      talent_offer_id: offer.id,
      buyer_price: buyerPrice,
      currency: offer.currency ?? "IDR",
      availability_status: offer.availability_status,
      included_costs: offer.included_costs,
      excluded_costs: offer.excluded_costs,
      payment_terms: buyerPaymentTerms,
      rider_exceptions: offer.rider_exceptions,
      offer_valid_until: offer.quote_valid_until,
      talent_name_snapshot: talent.name,
      talent_category_snapshot: talent.category,
      talent_base_city_snapshot: talent.base_city,
      talent_genres_snapshot: talent.genres ?? [],
      talent_bio_snapshot: talent.bio,
      talent_profile_image_url_snapshot: talent.profile_image_url,
      match_score_snapshot: match?.score ?? null,
      match_tier_snapshot: match?.tier ?? null,
      why_fit_snapshot: whyFit,
      media_snapshot: media,
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

    return NextResponse.json({ ok: true, briefId, proposalId: proposal.id, version: proposal.version, status: "proposal_sent", readyTalentCount: itemRows.length, requestMode: brief.request_mode });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown error";
    console.error("Proposal snapshot action failed", detail);
    return NextResponse.json({ error: "Proposal snapshot action failed", detail }, { status: 409 });
  }
}
