import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import { POST as showAdvanceAction } from "@/app/api/internal-demo/admin/show-advance/route";
import { POST as operationsAction } from "@/app/api/internal-demo/admin/operations/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) throw new Error("Supabase server environment is not configured");
  return createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

type Handler = (request: Request) => Promise<Response>;

async function post(handler: Handler, body: Record<string, unknown>, admin = false) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (admin) headers["x-ns-admin-verified"] = "1";
  const response = await handler(new Request("http://internal", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  }));
  const json = await response.json().catch(() => null);
  return { response, json };
}

export async function GET() {
  if (process.env.VERCEL_ENV === "production") return NextResponse.json({ error: "Not found" }, { status: 404 });

  const supabase = getServerClient();
  const stamp = Date.now();
  let talentId = "";
  let briefId = "";
  let bookingId = "";

  try {
    const { data: talent, error: talentError } = await supabase
      .from("talents")
      .insert({ name: `Advance Smoke ${stamp}`, category: "singer", status: "curated" })
      .select("id")
      .single();
    if (talentError || !talent) throw new Error(talentError?.message ?? "Talent seed failed");
    talentId = talent.id;

    const eventDate = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
    const { data: brief, error: briefError } = await supabase
      .from("briefs")
      .insert({
        event_type: "Show Advance Smoke",
        event_date: eventDate,
        city: "Jakarta",
        venue: "Smoke Hall",
        talent_category: "singer",
        buyer_name: "Buyer Smoke",
        buyer_whatsapp: "081200000001",
        performance_duration_minutes: 60,
        status: "booked",
      })
      .select("id")
      .single();
    if (briefError || !brief) throw new Error(briefError?.message ?? "Brief seed failed");
    briefId = brief.id;

    const { data: booking, error: bookingError } = await supabase
      .from("bookings")
      .insert({
        brief_id: briefId,
        talent_id: talentId,
        event_date: eventDate,
        venue: "Smoke Hall",
        city: "Jakarta",
        buyer_price: 1200000,
        talent_payable: 1000000,
        status: "secured",
        financial_security_status: "satisfied",
        financial_security_type: "approved_po_credit",
        financial_security_reference: "SMOKE-PO",
        secured_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (bookingError || !booking) throw new Error(bookingError?.message ?? "Booking seed failed");
    bookingId = booking.id;

    const blockedPreShow = await post(operationsAction, { bookingId, action: "initialize_pre_show" });
    if (blockedPreShow.response.ok || blockedPreShow.response.status !== 409) {
      throw new Error(`Pre-show gate failed: ${JSON.stringify(blockedPreShow.json)}`);
    }

    const save1 = await post(showAdvanceAction, {
      bookingId,
      action: "save",
      payload: {
        event_timezone: "Asia/Jakarta",
        venue_name: "Smoke Hall",
        venue_address: "Jl. Smoke Test No. 1, Jakarta",
        load_in_at_local: `${eventDate}T15:00`,
        call_at_local: `${eventDate}T16:00`,
        soundcheck_at_local: `${eventDate}T17:00`,
        show_start_at_local: `${eventDate}T20:00`,
        show_end_at_local: `${eventDate}T21:00`,
        performance_duration_minutes: 60,
        buyer_pic_name: "Buyer Smoke",
        buyer_pic_phone: "081200000001",
        onsite_pic_name: "Onsite Smoke",
        onsite_pic_phone: "081200000002",
        talent_pic_name: "Manager Smoke",
        talent_pic_phone: "081200000003",
        personnel_count: 4,
        lineup_notes: "Vocal, guitar, bass, drums",
        technical_notes: "PA and four monitor mixes",
        transport_notes: "Self transport",
      },
    }, true);
    if (!save1.response.ok || Number(save1.json?.advance?.revision_no ?? 0) !== 1) {
      throw new Error(`Advance save failed: ${JSON.stringify(save1.json)}`);
    }

    const confirm1 = await post(showAdvanceAction, {
      bookingId,
      action: "confirm",
      buyerConfirmationReference: "WA buyer smoke",
      talentConfirmationReference: "WA manager smoke",
    }, true);
    if (!confirm1.response.ok || confirm1.json?.status !== "confirmed") {
      throw new Error(`Advance confirm failed: ${JSON.stringify(confirm1.json)}`);
    }

    const preShow = await post(operationsAction, { bookingId, action: "initialize_pre_show" });
    if (!preShow.response.ok || preShow.json?.status !== "pre_show" || Number(preShow.json?.checklistCount ?? 0) !== 8) {
      throw new Error(`Pre-show start failed: ${JSON.stringify(preShow.json)}`);
    }

    const save2 = await post(showAdvanceAction, {
      bookingId,
      action: "save",
      payload: {
        event_timezone: "Asia/Jakarta",
        venue_name: "Smoke Hall",
        venue_address: "Jl. Smoke Test No. 1, Jakarta",
        load_in_at_local: `${eventDate}T15:00`,
        call_at_local: `${eventDate}T16:30`,
        soundcheck_at_local: `${eventDate}T17:00`,
        show_start_at_local: `${eventDate}T20:00`,
        show_end_at_local: `${eventDate}T21:00`,
        performance_duration_minutes: 60,
        buyer_pic_name: "Buyer Smoke",
        buyer_pic_phone: "081200000001",
        onsite_pic_name: "Onsite Smoke",
        onsite_pic_phone: "081200000002",
        talent_pic_name: "Manager Smoke",
        talent_pic_phone: "081200000003",
        personnel_count: 4,
        lineup_notes: "Vocal, guitar, bass, drums",
        technical_notes: "PA and four monitor mixes",
        transport_notes: "Self transport",
      },
    }, true);
    if (!save2.response.ok || Number(save2.json?.advance?.revision_no ?? 0) !== 2) {
      throw new Error(`Advance revision save failed: ${JSON.stringify(save2.json)}`);
    }

    const { data: checklistItem, error: checklistError } = await supabase
      .from("pre_show_checklist_items")
      .select("id")
      .eq("booking_id", bookingId)
      .order("due_date")
      .limit(1)
      .single();
    if (checklistError || !checklistItem) throw new Error(checklistError?.message ?? "Checklist lookup failed");

    const blockedChecklist = await post(operationsAction, {
      bookingId,
      action: "set_checklist_status",
      itemId: checklistItem.id,
      status: "done",
    });
    if (blockedChecklist.response.ok || blockedChecklist.response.status !== 409) {
      throw new Error(`Revision reconfirmation gate failed: ${JSON.stringify(blockedChecklist.json)}`);
    }

    const confirm2 = await post(showAdvanceAction, {
      bookingId,
      action: "confirm",
      buyerConfirmationReference: "WA buyer smoke revision 2",
      talentConfirmationReference: "WA manager smoke revision 2",
    }, true);
    if (!confirm2.response.ok || confirm2.json?.status !== "confirmed" || Number(confirm2.json?.revisionNo ?? 0) !== 2) {
      throw new Error(`Revision reconfirm failed: ${JSON.stringify(confirm2.json)}`);
    }

    const checklistDone = await post(operationsAction, {
      bookingId,
      action: "set_checklist_status",
      itemId: checklistItem.id,
      status: "done",
    });
    if (!checklistDone.response.ok || checklistDone.json?.status !== "done") {
      throw new Error(`Checklist update failed: ${JSON.stringify(checklistDone.json)}`);
    }

    const completed = await post(operationsAction, { bookingId, action: "complete_show" });
    if (!completed.response.ok || completed.json?.bookingStatus !== "completed") {
      throw new Error(`Show completion failed: ${JSON.stringify(completed.json)}`);
    }

    const { count: confirmationCount, error: confirmationError } = await supabase
      .from("booking_advance_confirmations")
      .select("id", { count: "exact", head: true })
      .eq("booking_id", bookingId);
    if (confirmationError) throw new Error(confirmationError.message);
    if (confirmationCount !== 2) throw new Error(`Expected 2 advance confirmations, got ${confirmationCount}`);

    return NextResponse.json({
      ok: true,
      checks: {
        preShowBlockedBeforeAdvance: true,
        revision1Confirmed: true,
        preShowChecklistGenerated: 8,
        revision2InvalidatedOldConfirmation: true,
        checklistBlockedUntilReconfirm: true,
        revision2Confirmed: true,
        showCompleted: true,
        confirmationHistory: confirmationCount,
      },
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  } finally {
    if (bookingId) await supabase.from("bookings").delete().eq("id", bookingId);
    if (briefId) await supabase.from("briefs").delete().eq("id", briefId);
    if (talentId) await supabase.from("talents").delete().eq("id", talentId);
  }
}
