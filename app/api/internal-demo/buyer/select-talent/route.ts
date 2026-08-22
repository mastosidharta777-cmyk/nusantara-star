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
    const talentId = typeof body?.talentId === "string" ? body.talentId : "";
    if (!briefId || !talentId) return NextResponse.json({ error: "Invalid selection" }, { status: 400 });

    const supabase = getServerClient();
    const { data: brief, error: briefError } = await supabase
      .from("briefs")
      .select("id,status")
      .eq("id", briefId)
      .single();
    if (briefError || !brief) return NextResponse.json({ error: "Brief not found" }, { status: 404 });

    if (!["proposal_sent", "buyer_selected"].includes(brief.status)) {
      return NextResponse.json({ error: "Brief is not ready for buyer selection" }, { status: 409 });
    }

    const { data: match, error: matchError } = await supabase
      .from("match_results")
      .select("talent_id,admin_approved")
      .eq("brief_id", briefId)
      .eq("talent_id", talentId)
      .eq("admin_approved", true)
      .maybeSingle();
    if (matchError) throw new Error(matchError.message);
    if (!match) return NextResponse.json({ error: "Talent is not approved for this proposal" }, { status: 409 });

    const { data: availability, error: availabilityError } = await supabase
      .from("availability_requests")
      .select("talent_id,status")
      .eq("brief_id", briefId)
      .eq("talent_id", talentId)
      .eq("status", "confirmed")
      .maybeSingle();
    if (availabilityError) throw new Error(availabilityError.message);
    if (!availability) return NextResponse.json({ error: "Talent availability is not confirmed" }, { status: 409 });

    const now = new Date().toISOString();
    const { error: selectionError } = await supabase.from("buyer_selections").upsert(
      {
        brief_id: briefId,
        talent_id: talentId,
        status: "selected",
        selected_at: now,
        updated_at: now,
      },
      { onConflict: "brief_id" }
    );
    if (selectionError) throw new Error(selectionError.message);

    const { error: updateError } = await supabase.from("briefs").update({ status: "buyer_selected" }).eq("id", briefId);
    if (updateError) throw new Error(updateError.message);

    return NextResponse.json({ ok: true, briefId, talentId, status: "buyer_selected" });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown error";
    console.error("Buyer talent selection failed", detail);
    return NextResponse.json({ error: "Buyer talent selection failed", detail }, { status: 500 });
  }
}
