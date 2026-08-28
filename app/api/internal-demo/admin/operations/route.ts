import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const incidentTypes = new Set([
  "buyer_cancellation","talent_cancellation","postponement","no_show","late_arrival",
  "shortened_performance","technical_failure","payment_dispute","force_majeure","other",
]);

function getServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) throw new Error("Supabase server environment is not configured");
  return createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

function rpcError(message: string) {
  return NextResponse.json({ error: message }, { status: 409 });
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const bookingId = typeof body?.bookingId === "string" ? body.bookingId : "";
    const action = typeof body?.action === "string" ? body.action : "";
    if (!bookingId || !action) return NextResponse.json({ error: "Invalid operations payload" }, { status: 400 });

    const supabase = getServerClient();

    if (action === "initialize_pre_show") {
      const { data, error } = await supabase.rpc("ns_initialize_pre_show_v1", { p_booking_id: bookingId });
      if (error) return rpcError(error.message);
      return NextResponse.json(data ?? { ok: true, status: "pre_show" });
    }

    if (action === "set_checklist_status") {
      const itemId = typeof body?.itemId === "string" ? body.itemId : "";
      const status = typeof body?.status === "string" ? body.status : "";
      if (!itemId || !["pending", "done", "not_applicable"].includes(status)) return NextResponse.json({ error: "Invalid checklist update" }, { status: 400 });
      const now = new Date().toISOString();
      const { data: changed, error } = await supabase.from("pre_show_checklist_items").update({ status, completed_at: status === "done" ? now : null, updated_at: now }).eq("id", itemId).eq("booking_id", bookingId).select("id").maybeSingle();
      if (error) throw new Error(error.message);
      if (!changed) return NextResponse.json({ error: "Checklist item not found" }, { status: 404 });
      return NextResponse.json({ ok: true, itemId, status });
    }

    if (action === "report_incident") {
      const incidentType = typeof body?.incidentType === "string" ? body.incidentType : "";
      const summary = typeof body?.summary === "string" ? body.summary.trim() : "";
      const details = typeof body?.details === "string" && body.details.trim() ? body.details.trim() : null;
      if (!incidentTypes.has(incidentType) || !summary) return NextResponse.json({ error: "Incident type and summary are required" }, { status: 400 });
      const { data, error } = await supabase.rpc("ns_report_incident_v1", { p_booking_id: bookingId, p_incident_type: incidentType, p_summary: summary, p_details: details });
      if (error) return rpcError(error.message);
      return NextResponse.json(data ?? { ok: true, bookingStatus: "incident" });
    }

    if (action === "resolve_incident") {
      const incidentId = typeof body?.incidentId === "string" ? body.incidentId : "";
      const resolutionNotes = typeof body?.resolutionNotes === "string" && body.resolutionNotes.trim() ? body.resolutionNotes.trim() : null;
      if (!incidentId) return NextResponse.json({ error: "Incident ID is required" }, { status: 400 });
      const { data, error } = await supabase.rpc("ns_resolve_incident_v1", { p_booking_id: bookingId, p_incident_id: incidentId, p_resolution_notes: resolutionNotes });
      if (error) return rpcError(error.message);
      return NextResponse.json(data ?? { ok: true, incidentStatus: "resolved" });
    }

    if (action === "complete_show") {
      const { data, error } = await supabase.rpc("ns_complete_show_v1", { p_booking_id: bookingId });
      if (error) return rpcError(error.message);
      return NextResponse.json(data ?? { ok: true, bookingStatus: "completed" });
    }

    return NextResponse.json({ error: "Unknown operations action" }, { status: 400 });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown error";
    console.error("Operations action failed", detail);
    return NextResponse.json({ error: "Operations action failed", detail }, { status: 500 });
  }
}
