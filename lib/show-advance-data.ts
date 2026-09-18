import { createClient } from "@supabase/supabase-js";

export type BookingAdvance = {
  booking_id: string;
  revision_no: number;
  status: "draft" | "confirmed";
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
  buyer_submission: Record<string, unknown> | null;
  talent_submission: Record<string, unknown> | null;
  buyer_submitted_at: string | null;
  talent_submitted_at: string | null;
  admin_reviewed_revision_no: number | null;
  admin_reviewed_at: string | null;
  buyer_confirmation_reference: string | null;
  talent_confirmation_reference: string | null;
  buyer_confirmed_at: string | null;
  talent_confirmed_at: string | null;
  confirmed_revision_no: number | null;
  confirmed_at: string | null;
  updated_at: string;
};

export type ApprovedRider = {
  id: string;
  version_no: number;
  source_filename: string | null;
  admin_approved_at: string | null;
  updated_at: string;
};

export type AdvanceConfirmation = {
  id: string;
  revision_no: number;
  buyer_confirmation_reference: string;
  talent_confirmation_reference: string;
  confirmed_at: string;
};

export type ShowAdvanceData = {
  advance: BookingAdvance | null;
  defaults: {
    eventDate: string;
    city: string | null;
    venueName: string | null;
    buyerPicName: string | null;
    buyerPicPhone: string | null;
    talentPicName: string | null;
    talentPicPhone: string | null;
    performanceDurationMinutes: number | null;
  };
  approvedRiders: ApprovedRider[];
  confirmations: AdvanceConfirmation[];
};

function getServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) throw new Error("Supabase server environment is not configured");
  return createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function loadShowAdvanceData(bookingId: string | null): Promise<ShowAdvanceData | null> {
  if (!bookingId) return null;
  const supabase = getServerClient();

  const { data: booking, error: bookingError } = await supabase
    .from("bookings")
    .select("id,brief_id,talent_id,event_date,venue,city")
    .eq("id", bookingId)
    .maybeSingle();
  if (bookingError) throw new Error(bookingError.message);
  if (!booking) return null;

  const [advanceResult, briefResult, talentResult, riderResult, confirmationResult] = await Promise.all([
    supabase
      .from("booking_advances")
      .select("booking_id,revision_no,status,event_timezone,venue_name,venue_address,load_in_at_local,call_at_local,soundcheck_at_local,show_start_at_local,show_end_at_local,performance_duration_minutes,buyer_pic_name,buyer_pic_phone,onsite_pic_name,onsite_pic_phone,technical_pic_name,technical_pic_phone,talent_pic_name,talent_pic_phone,personnel_count,lineup_notes,transport_notes,accommodation_notes,hospitality_notes,technical_notes,backline_notes,talent_operational_notes,access_loading_notes,parking_notes,rider_version_id,buyer_submission,talent_submission,buyer_submitted_at,talent_submitted_at,admin_reviewed_revision_no,admin_reviewed_at,buyer_confirmation_reference,talent_confirmation_reference,buyer_confirmed_at,talent_confirmed_at,confirmed_revision_no,confirmed_at,updated_at")
      .eq("booking_id", bookingId)
      .maybeSingle(),
    supabase
      .from("briefs")
      .select("buyer_name,buyer_whatsapp,performance_duration_minutes")
      .eq("id", booking.brief_id)
      .maybeSingle(),
    supabase
      .from("talents")
      .select("manager_name,manager_whatsapp,show_duration_minutes")
      .eq("id", booking.talent_id)
      .maybeSingle(),
    supabase
      .from("talent_rider_versions")
      .select("id,version_no,source_filename,admin_approved_at,updated_at")
      .eq("talent_id", booking.talent_id)
      .eq("status", "admin_approved")
      .order("version_no", { ascending: false }),
    supabase
      .from("booking_advance_confirmations")
      .select("id,revision_no,buyer_confirmation_reference,talent_confirmation_reference,confirmed_at")
      .eq("booking_id", bookingId)
      .order("revision_no", { ascending: false })
      .limit(5),
  ]);

  if (advanceResult.error) throw new Error(advanceResult.error.message);
  if (briefResult.error) throw new Error(briefResult.error.message);
  if (talentResult.error) throw new Error(talentResult.error.message);
  if (riderResult.error) throw new Error(riderResult.error.message);
  if (confirmationResult.error) throw new Error(confirmationResult.error.message);

  const brief = briefResult.data;
  const talent = talentResult.data;

  return {
    advance: (advanceResult.data ?? null) as BookingAdvance | null,
    defaults: {
      eventDate: booking.event_date,
      city: booking.city,
      venueName: booking.venue,
      buyerPicName: brief?.buyer_name ?? null,
      buyerPicPhone: brief?.buyer_whatsapp ?? null,
      talentPicName: talent?.manager_name ?? null,
      talentPicPhone: talent?.manager_whatsapp ?? null,
      performanceDurationMinutes: brief?.performance_duration_minutes ?? talent?.show_duration_minutes ?? null,
    },
    approvedRiders: (riderResult.data ?? []) as ApprovedRider[],
    confirmations: (confirmationResult.data ?? []) as AdvanceConfirmation[],
  };
}

export function showAdvanceIsCurrentAndConfirmed(data: ShowAdvanceData | null) {
  const advance = data?.advance;
  return Boolean(
    advance
      && advance.status === "confirmed"
      && advance.confirmed_revision_no === advance.revision_no
      && advance.confirmed_at
      && advance.buyer_confirmed_at
      && advance.talent_confirmed_at,
  );
}
