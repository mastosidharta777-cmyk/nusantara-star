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

function dateMinusDays(isoDate: string, days: number) {
  const date = new Date(`${isoDate}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const bookingId = typeof body?.bookingId === "string" ? body.bookingId : "";
    const action = typeof body?.action === "string" ? body.action : "";
    if (!bookingId || !action) return NextResponse.json({ error: "Invalid operations payload" }, { status: 400 });

    const supabase = getServerClient();
    const { data: booking, error: bookingError } = await supabase
      .from("bookings")
      .select("id,status,event_date,pre_show_at,completed_at")
      .eq("id", bookingId)
      .single();
    if (bookingError || !booking) return NextResponse.json({ error: "Booking not found" }, { status: 404 });

    if (action === "initialize_pre_show") {
      if (!["secured", "pre_show"].includes(booking.status)) return NextResponse.json({ error: "Booking must be secured before pre-show" }, { status: 409 });
      if (!booking.event_date) return NextResponse.json({ error: "Booking event date is required" }, { status: 409 });

      const template = [
        ["H-14", 14, "venue_pic", "Venue & PIC confirmed"],
        ["H-14", 14, "event_contacts", "Buyer/talent operational contacts confirmed"],
        ["H-7", 7, "rider", "Rider requirements confirmed"],
        ["H-7", 7, "technical", "Technical requirements confirmed"],
        ["H-3", 3, "transport_accommodation", "Transport/accommodation confirmed"],
        ["H-3", 3, "payment_status", "Payment status reviewed"],
        ["H-1", 1, "call_time", "Call time confirmed"],
        ["H-1", 1, "performance_time", "Performance time confirmed"],
      ] as const;
      const rows = template.map(([checkpoint, days, itemKey, label]) => ({
        booking_id: bookingId,
        checkpoint_code: checkpoint,
        item_key: itemKey,
        label,
        due_date: dateMinusDays(booking.event_date, days),
      }));
      const { error: checklistError } = await supabase.from("pre_show_checklist_items").upsert(rows, { onConflict: "booking_id,checkpoint_code,item_key", ignoreDuplicates: true });
      if (checklistError) throw new Error(checklistError.message);

      if (booking.status === "secured") {
        const now = new Date().toISOString();
        const { error: updateError } = await supabase.from("bookings").update({ status: "pre_show", pre_show_at: now, updated_at: now }).eq("id", bookingId).eq("status", "secured");
        if (updateError) throw new Error(updateError.message);
      }
      return NextResponse.json({ ok: true, status: "pre_show", checklistCount: rows.length });
    }

    if (action === "set_checklist_status") {
      const itemId = typeof body?.itemId === "string" ? body.itemId : "";
      const status = typeof body?.status === "string" ? body.status : "";
      if (!itemId || !["pending", "done", "not_applicable"].includes(status)) return NextResponse.json({ error: "Invalid checklist update" }, { status: 400 });
      const now = new Date().toISOString();
      const { error } = await supabase.from("pre_show_checklist_items").update({ status, completed_at: status === "done" ? now : null, updated_at: now }).eq("id", itemId).eq("booking_id", bookingId);
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true, itemId, status });
    }

    if (action === "report_incident") {
      const incidentType = typeof body?.incidentType === "string" ? body.incidentType : "";
      const summary = typeof body?.summary === "string" ? body.summary.trim() : "";
      const details = typeof body?.details === "string" && body.details.trim() ? body.details.trim() : null;
      if (!incidentTypes.has(incidentType) || !summary) return NextResponse.json({ error: "Incident type and summary are required" }, { status: 400 });
      if (["cancelled", "completed"].includes(booking.status)) return NextResponse.json({ error: "Completed/cancelled booking cannot enter incident state" }, { status: 409 });

      let priorStatus = booking.status;
      if (booking.status === "incident") {
        const { data: firstOpen } = await supabase.from("incidents").select("prior_booking_status").eq("booking_id", bookingId).eq("status", "open").order("created_at", { ascending: true }).limit(1).maybeSingle();
        priorStatus = firstOpen?.prior_booking_status ?? "pre_show";
      }
      const now = new Date().toISOString();
      const { data: incident, error } = await supabase.from("incidents").insert({ booking_id: bookingId, incident_type: incidentType, summary, details, prior_booking_status: priorStatus, occurred_at: now }).select("id,status,incident_type,summary").single();
      if (error || !incident) throw new Error(error?.message ?? "Incident creation failed");
      if (booking.status !== "incident") {
        const { error: bookingUpdateError } = await supabase.from("bookings").update({ status: "incident", updated_at: now }).eq("id", bookingId).eq("status", booking.status);
        if (bookingUpdateError) throw new Error(bookingUpdateError.message);
      }
      return NextResponse.json({ ok: true, incident, bookingStatus: "incident" });
    }

    if (action === "resolve_incident") {
      const incidentId = typeof body?.incidentId === "string" ? body.incidentId : "";
      const resolutionNotes = typeof body?.resolutionNotes === "string" && body.resolutionNotes.trim() ? body.resolutionNotes.trim() : null;
      if (!incidentId) return NextResponse.json({ error: "Incident ID is required" }, { status: 400 });
      const { data: incident, error: incidentError } = await supabase.from("incidents").select("id,status,prior_booking_status").eq("id", incidentId).eq("booking_id", bookingId).single();
      if (incidentError || !incident) return NextResponse.json({ error: "Incident not found" }, { status: 404 });
      if (incident.status !== "open") return NextResponse.json({ error: "Incident is already resolved" }, { status: 409 });
      const now = new Date().toISOString();
      const { error: resolveError } = await supabase.from("incidents").update({ status: "resolved", resolved_at: now, resolution_notes: resolutionNotes, updated_at: now }).eq("id", incidentId).eq("status", "open");
      if (resolveError) throw new Error(resolveError.message);
      const { count, error: countError } = await supabase.from("incidents").select("id", { count: "exact", head: true }).eq("booking_id", bookingId).eq("status", "open");
      if (countError) throw new Error(countError.message);
      if ((count ?? 0) === 0 && booking.status === "incident") {
        const restore = ["secured", "pre_show"].includes(incident.prior_booking_status ?? "") ? incident.prior_booking_status : "pre_show";
        const { error: restoreError } = await supabase.from("bookings").update({ status: restore, updated_at: now }).eq("id", bookingId).eq("status", "incident");
        if (restoreError) throw new Error(restoreError.message);
      }
      return NextResponse.json({ ok: true, incidentStatus: "resolved" });
    }

    if (action === "complete_show") {
      if (!["secured", "pre_show"].includes(booking.status)) return NextResponse.json({ error: "Booking is not ready for completion" }, { status: 409 });
      const { count, error: incidentError } = await supabase.from("incidents").select("id", { count: "exact", head: true }).eq("booking_id", bookingId).eq("status", "open");
      if (incidentError) throw new Error(incidentError.message);
      if ((count ?? 0) > 0) return NextResponse.json({ error: "Resolve open incidents before completing the show" }, { status: 409 });
      const now = new Date().toISOString();
      const { error } = await supabase.from("bookings").update({ status: "completed", completed_at: now, updated_at: now }).eq("id", bookingId).in("status", ["secured", "pre_show"]);
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true, bookingStatus: "completed", completedAt: now });
    }

    return NextResponse.json({ error: "Unknown operations action" }, { status: 400 });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown error";
    console.error("Operations action failed", detail);
    return NextResponse.json({ error: "Operations action failed", detail }, { status: 500 });
  }
}
