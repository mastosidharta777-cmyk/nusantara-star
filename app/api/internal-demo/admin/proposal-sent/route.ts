import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

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
    const briefId = typeof body?.briefId === "string" ? body.briefId : "";
    if (!briefId) return NextResponse.json({ error: "Invalid brief id" }, { status: 400 });

    const supabase = getServerClient();
    const { data: brief, error: briefError } = await supabase
      .from("briefs")
      .select("id,status")
      .eq("id", briefId)
      .single();
    if (briefError || !brief) return NextResponse.json({ error: "Brief not found" }, { status: 404 });

    if (!["shortlisted", "proposal_sent"].includes(brief.status)) {
      return NextResponse.json({ error: "Brief is not ready for proposal" }, { status: 409 });
    }

    const { data: approvedMatches, error: matchError } = await supabase
      .from("match_results")
      .select("talent_id")
      .eq("brief_id", briefId)
      .eq("admin_approved", true);
    if (matchError) throw new Error(matchError.message);

    const { data: confirmedRequests, error: requestError } = await supabase
      .from("availability_requests")
      .select("talent_id")
      .eq("brief_id", briefId)
      .eq("status", "confirmed");
    if (requestError) throw new Error(requestError.message);

    const confirmedIds = new Set((confirmedRequests ?? []).map((item) => item.talent_id));
    const readyCount = (approvedMatches ?? []).filter((item) => confirmedIds.has(item.talent_id)).length;
    if (readyCount === 0) {
      return NextResponse.json({ error: "No approved and confirmed talent in the shortlist" }, { status: 409 });
    }

    const { error: updateError } = await supabase.from("briefs").update({ status: "proposal_sent" }).eq("id", briefId);
    if (updateError) throw new Error(updateError.message);

    return NextResponse.json({ ok: true, briefId, status: "proposal_sent", readyTalentCount: readyCount });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown error";
    console.error("Proposal sent action failed", detail);
    return NextResponse.json({ error: "Proposal sent action failed", detail }, { status: 500 });
  }
}
