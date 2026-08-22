import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import { forwardOnlyBriefStatus } from "@/lib/brief-status";
import { MATCH_ENGINE_VERSION } from "@/lib/match-persistence";
import { rankTalents } from "@/lib/talent-engine/matching";
import { loadEngineTalents } from "@/lib/talent-engine/supabase-talents";
import type { StructuredBrief } from "@/lib/talent-engine/types";

export const runtime = "nodejs";

type Action = "approve" | "reject" | "request_live_confirmation";

type BriefRow = {
  id: string;
  event_type: string | null;
  event_date: string | null;
  city: string | null;
  venue: string | null;
  audience_size: number | null;
  talent_category: string | null;
  genre_style: string[] | null;
  budget_min: number | null;
  budget_max: number | null;
  performance_duration_minutes: number | null;
  event_vibe: string[] | null;
  special_requirements: string[] | null;
  status: string;
};

function isProduction() {
  return process.env.VERCEL_ENV === "production";
}

function getServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) throw new Error("Supabase server environment is not configured");
  return createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

function toBrief(row: BriefRow): StructuredBrief {
  return {
    eventType: row.event_type,
    eventDate: row.event_date,
    city: row.city,
    venue: row.venue,
    audienceSize: row.audience_size,
    talentCategory: row.talent_category,
    genreStyle: row.genre_style ?? [],
    budgetMin: row.budget_min,
    budgetMax: row.budget_max,
    performanceDurationMinutes: row.performance_duration_minutes,
    eventVibe: row.event_vibe ?? [],
    specialRequirements: row.special_requirements ?? [],
  };
}

export async function POST(request: Request) {
  if (isProduction()) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    const body = await request.json().catch(() => null);
    const briefId = typeof body?.briefId === "string" ? body.briefId : "";
    const talentId = typeof body?.talentId === "string" ? body.talentId : "";
    const action = body?.action as Action | undefined;

    if (!briefId || !talentId || !["approve", "reject", "request_live_confirmation"].includes(action ?? "")) {
      return NextResponse.json({ error: "Invalid action payload" }, { status: 400 });
    }

    const supabase = getServerClient();
    const [{ data: briefData, error: briefError }, { data: existingMatch, error: existingMatchError }] = await Promise.all([
      supabase
        .from("briefs")
        .select("id,event_type,event_date,city,venue,audience_size,talent_category,genre_style,budget_min,budget_max,performance_duration_minutes,event_vibe,special_requirements,status")
        .eq("id", briefId)
        .single(),
      supabase
        .from("match_results")
        .select("id,score,tier,availability_status,availability_freshness,requires_live_confirmation,score_breakdown,reasons,engine_version,generated_at")
        .eq("brief_id", briefId)
        .eq("talent_id", talentId)
        .maybeSingle(),
    ]);

    if (briefError || !briefData) return NextResponse.json({ error: "Brief not found" }, { status: 404 });
    if (existingMatchError) throw new Error(existingMatchError.message);

    const brief = briefData as BriefRow;
    if (["proposal_sent", "buyer_selected", "terms_agreed", "booked", "closed", "cancelled"].includes(brief.status)) {
      return NextResponse.json({ error: "Matching review is locked after proposal stage" }, { status: 409 });
    }

    let availabilityStatus: string | null = null;
    if (action === "approve") {
      const { data: availabilityRequest, error: availabilityError } = await supabase
        .from("availability_requests")
        .select("status")
        .eq("brief_id", briefId)
        .eq("talent_id", talentId)
        .maybeSingle();
      if (availabilityError) throw new Error(availabilityError.message);

      availabilityStatus = availabilityRequest?.status ?? null;
      if (availabilityStatus === "unavailable") {
        return NextResponse.json({ error: "Cannot approve a talent confirmed as unavailable" }, { status: 409 });
      }
    }

    const now = new Date().toISOString();
    let matchResultId = existingMatch?.id ? String(existingMatch.id) : "";

    if (existingMatch?.id) {
      const patch: Record<string, unknown> = {
        engine_version: existingMatch.engine_version ?? MATCH_ENGINE_VERSION,
        generated_at: existingMatch.generated_at ?? now,
      };
      if (action === "approve") {
        patch.admin_approved = true;
        patch.admin_rejected = false;
        patch.reviewed_at = now;
      } else if (action === "reject") {
        patch.admin_approved = false;
        patch.admin_rejected = true;
        patch.reviewed_at = now;
      }

      const { data: updatedMatch, error: updateMatchError } = await supabase
        .from("match_results")
        .update(patch)
        .eq("id", existingMatch.id)
        .select("id")
        .single();
      if (updateMatchError || !updatedMatch?.id) throw new Error(updateMatchError?.message ?? "Failed to update match result");
      matchResultId = String(updatedMatch.id);
    } else {
      const roster = await loadEngineTalents();
      const match = rankTalents(roster.talents, toBrief(brief), 30).find((item) => item.talent.id === talentId);
      if (!match) return NextResponse.json({ error: "Talent is not an eligible current match" }, { status: 409 });

      const matchPayload: Record<string, unknown> = {
        brief_id: briefId,
        talent_id: talentId,
        score: match.score,
        tier: match.tier,
        availability_status: match.availabilityStatus,
        availability_freshness: match.freshness,
        requires_live_confirmation: match.requiresLiveConfirmation,
        score_breakdown: match.breakdown,
        reasons: match.reasons,
        engine_version: MATCH_ENGINE_VERSION,
        generated_at: now,
      };
      if (action === "approve") {
        matchPayload.admin_approved = true;
        matchPayload.admin_rejected = false;
        matchPayload.reviewed_at = now;
      } else if (action === "reject") {
        matchPayload.admin_approved = false;
        matchPayload.admin_rejected = true;
        matchPayload.reviewed_at = now;
      }

      const { data: insertedMatch, error: insertMatchError } = await supabase
        .from("match_results")
        .upsert(matchPayload, { onConflict: "brief_id,talent_id" })
        .select("id")
        .single();
      if (insertMatchError || !insertedMatch?.id) throw new Error(insertMatchError?.message ?? "Failed to persist match result");
      matchResultId = String(insertedMatch.id);
    }

    if (action === "request_live_confirmation") {
      const { error: requestError } = await supabase.from("availability_requests").upsert(
        {
          brief_id: briefId,
          talent_id: talentId,
          match_result_id: matchResultId,
          status: "pending",
          requested_at: now,
          responded_at: null,
        },
        { onConflict: "brief_id,talent_id" },
      );
      if (requestError) throw new Error(requestError.message);
    }

    const proposedStatus =
      action === "request_live_confirmation"
        ? "availability_check"
        : action === "approve"
          ? availabilityStatus === "confirmed"
            ? "shortlisted"
            : "matching"
          : "reviewing";
    const nextBriefStatus = forwardOnlyBriefStatus(brief.status, proposedStatus);

    if (nextBriefStatus !== brief.status) {
      const { error: briefUpdateError } = await supabase.from("briefs").update({ status: nextBriefStatus }).eq("id", briefId).eq("status", brief.status);
      if (briefUpdateError) throw new Error(briefUpdateError.message);
    }

    return NextResponse.json({
      ok: true,
      action,
      briefId,
      talentId,
      matchResultId,
      briefStatus: nextBriefStatus,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Admin match action failed", message);
    return NextResponse.json({ error: "Admin match action failed", detail: message }, { status: 500 });
  }
}
