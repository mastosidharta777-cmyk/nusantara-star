import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import { verifyAccessToken } from "@/lib/signed-access";

export const runtime = "nodejs";
type ResponseStatus = "confirmed" | "tentative" | "unavailable" | "no_response";

function getServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) throw new Error("Supabase server environment is not configured");
  return createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

function nullableText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const requestId = typeof body?.requestId === "string" ? body.requestId : "";
    const status = body?.status as ResponseStatus | undefined;
    const accessToken = typeof body?.accessToken === "string" ? body.accessToken : null;
    if (!requestId || !["confirmed", "tentative", "unavailable", "no_response"].includes(status ?? "")) return NextResponse.json({ error: "Invalid response payload" }, { status: 400 });
    if (process.env.VERCEL_ENV && !verifyAccessToken(accessToken, "talent_offer", requestId)) return NextResponse.json({ error: "Invalid or expired access link" }, { status: 401 });

    const rawFee = body?.eventFee;
    const eventFee = rawFee === null || rawFee === undefined || rawFee === "" ? null : Number(rawFee);
    if (eventFee !== null && (!Number.isSafeInteger(eventFee) || eventFee < 0)) return NextResponse.json({ error: "Invalid event fee" }, { status: 400 });
    if (status === "confirmed" && (!eventFee || eventFee <= 0)) return NextResponse.json({ error: "Confirmed offer requires an event fee" }, { status: 409 });

    let quoteValidUntil: string | null = null;
    if (body?.quoteValidUntil) {
      const parsed = new Date(String(body.quoteValidUntil));
      if (Number.isNaN(parsed.getTime())) return NextResponse.json({ error: "Invalid quote validity" }, { status: 400 });
      if (parsed.getTime() <= Date.now()) return NextResponse.json({ error: "Quote validity must be in the future" }, { status: 409 });
      quoteValidUntil = parsed.toISOString();
    }

    const supabase = getServerClient();
    const { data, error } = await supabase.rpc("ns_record_availability_response_v1", {
      p_request_id: requestId,
      p_status: status,
      p_event_fee: eventFee,
      p_included_costs: nullableText(body?.includedCosts),
      p_excluded_costs: nullableText(body?.excludedCosts),
      p_payment_terms: nullableText(body?.paymentTerms),
      p_rider_exceptions: nullableText(body?.riderExceptions),
      p_quote_valid_until: quoteValidUntil,
    });
    if (error) {
      const message = error.message || "Availability response failed";
      const httpStatus = message.includes("not found") ? 404 : 409;
      return NextResponse.json({ error: message }, { status: httpStatus });
    }

    return NextResponse.json({ ok: true, ...(data ?? {}) });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown error";
    console.error("Availability response failed", detail);
    return NextResponse.json({ error: "Availability response failed" }, { status: 500 });
  }
}
