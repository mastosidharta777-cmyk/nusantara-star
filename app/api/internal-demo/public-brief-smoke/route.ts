import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import { POST as submitPublicBrief } from "@/app/api/brief/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isProduction() {
  return process.env.VERCEL_ENV === "production";
}

function getServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) throw new Error("Supabase server environment is not configured");
  return createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function GET() {
  if (isProduction()) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const marker = `LAUNCH-SMOKE-${Date.now()}`;
  const email = `launch-smoke-${Date.now()}@example.com`;
  const supabase = getServerClient();
  let briefId: string | null = null;

  try {
    const request = new Request("https://preview.local/api/brief", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: marker,
        company: "Nusantara Star QA",
        whatsapp: "+6281111111111",
        email,
        eventType: "Corporate event",
        date: "2026-09-30",
        city: "Jakarta",
        venue: "Preview QA Venue",
        audience: "250",
        category: "Singer",
        genre: "Pop",
        budget: "Rp10–25 jt",
        duration: "30–60 minutes",
        notes: "Controlled launch readiness smoke test",
        website: "",
      }),
    });

    const response = await submitPublicBrief(request);
    const payload = await response.json().catch(() => null) as { ok?: boolean; received?: boolean; briefId?: string; error?: string } | null;
    if (!response.ok || !payload?.briefId) {
      return NextResponse.json({ ok: false, step: "submission", status: response.status, error: payload?.error ?? "missing brief id" }, { status: 500 });
    }
    briefId = payload.briefId;

    const [briefResult, matchesResult] = await Promise.all([
      supabase
        .from("briefs")
        .select("id,buyer_name,buyer_company,buyer_whatsapp,buyer_email,status,source_text")
        .eq("id", briefId)
        .single(),
      supabase
        .from("match_results")
        .select("id,engine_version,generated_at")
        .eq("brief_id", briefId),
    ]);

    if (briefResult.error) throw new Error(briefResult.error.message);
    if (matchesResult.error) throw new Error(matchesResult.error.message);

    const row = briefResult.data;
    const matches = matchesResult.data ?? [];
    const checks = {
      submissionAccepted: payload.ok === true && payload.received === true,
      contactPersisted:
        row?.buyer_name === marker &&
        row?.buyer_company === "Nusantara Star QA" &&
        row?.buyer_whatsapp === "+6281111111111" &&
        row?.buyer_email === email,
      sourceTextExcludesContact: Boolean(row?.source_text) && !String(row.source_text).includes(marker) && !String(row.source_text).includes(email),
      briefStartsNew: row?.status === "new",
      frozenMatchSnapshot: matches.length > 0 && matches.every((item) => Boolean(item.engine_version && item.generated_at)),
    };

    return NextResponse.json({ ok: Object.values(checks).every(Boolean), checks, matchCount: matches.length, cleanup: "automatic" });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unknown smoke error", cleanup: "attempted" }, { status: 500 });
  } finally {
    if (briefId) {
      const { error } = await supabase.from("briefs").delete().eq("id", briefId);
      if (error) console.error("Public brief smoke cleanup failed", error.message);
    }
  }
}
