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

type PriorityInput = {
  proposalItemId: string;
  talentId: string;
  priorityRank: number;
};

function parsePriorities(value: unknown): PriorityInput[] | null {
  if (!Array.isArray(value) || value.length < 1 || value.length > 3) return null;
  const parsed = value.map((item) => {
    if (!item || typeof item !== "object") return null;
    const row = item as Record<string, unknown>;
    if (typeof row.proposalItemId !== "string" || typeof row.talentId !== "string" || !Number.isInteger(row.priorityRank)) return null;
    return {
      proposalItemId: row.proposalItemId,
      talentId: row.talentId,
      priorityRank: Number(row.priorityRank),
    };
  });
  if (parsed.some((item) => item === null)) return null;
  const priorities = parsed as PriorityInput[];
  const ranks = priorities.map((item) => item.priorityRank).sort((a, b) => a - b);
  if (ranks.some((rank, index) => rank !== index + 1)) return null;
  if (new Set(priorities.map((item) => item.talentId)).size !== priorities.length) return null;
  if (new Set(priorities.map((item) => item.proposalItemId)).size !== priorities.length) return null;
  return priorities;
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const briefId = typeof body?.briefId === "string" ? body.briefId : "";
    const accessToken = typeof body?.accessToken === "string" ? body.accessToken : null;
    if (!briefId) return NextResponse.json({ error: "Invalid selection" }, { status: 400 });
    if (process.env.VERCEL_ENV && !verifyAccessToken(accessToken, "buyer_proposal", briefId)) {
      return NextResponse.json({ error: "Invalid or expired access link" }, { status: 401 });
    }

    const supabase = getServerClient();
    const priorities = parsePriorities(body?.priorities);
    if (body?.priorities !== undefined) {
      const proposalId = typeof body?.proposalId === "string" ? body.proposalId : "";
      if (!proposalId || !priorities) return NextResponse.json({ error: "Invalid buyer priority order" }, { status: 400 });

      const { data, error } = await supabase.rpc("ns_set_buyer_priorities_v1", {
        p_brief_id: briefId,
        p_proposal_id: proposalId,
        p_priorities: priorities.map((item) => ({
          proposal_item_id: item.proposalItemId,
          talent_id: item.talentId,
          priority_rank: item.priorityRank,
        })),
      });
      if (error) {
        const message = error.message || "Buyer priority selection failed";
        const status = message.toLowerCase().includes("not found") ? 404 : 409;
        return NextResponse.json({ error: message }, { status });
      }
      return NextResponse.json({ ok: true, ...(data ?? {}) });
    }

    // Backward-compatible single selection path for older proposal UI/tests.
    const talentId = typeof body?.talentId === "string" ? body.talentId : "";
    const proposalItemId = typeof body?.proposalItemId === "string" ? body.proposalItemId : "";
    if (!talentId || !proposalItemId) return NextResponse.json({ error: "Invalid selection" }, { status: 400 });

    const { data, error } = await supabase.rpc("ns_select_buyer_talent_v1", {
      p_brief_id: briefId,
      p_talent_id: talentId,
      p_proposal_item_id: proposalItemId,
    });
    if (error) {
      const message = error.message || "Buyer talent selection failed";
      const status = message.toLowerCase().includes("not found") ? 404 : 409;
      return NextResponse.json({ error: message }, { status });
    }

    return NextResponse.json({ ok: true, ...(data ?? {}) });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown error";
    console.error("Buyer talent selection failed", detail);
    return NextResponse.json({ error: "Buyer talent selection failed", detail }, { status: 500 });
  }
}
