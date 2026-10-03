import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import { verifyAccessToken } from "@/lib/signed-access";
import { parseEstimatedShowTime } from "@/lib/estimated-show-time";
import { parseManagerDutyWindow } from "@/lib/manager-duty-window";

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
    if (status === "confirmed" && !quoteValidUntil) {
      return NextResponse.json({ error: "Confirmed offer requires a future quote validity" }, { status: 409 });
    }
    let showTime: ReturnType<typeof parseEstimatedShowTime> = { startLocal: null, endLocal: null, timeZone: null };
    if (status === "confirmed") {
      try {
        showTime = parseEstimatedShowTime(
          typeof body?.showStartLocal === "string" ? body.showStartLocal : "",
          typeof body?.showEndLocal === "string" ? body.showEndLocal : "",
          typeof body?.showTimezone === "string" ? body.showTimezone : "",
        );
        if (!showTime.startLocal) throw new Error("Missing confirmed show time");
      } catch {
        return NextResponse.json({ error: "Confirmed offer requires show start, end, and event time zone" }, { status: 400 });
      }
    }

    const supabase = getServerClient();
    let duty: ReturnType<typeof parseManagerDutyWindow> | null = null;
    if (status === "confirmed") {
      const { data: availabilityRequest, error: requestError } = await supabase.from("availability_requests").select("brief_id").eq("id", requestId).maybeSingle();
      if (requestError || !availabilityRequest) return NextResponse.json({ error: "Availability request not found" }, { status: 404 });
      const { data: brief, error: briefError } = await supabase.from("briefs").select("event_date").eq("id", availabilityRequest.brief_id).maybeSingle();
      if (briefError || !brief?.event_date) return NextResponse.json({ error: "Event date not found" }, { status: 409 });
      try {
        duty = parseManagerDutyWindow({
          startLocal: typeof body?.dutyStartLocal === "string" ? body.dutyStartLocal : "",
          endLocal: typeof body?.dutyEndLocal === "string" ? body.dutyEndLocal : "",
          location: typeof body?.dutyLocation === "string" ? body.dutyLocation : "",
          eventDate: brief.event_date,
          showStartLocal: showTime.startLocal ?? "",
          showEndLocal: showTime.endLocal ?? "",
        });
      } catch (error) {
        return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid duty window" }, { status: 400 });
      }
    }
    const { data, error } = await supabase.rpc("ns_record_availability_response_v3", {
      p_request_id: requestId,
      p_status: status,
      p_event_fee: eventFee,
      p_included_costs: nullableText(body?.includedCosts),
      p_excluded_costs: nullableText(body?.excludedCosts),
      p_payment_terms: nullableText(body?.paymentTerms),
      p_rider_exceptions: nullableText(body?.riderExceptions),
      p_quote_valid_until: quoteValidUntil,
      p_show_start_local: showTime.startLocal,
      p_show_end_local: showTime.endLocal,
      p_show_timezone: showTime.timeZone,
      p_duty_start_local: duty?.startLocal ?? null,
      p_duty_end_local: duty?.endLocal ?? null,
      p_duty_location: duty?.location ?? null,
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
