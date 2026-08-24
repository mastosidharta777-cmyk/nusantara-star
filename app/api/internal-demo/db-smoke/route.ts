import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import { loadBuyerProposal } from "@/lib/buyer-proposal";
import { persistMatchSnapshot } from "@/lib/match-persistence";
import { rankTalents } from "@/lib/talent-engine/matching";
import { loadEngineTalents } from "@/lib/talent-engine/supabase-talents";
import type { StructuredBrief } from "@/lib/talent-engine/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) throw new Error("Supabase server environment is not configured");
  return createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

function futureDate(days: number) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export async function GET() {
  if (process.env.VERCEL_ENV === "production") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const supabase = getServerClient();
  let talentId: string | null = null;
  let briefId: string | null = null;

  try {
    const eventDate = futureDate(30);
    const marker = `SMOKE-${Date.now()}`;

    const { data: talent, error: talentError } = await supabase
      .from("talents")
      .insert({
        name: marker,
        category: "singer",
        gender: "female",
        genres: ["pop"],
        base_city: "Jakarta",
        service_cities: ["Jakarta"],
        performance_formats: ["solo"],
        event_types: ["corporate"],
        audience_tags: ["pop", "corporate"],
        budget_min: 10000000,
        budget_max: 15000000,
        reliability_score: 90,
        last_calendar_updated_at: new Date().toISOString(),
        status: "verified",
        public_visible: false,
      })
      .select("id,name,category,base_city,genres,bio,profile_image_url")
      .single();
    if (talentError || !talent?.id) throw new Error(`Talent insert failed: ${talentError?.message ?? "missing id"}`);
    talentId = String(talent.id);

    const { error: availabilityError } = await supabase.from("talent_availability").insert({
      talent_id: talentId,
      event_date: eventDate,
      status: "available",
      notes: "Temporary automated smoke test",
    });
    if (availabilityError) throw new Error(`Availability insert failed: ${availabilityError.message}`);

    const sourceText = `Corporate event in Jakarta on ${eventDate}. Need a female pop singer. Budget Rp10-15 juta.`;
    const structuredBrief: StructuredBrief = {
      eventType: "corporate",
      eventDate,
      city: "Jakarta",
      venue: "Smoke Test Venue",
      audienceSize: 300,
      talentCategory: "female singer",
      genreStyle: ["pop"],
      budgetMin: 10000000,
      budgetMax: 15000000,
      performanceDurationMinutes: 45,
      eventVibe: ["corporate", "pop"],
      specialRequirements: ["female singer"],
      sourceText,
      fieldEvidence: {},
    };

    const { data: brief, error: briefError } = await supabase
      .from("briefs")
      .insert({
        event_type: structuredBrief.eventType,
        event_date: structuredBrief.eventDate,
        city: structuredBrief.city,
        venue: structuredBrief.venue,
        audience_size: structuredBrief.audienceSize,
        talent_category: structuredBrief.talentCategory,
        genre_style: structuredBrief.genreStyle,
        budget_min: structuredBrief.budgetMin,
        budget_max: structuredBrief.budgetMax,
        performance_duration_minutes: structuredBrief.performanceDurationMinutes,
        event_vibe: structuredBrief.eventVibe,
        special_requirements: structuredBrief.specialRequirements,
        source_text: sourceText,
        field_evidence: {},
        status: "new",
      })
      .select("id")
      .single();
    if (briefError || !brief?.id) throw new Error(`Brief insert failed: ${briefError?.message ?? "missing id"}`);
    briefId = String(brief.id);

    const roster = await loadEngineTalents();
    const matches = rankTalents(roster.talents, structuredBrief, 5);
    const smokeMatch = matches.find((item) => item.talent.id === talentId);
    if (!smokeMatch) throw new Error("Matching engine did not return the eligible smoke-test talent");

    const snapshot = await persistMatchSnapshot(briefId, [smokeMatch]);

    const { data: persistedMatch, error: matchReadError } = await supabase
      .from("match_results")
      .select("id,engine_version,generated_at,score,tier")
      .eq("brief_id", briefId)
      .eq("talent_id", talentId)
      .single();
    if (matchReadError || !persistedMatch) throw new Error(`Persisted match read failed: ${matchReadError?.message ?? "missing row"}`);

    const { error: approveError } = await supabase
      .from("match_results")
      .update({ admin_approved: true, reviewed_at: new Date().toISOString() })
      .eq("id", persistedMatch.id);
    if (approveError) throw new Error(`Match approval failed: ${approveError.message}`);

    const now = new Date().toISOString();
    const { data: requestRow, error: requestError } = await supabase
      .from("availability_requests")
      .insert({
        brief_id: briefId,
        talent_id: talentId,
        match_result_id: persistedMatch.id,
        status: "pending",
        requested_at: now,
      })
      .select("id")
      .single();
    if (requestError || !requestRow?.id) throw new Error(`Availability request insert failed: ${requestError?.message ?? "missing id"}`);

    const respondedAt = new Date().toISOString();
    const { error: responseError } = await supabase
      .from("availability_requests")
      .update({ status: "confirmed", responded_at: respondedAt })
      .eq("id", requestRow.id);
    if (responseError) throw new Error(`Availability confirmation failed: ${responseError.message}`);

    const quoteValidUntil = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: offer, error: offerError } = await supabase
      .from("talent_offers")
      .insert({
        availability_request_id: requestRow.id,
        brief_id: briefId,
        talent_id: talentId,
        status: "confirmed",
        availability_status: "confirmed",
        event_fee: 12500000,
        currency: "IDR",
        included_costs: "Performance fee",
        excluded_costs: "Transport outside Jakarta",
        payment_terms: "Payment schedule subject to deal approval",
        rider_exceptions: "None for smoke test",
        quote_valid_until: quoteValidUntil,
        confirmation_source: "manager_portal",
        confirmed_at: respondedAt,
        updated_at: respondedAt,
      })
      .select("id,status,availability_status,event_fee,currency,quote_valid_until,confirmation_source,included_costs,excluded_costs,payment_terms,rider_exceptions")
      .single();
    if (offerError || !offer) throw new Error(`Talent offer insert failed: ${offerError?.message ?? "missing row"}`);

    const { data: proposal, error: proposalError } = await supabase
      .from("proposals")
      .insert({
        brief_id: briefId,
        version: 1,
        status: "sent",
        expires_at: quoteValidUntil,
        sent_at: respondedAt,
        updated_at: respondedAt,
      })
      .select("id,version,status,expires_at")
      .single();
    if (proposalError || !proposal) throw new Error(`Proposal insert failed: ${proposalError?.message ?? "missing row"}`);

    const { data: proposalItem, error: proposalItemError } = await supabase
      .from("proposal_items")
      .insert({
        proposal_id: proposal.id,
        brief_id: briefId,
        talent_id: talentId,
        talent_offer_id: offer.id,
        buyer_price: Number(offer.event_fee),
        currency: offer.currency,
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
        match_score_snapshot: persistedMatch.score,
        match_tier_snapshot: persistedMatch.tier,
      })
      .select("id,buyer_price,talent_offer_id,talent_name_snapshot,match_score_snapshot")
      .single();
    if (proposalItemError || !proposalItem) throw new Error(`Proposal item insert failed: ${proposalItemError?.message ?? "missing row"}`);

    const { error: briefStageError } = await supabase.from("briefs").update({ status: "proposal_sent" }).eq("id", briefId);
    if (briefStageError) throw new Error(`Brief proposal stage failed: ${briefStageError.message}`);

    const buyerProposal = await loadBuyerProposal(briefId);
    const buyerItem = buyerProposal?.talents?.[0];
    if (!buyerProposal?.proposal || !buyerItem) throw new Error("Buyer proposal loader did not return the frozen proposal snapshot");
    if (buyerItem.buyer_price !== 12500000 || buyerItem.name !== marker) throw new Error("Buyer proposal snapshot values are incorrect");

    const { error: selectionError } = await supabase.from("buyer_selections").insert({
      brief_id: briefId,
      talent_id: talentId,
      status: "selected",
      selected_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    if (selectionError) throw new Error(`Buyer selection failed: ${selectionError.message}`);

    const { error: proposalSelectedError } = await supabase.from("proposals").update({ status: "selected", updated_at: new Date().toISOString() }).eq("id", proposal.id);
    if (proposalSelectedError) throw new Error(`Proposal selected state failed: ${proposalSelectedError.message}`);

    const selectedProposal = await loadBuyerProposal(briefId);
    if (selectedProposal?.selectedTalentId !== talentId) throw new Error("Buyer selection was not reflected in the proposal view");

    return NextResponse.json({
      ok: true,
      database: "connected",
      checks: {
        talentInsert: true,
        availabilityInsert: true,
        briefInsert: true,
        matching: true,
        frozenMatchSnapshot: Boolean(persistedMatch.engine_version && persistedMatch.generated_at),
        availabilityRequest: true,
        liveConfirmation: true,
        talentOfferSnapshot: true,
        eventSpecificFee: Number(offer.event_fee) === 12500000,
        offerValidity: Boolean(offer.quote_valid_until),
        proposalSnapshot: proposal.status === "sent" && proposal.version === 1,
        proposalItemSnapshot: Number(proposalItem.buyer_price) === 12500000 && proposalItem.talent_offer_id === offer.id,
        buyerViewUsesSnapshot: buyerItem.buyer_price === 12500000 && buyerItem.name === marker,
        buyerSelection: selectedProposal?.selectedTalentId === talentId,
      },
      match: {
        score: smokeMatch.score,
        tier: smokeMatch.tier,
        engineVersion: snapshot.engineVersion,
      },
      offer: {
        status: offer.status,
        availabilityStatus: offer.availability_status,
        eventFee: Number(offer.event_fee),
        currency: offer.currency,
        confirmationSource: offer.confirmation_source,
      },
      proposal: {
        version: proposal.version,
        buyerPrice: buyerItem.buyer_price,
        selectedTalentId: selectedProposal?.selectedTalentId ?? null,
      },
      cleanup: "automatic",
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown error";
    console.error("DB smoke test failed", detail);
    return NextResponse.json({ ok: false, error: "DB smoke test failed", detail }, { status: 500 });
  } finally {
    if (briefId) await supabase.from("briefs").delete().eq("id", briefId);
    if (talentId) await supabase.from("talents").delete().eq("id", talentId);
  }
}
