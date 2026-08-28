import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import { verifyAccessToken } from "@/lib/signed-access";

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
    const briefId = typeof body?.briefId === "string" ? body.briefId : "";
    const talentId = typeof body?.talentId === "string" ? body.talentId : "";
    const proposalItemId = typeof body?.proposalItemId === "string" ? body.proposalItemId : "";
    const accessToken = typeof body?.accessToken === "string" ? body.accessToken : null;
    if (!briefId || !talentId || !proposalItemId) return NextResponse.json({ error: "Invalid selection" }, { status: 400 });
    if (process.env.VERCEL_ENV && !verifyAccessToken(accessToken, "buyer_proposal", briefId)) return NextResponse.json({ error: "Invalid or expired access link" }, { status: 401 });

    const supabase = getServerClient();
    const { data, error } = await supabase.rpc("ns_select_buyer_talent_v1", {
      p_brief_id: briefId,
      p_talent_id: talentId,
      p_proposal_item_id: proposalItemId,
    });
    if (error) {
      const message = error.message || "Buyer talent selection failed";
      const status = message.includes("not found") ? 404 : 409;
      return NextResponse.json({ error: message }, { status });
    }

    return NextResponse.json({ ok: true, ...(data ?? {}) });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown error";
    console.error("Buyer talent selection failed", detail);
    return NextResponse.json({ error: "Buyer talent selection failed" }, { status: 500 });
  }
}
