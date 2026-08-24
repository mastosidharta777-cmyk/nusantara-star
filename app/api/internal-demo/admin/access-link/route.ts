import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import { signAccessToken } from "@/lib/signed-access";

export const runtime = "nodejs";

function getServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) throw new Error("Supabase server environment is not configured");
  return createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const scope = body?.scope === "buyer_proposal" || body?.scope === "talent_offer" ? body.scope : null;
    const subjectId = typeof body?.subjectId === "string" ? body.subjectId : "";
    if (!scope || !subjectId) return NextResponse.json({ error: "Invalid secure-link request" }, { status: 400 });

    if (process.env.VERCEL_ENV === "production" && request.headers.get("x-ns-admin-verified") !== "1") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = getServerClient();
    let path = "";
    let expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    if (scope === "buyer_proposal") {
      const { data: proposal, error } = await supabase.from("proposals").select("brief_id,expires_at,status").eq("brief_id", subjectId).in("status", ["sent", "viewed", "selected"]).order("version", { ascending: false }).limit(1).maybeSingle();
      if (error) throw new Error(error.message);
      if (!proposal) return NextResponse.json({ error: "Buyer proposal is not available" }, { status: 409 });
      if (proposal.expires_at) {
        const proposalExpiry = new Date(proposal.expires_at);
        if (proposalExpiry.getTime() <= Date.now()) return NextResponse.json({ error: "Proposal has expired" }, { status: 409 });
        if (proposalExpiry < expiresAt) expiresAt = proposalExpiry;
      }
      path = `/id/proposal/${encodeURIComponent(subjectId)}`;
    } else {
      const { data: row, error } = await supabase.from("availability_requests").select("id").eq("id", subjectId).maybeSingle();
      if (error) throw new Error(error.message);
      if (!row) return NextResponse.json({ error: "Availability request not found" }, { status: 404 });
      path = `/talent-confirmation/${encodeURIComponent(subjectId)}`;
    }

    const token = signAccessToken(scope, subjectId, expiresAt);
    const origin = new URL(request.url).origin;
    return NextResponse.json({ ok: true, url: `${origin}${path}?token=${encodeURIComponent(token)}`, expiresAt: expiresAt.toISOString() });
  } catch (error) {
    return NextResponse.json({ error: "Secure link creation failed", detail: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
