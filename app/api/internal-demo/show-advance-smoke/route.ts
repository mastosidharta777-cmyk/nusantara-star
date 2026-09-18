import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import { POST as bookingAction } from "@/app/api/internal-demo/admin/booking/route";
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
    const now = new Date().toISOString();
    const quoteValidUntil = new Date(Date.now() + 7 * 86400000).toISOString();

    const { data: talent, error: talentError } = await supabase
      .from("talents")
      .insert({
        name: `Advance Smoke ${stamp}`,
        category: "singer",
        genres: ["pop"],
        base_city: "Jakarta",
        service_cities: ["Jakarta"],
        performance_formats: ["solo"],
        event_types: ["corporate"],
        audience_tags: ["corporate"],
        budget_min: 1000000,
        budget_max: 1500000,
        status: "verified",
        public_visible: false,
      })
      .select("id")
      .single();
    if (talentError || !talent) throw new Error(talentError?.message ?? "Talent seed failed");
    talentId = talent.id;

    const eventDate = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
    const { data: brief, error: briefError } = await supabase
      .from("briefs")
      .insert({
        event_type: "corporate",
        event_date: eventDate,
        city: "Jakarta",
        venue: "Smoke Hall",
        talent_category: "singer",
        buyer_name: "Buyer Smoke",
        buyer_whatsapp: "081200000001",
        performance_duration_minutes: 60,
        status: "buyer_selected",
      })
      .select("id")
      .single();
    if (briefError || !brief) throw new Error(briefError?.message ?? "Brief seed failed");
    briefId = brief.id;

    const { data: requestRow, error: requestError } = await supabase
      .from("availability_requests")
      .insert({ brief_id: briefId, talent_id: talentId, status: "confirmed", responded_at: now })
      .select("id")
      .single();
    if (requestError || !requestRow) throw new Error(requestError?.message ?? "Availability request seed failed");

    const { data: offer, error: offerError } = await supabase
      .from("talent_offers")
      .insert({
        availability_request_id: requestRow.id,
        brief_id: briefId,
        talent_id: talentId,
        status: "confirmed",
        availability_status: "confirmed",
        event_fee: 1000000,
        currency: "IDR",
        quote_valid_until: quoteValidUntil,
        confirmation_source: "manager_portal",
        confirmed_at: now,
      })
      .select("id")
      .single();
    if (offerError || !offer) throw new Error(offerError?.message ?? "Offer seed failed");

    const { data: proposal, error: proposalError } = await supabase
      .from("proposals")
      .insert({ brief_id: briefId, version: 1, status: "selected", expires_at: quoteValidUntil, sent_at: now })
      .select("id")
      .single();
    if (proposalError || !proposal) throw new Error(proposalError?.message ?? "Proposal seed failed");

    const { data: item, error: itemError } = await supabase
      .from("proposal_items")
      .insert({
        proposal_id: proposal.id,
        brief_id: briefId,
        talent_id: talentId,
        talent_offer_id: offer.id,
        buyer_price: 1200000,
        currency: "IDR",
        availability_status: "confirmed",
        offer_valid_until: quoteValidUntil,
        talent_name_snapshot: `Advance Smoke ${stamp}`,
        talent_category_snapshot: "singer",
        talent_base_city_snapshot: "Jakarta",
        talent_genres_snapshot: ["pop"],
      })
      .select("id")
      .single();
    if (itemError || !item) throw new Error(itemError?.message ?? "Proposal item seed failed");

    const { error: selectionError } = await supabase
      .from("buyer_selections")
      .insert({ brief_id: briefId, talent_id: talentId, status: "selected" });
    if (selectionError) throw new Error(selectionError.message);

    const buyerSchedule = [
      { milestone_type: "full_payment", sequence_no: 1, calculation_type: "remaining_balance", percentage: null, amount: null, due_basis: "booking_date", due_offset_days: 0, custom_due_date: null },
    ];
    const talentSchedule = [
      { milestone_type: "full_payment", sequence_no: 1, calculation_type: "remaining_balance", percentage: null, amount: null, due_basis: "event_date", due_offset_days: 0, custom_due_date: null },
    ];

    const { data: deal, error: dealError } = await supabase
      .from("deals")
      .insert({
        brief_id: briefId,
        proposal_id: proposal.id,
        proposal_item_id: item.id,
        talent_offer_id: offer.id,
        talent_id: talentId,
        status: "locked",
        buyer_price: 1200000,
        talent_payable: 1000000,
        direct_costs: 0,
        taxes_and_payment_fees: 0,
        contribution: 200000,
        buyer_payment_schedule: buyerSchedule,
        talent_payment_schedule: talentSchedule,
        booking_reference_date: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
        funding_gap_amount: 0,
        funding_gap_status: "safe",
        talent_terms_status: "confirmed",
        buyer_terms_status: "recommended",
        cancellation_terms: "Smoke cancellation terms",
        unresolved_issues: [],
        exception_status: "none",
        locked_at: now,
      })
      .select("id")
      .single();
    if (dealError || !deal) throw new Error(dealError?.message ?? "Deal seed failed");

    const createBooking = await post(bookingAction, { briefId, action: "create_booking" });
    if (!createBooking.response.ok || createBooking.json?.status !== "pending_security") {
      throw new Error(`Booking creation failed: ${JSON.stringify(createBooking.json)}`);
    }
    bookingId = String(createBooking.json.bookingId);

    const accept = await supabase.rpc("ns_accept_buyer_terms_v1", { p_booking_id: bookingId });
    if (accept.error) throw new Error(`Buyer terms acceptance failed: ${accept.error.message}`);

    const security = await post(bookingAction, {
      briefId,
      action: "set_security",
      securityType: "approved_po_credit",
      reference: `SHOW-ADVANCE-SMOKE-PO-${stamp}`,
    });
    if (!security.response.ok) throw new Error(`Booking security seed failed: ${JSON.stringify(security.json)}`);

    const secure = await post(bookingAction, { briefId, action: "secure_booking" });
    if (!secure.response.ok || secure.json?.bookingStatus !== "secured") {
      throw new Error(`Secure booking seed failed: ${JSON.stringify(secure.json)}`);
    }

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
