import { createClient } from "@supabase/supabase-js";

export type AdvanceParty = "buyer" | "talent";

export type CollaborativeAdvance = {
  booking: {
    id: string;
    status: string;
    event_date: string;
    city: string | null;
  };
  event: {
    event_type: string | null;
    talent_name: string;
  };
  advance: {
    revision_no: number;
    status: string;
    event_timezone: string;
    venue_name: string | null;
    venue_address: string | null;
    load_in_at_local: string | null;
    call_at_local: string | null;
    soundcheck_at_local: string | null;
    show_start_at_local: string | null;
    show_end_at_local: string | null;
    performance_duration_minutes: number | null;
    buyer_pic_name: string | null;
    buyer_pic_phone: string | null;
    onsite_pic_name: string | null;
    onsite_pic_phone: string | null;
    technical_pic_name: string | null;
    technical_pic_phone: string | null;
    talent_pic_name: string | null;
    talent_pic_phone: string | null;
    personnel_count: number | null;
    lineup_notes: string | null;
    transport_notes: string | null;
    accommodation_notes: string | null;
    hospitality_notes: string | null;
    technical_notes: string | null;
    backline_notes: string | null;
    talent_operational_notes: string | null;
    access_loading_notes: string | null;
    parking_notes: string | null;
    rider_version_id: string | null;
    buyer_submitted_at: string | null;
    talent_submitted_at: string | null;
    admin_reviewed_revision_no: number | null;
    admin_reviewed_at: string | null;
    buyer_confirmed_at: string | null;
    talent_confirmed_at: string | null;
    confirmed_revision_no: number | null;
    confirmed_at: string | null;
  } | null;
  defaults: {
    event_timezone: string;
    venue_name: string;
    buyer_pic_name: string;
    buyer_pic_phone: string;
    talent_pic_name: string;
    talent_pic_phone: string;
    performance_duration_minutes: number | null;
  };
  approvedRiders: Array<{
    id: string;
    version_no: number;
    source_filename: string | null;
  }>;
  reviewed: boolean;
  partySubmitted: boolean;
  partyConfirmed: boolean;
  fullyConfirmed: boolean;
};

function getServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) throw new Error("Supabase server environment is not configured");
  return createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function loadCollaborativeShowAdvance(bookingId: string, party: AdvanceParty): Promise<CollaborativeAdvance | null> {
  const supabase = getServerClient();

  const { data: booking, error: bookingError } = await supabase
    .from("bookings")
    .select("id,brief_id,talent_id,status,event_date,venue,city")
    .eq("id", bookingId)
    .maybeSingle();
  if (bookingError) throw new Error(bookingError.message);
  if (!booking || !["secured", "pre_show"].includes(booking.status)) return null;

  const [briefResult, talentResult, advanceResult, riderResult] = await Promise.all([
    supabase
      .from("briefs")
      .select("event_type,buyer_name,buyer_whatsapp,performance_duration_minutes")
      .eq("id", booking.brief_id)
      .maybeSingle(),
    supabase
      .from("talents")
      .select("name,manager_name,manager_whatsapp,show_duration_minutes")
      .eq("id", booking.talent_id)
      .maybeSingle(),
    supabase
      .from("booking_advances")
      .select("revision_no,status,event_timezone,venue_name,venue_address,load_in_at_local,call_at_local,soundcheck_at_local,show_start_at_local,show_end_at_local,performance_duration_minutes,buyer_pic_name,buyer_pic_phone,onsite_pic_name,onsite_pic_phone,technical_pic_name,technical_pic_phone,talent_pic_name,talent_pic_phone,personnel_count,lineup_notes,transport_notes,accommodation_notes,hospitality_notes,technical_notes,backline_notes,talent_operational_notes,access_loading_notes,parking_notes,rider_version_id,buyer_submitted_at,talent_submitted_at,admin_reviewed_revision_no,admin_reviewed_at,buyer_confirmed_at,talent_confirmed_at,confirmed_revision_no,confirmed_at")
      .eq("booking_id", booking.id)
      .maybeSingle(),
    supabase
      .from("talent_rider_versions")
      .select("id,version_no,source_filename")
      .eq("talent_id", booking.talent_id)
      .eq("status", "admin_approved")
      .order("version_no", { ascending: false }),
  ]);

  if (briefResult.error) throw new Error(briefResult.error.message);
  if (talentResult.error) throw new Error(talentResult.error.message);
  if (advanceResult.error) throw new Error(advanceResult.error.message);
  if (riderResult.error) throw new Error(riderResult.error.message);
  if (!talentResult.data) return null;

  const advance = advanceResult.data as CollaborativeAdvance["advance"];
  const reviewed = Boolean(advance && advance.admin_reviewed_revision_no === advance.revision_no && advance.admin_reviewed_at);
  const partySubmitted = party === "buyer" ? Boolean(advance?.buyer_submitted_at) : Boolean(advance?.talent_submitted_at);
  const partyConfirmed = party === "buyer" ? Boolean(advance?.buyer_confirmed_at) : Boolean(advance?.talent_confirmed_at);
  const fullyConfirmed = Boolean(
    advance
      && advance.status === "confirmed"
      && advance.confirmed_revision_no === advance.revision_no
      && advance.buyer_confirmed_at
      && advance.talent_confirmed_at,
  );

  return {
    booking: {
      id: booking.id,
      status: booking.status,
      event_date: booking.event_date,
      city: booking.city,
    },
    event: {
      event_type: briefResult.data?.event_type ?? null,
      talent_name: talentResult.data.name,
    },
    advance,
    defaults: {
      event_timezone: advance?.event_timezone ?? "Asia/Jakarta",
      venue_name: advance?.venue_name ?? booking.venue ?? "",
      buyer_pic_name: advance?.buyer_pic_name ?? briefResult.data?.buyer_name ?? "",
      buyer_pic_phone: advance?.buyer_pic_phone ?? briefResult.data?.buyer_whatsapp ?? "",
      talent_pic_name: advance?.talent_pic_name ?? talentResult.data.manager_name ?? "",
      talent_pic_phone: advance?.talent_pic_phone ?? talentResult.data.manager_whatsapp ?? "",
      performance_duration_minutes: advance?.performance_duration_minutes ?? briefResult.data?.performance_duration_minutes ?? talentResult.data.show_duration_minutes ?? null,
    },
    approvedRiders: (riderResult.data ?? []) as CollaborativeAdvance["approvedRiders"],
    reviewed,
    partySubmitted,
    partyConfirmed,
    fullyConfirmed,
  };
}
