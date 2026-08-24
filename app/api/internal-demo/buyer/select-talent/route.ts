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
  if (process.env.VERCEL_ENV === "production") return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    const body = await request.json().catch(() => null);
    const briefId = typeof body?.briefId === "string" ? body.briefId : "";
    const talentId = typeof body?.talentId === "string" ? body.talentId : "";
    const proposalItemId = typeof body?.proposalItemId === "string" ? body.proposalItemId : "";
    if (!briefId || !talentId || !proposalItemId) return NextResponse.json({ error: "Invalid selection" }, { status: 400 });

    const supabase = getServerClient();
    const { data: brief, error: briefError } = await supabase.from("briefs").select("id,status").eq("id", briefId).single();
    if (briefError || !brief) return NextResponse.json({ error: "Brief not found" }, { status: 404 });
    if (!["proposal_sent", "buyer_selected"].includes(brief.status)) return NextResponse.json({ error: "Brief is not ready for buyer selection" }, { status: 409 });

    const { data: item, error: itemError } = await supabase
      .from("proposal_items")
      .select("id,proposal_id,brief_id,talent_id,offer_valid_until")
      .eq("id", proposalItemId)
      .eq("brief_id", briefId)
      .eq("talent_id", talentId)
      .maybeSingle();
    if (itemError) throw new Error(itemError.message);
    if (!item) return NextResponse.json({ error: "Talent is not part of this proposal snapshot" }, { status: 409 });

    const { data: proposal, error: proposalError } = await supabase
      .from("proposals")
      .select("id,status,expires_at")
      .eq("id", item.proposal_id)
      .in("status", ["sent", "viewed", "selected"])
      .maybeSingle();
    if (proposalError) throw new Error(proposalError.message);
    if (!proposal) return NextResponse.json({ error: "Proposal is not selectable" }, { status: 409 });

    const nowMs = Date.now();
    if ((proposal.expires_at && new Date(proposal.expires_at).getTime() <= nowMs) || (item.offer_valid_until && new Date(item.offer_valid_until).getTime() <= nowMs)) {
      return NextResponse.json({ error: "Proposal or talent offer has expired and requires reconfirmation" }, { status: 409 });
    }

    const { data: claimedRows, error: claimError } = await supabase
      .from("briefs")
      .update({ status: "buyer_selected" })
      .eq("id", briefId)
      .in("status", ["proposal_sent", "buyer_selected"])
      .select("id,status");
    if (claimError) throw new Error(claimError.message);
    if (!claimedRows?.length) return NextResponse.json({ error: "Brief already advanced beyond buyer selection" }, { status: 409 });

    const now = new Date().toISOString();
    const { error: selectionError } = await supabase.from("buyer_selections").upsert(
      { brief_id: briefId, talent_id: talentId, status: "selected", selected_at: now, updated_at: now },
      { onConflict: "brief_id" },
    );
    if (selectionError) throw new Error(selectionError.message);

    const { error: proposalUpdateError } = await supabase.from("proposals").update({ status: "selected", updated_at: now }).eq("id", proposal.id);
    if (proposalUpdateError) throw new Error(proposalUpdateError.message);

    return NextResponse.json({ ok: true, briefId, talentId, proposalId: proposal.id, proposalItemId, status: "buyer_selected" });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown error";
    console.error("Buyer talent selection failed", detail);
    return NextResponse.json({ error: "Buyer talent selection failed", detail }, { status: 500 });
  }
}
