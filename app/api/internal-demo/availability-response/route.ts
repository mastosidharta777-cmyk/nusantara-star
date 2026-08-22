import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import { forwardOnlyBriefStatus } from "@/lib/brief-status";

export const runtime = "nodejs";

type ResponseStatus = "confirmed" | "tentative" | "unavailable" | "no_response";

function getServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) throw new Error("Supabase server environment is not configured");
  return createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function POST(request: Request) {
  if (process.env.VERCEL_ENV === "production") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const body = await request.json().catch(() => null);
    const requestId = typeof body?.requestId === "string" ? body.requestId : "";
    const status = body?.status as ResponseStatus | undefined;
    if (!requestId || !["confirmed", "tentative", "unavailable", "no_response"].includes(status ?? "")) {
      return NextResponse.json({ error: "Invalid response payload" }, { status: 400 });
    }

    const supabase = getServerClient();
    const { data: availabilityRequest, error: requestError } = await supabase
      .from("availability_requests")
      .select("id,brief_id,talent_id,status")
      .eq("id", requestId)
      .single();

    if (requestError || !availabilityRequest) {
      return NextResponse.json({ error: "Availability request not found" }, { status: 404 });
    }

    const { data: brief, error: briefError } = await supabase
      .from("briefs")
      .select("id,event_date,status")
      .eq("id", availabilityRequest.brief_id)
      .single();
    if (briefError || !brief) throw new Error(briefError?.message ?? "Brief not found");

    const now = new Date().toISOString();

    if (brief.event_date && status !== "no_response") {
      const calendarStatus = status === "confirmed" ? "available" : status;
      const { error: calendarError } = await supabase.from("talent_availability").upsert(
        {
          talent_id: availabilityRequest.talent_id,
          event_date: brief.event_date,
          status: calendarStatus,
          notes: `Live confirmation response for brief ${availabilityRequest.brief_id}`,
          updated_at: now,
        },
        { onConflict: "talent_id,event_date" },
      );
      if (calendarError) throw new Error(calendarError.message);

      const { error: talentFreshnessError } = await supabase
        .from("talents")
        .update({ last_calendar_updated_at: now })
        .eq("id", availabilityRequest.talent_id);
      if (talentFreshnessError) throw new Error(talentFreshnessError.message);
    }

    const { error: updateError } = await supabase
      .from("availability_requests")
      .update({ status, responded_at: now })
      .eq("id", requestId);
    if (updateError) throw new Error(updateError.message);

    let proposedBriefStatus = "availability_check";
    if (status === "confirmed") {
      const { data: matchResult, error: matchError } = await supabase
        .from("match_results")
        .select("admin_approved,admin_rejected")
        .eq("brief_id", availabilityRequest.brief_id)
        .eq("talent_id", availabilityRequest.talent_id)
        .maybeSingle();
      if (matchError) throw new Error(matchError.message);

      if (matchResult?.admin_approved === true && matchResult?.admin_rejected !== true) {
        proposedBriefStatus = "shortlisted";
      }
    }

    const nextBriefStatus = forwardOnlyBriefStatus(brief.status, proposedBriefStatus);
    if (nextBriefStatus !== brief.status) {
      const { error: briefStatusError } = await supabase
        .from("briefs")
        .update({ status: nextBriefStatus })
        .eq("id", availabilityRequest.brief_id)
        .eq("status", brief.status);
      if (briefStatusError) throw new Error(briefStatusError.message);
    }

    return NextResponse.json({
      ok: true,
      requestId,
      briefId: availabilityRequest.brief_id,
      talentId: availabilityRequest.talent_id,
      status,
      briefStatus: nextBriefStatus,
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown error";
    console.error("Availability response failed", detail);
    return NextResponse.json({ error: "Availability response failed", detail }, { status: 500 });
  }
}
