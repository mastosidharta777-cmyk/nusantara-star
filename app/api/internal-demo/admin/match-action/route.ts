import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

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
    const { data: briefData, error: briefError } = await supabase
      .from("briefs")
      .select("id,event_type,event_date,city,venue,audience_size,talent_category,genre_style,budget_min,budget_max,performance_duration_minutes,event_vibe,special_requirements")
      .eq("id", briefId)
      .single();

    if (briefError || !briefData) return NextResponse.json({ error: "Brief not found" }, { status: 404 });

    const roster = await loadEngineTalents();
    const match = rankTalents(roster.talents, toBrief(briefData as BriefRow), 30).find((item) => item.talent.id === talentId);
    if (!match) return NextResponse.json({ error: "Talent is not an eligible current match" }, { status: 409 });

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

    const { data: matchResult, error: matchError } = await supabase
      .from("match_results")
      .upsert(matchPayload, { onConflict: "brief_id,talent_id" })
      .select("id")
      .single();

    if (matchError || !matchResult?.id) throw new Error(matchError?.message ?? "Failed to persist match result");

    if (action === "request_live_confirmation") {
      const { error: requestError } = await supabase.from("availability_requests").upsert(
        {
          brief_id: briefId,
          talent_id: talentId,
          match_result_id: matchResult.id,
          status: "pending",
          requested_at: now,
          responded_at: null,
        },
        { onConflict: "brief_id,talent_id" },
      );
      if (requestError) throw new Error(requestError.message);
    }

    let nextBriefStatus = "reviewing";
    if (action === "request_live_confirmation") {
      nextBriefStatus = "availability_check";
    } else if (action === "approve") {
      nextBriefStatus = availabilityStatus === "confirmed" ? "shortlisted" : "matching";
    }

    const { error: briefUpdateError } = await supabase.from("briefs").update({ status: nextBriefStatus }).eq("id", briefId);
    if (briefUpdateError) throw new Error(briefUpdateError.message);

    return NextResponse.json({
      ok: true,
      action,
      briefId,
      talentId,
      matchResultId: matchResult.id,
      briefStatus: nextBriefStatus,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Admin match action failed", message);
    return NextResponse.json({ error: "Admin match action failed", detail: message }, { status: 500 });
  }
}
