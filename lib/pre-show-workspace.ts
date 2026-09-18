import { createClient } from "@supabase/supabase-js";

export type PreShowParty = "buyer" | "talent";
export type PreShowResponse = "done" | "not_applicable";

export type PreShowConfirmation = {
  checklist_item_id: string;
  party: "buyer" | "talent" | "admin" | "system";
  response: PreShowResponse;
  note: string | null;
  advance_revision_no: number;
  updated_at: string;
};

export type PreShowTask = {
  id: string;
  checkpoint_code: "H-14" | "H-7" | "H-3" | "H-1";
  item_key: string;
  label: string;
  due_date: string;
  status: "pending" | "done" | "not_applicable";
  notes: string | null;
  completed_at: string | null;
  required_parties: Array<"buyer" | "talent" | "admin" | "system">;
  advance_revision_no: number | null;
  confirmations: PreShowConfirmation[];
};

export type PreShowWorkspace = {
  booking: {
    id: string;
    status: string;
    event_date: string;
    city: string | null;
    venue: string | null;
  };
  event: {
    event_type: string | null;
    talent_name: string;
  };
  advance: {
    revision_no: number;
    event_timezone: string;
    venue_name: string | null;
    venue_address: string | null;
    call_at_local: string | null;
    soundcheck_at_local: string | null;
    show_start_at_local: string | null;
    show_end_at_local: string | null;
    onsite_pic_name: string | null;
    onsite_pic_phone: string | null;
    technical_pic_name: string | null;
    technical_pic_phone: string | null;
    talent_pic_name: string | null;
    talent_pic_phone: string | null;
    personnel_count: number | null;
    lineup_notes: string | null;
  };
  tasks: PreShowTask[];
  partyTasks: PreShowTask[];
  allTasksComplete: boolean;
};

function getServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) throw new Error("Supabase server environment is not configured");
  return createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function loadPreShowWorkspace(bookingId: string, party: PreShowParty): Promise<PreShowWorkspace | null> {
  const supabase = getServerClient();

  const { data: booking, error: bookingError } = await supabase
    .from("bookings")
    .select("id,brief_id,talent_id,status,event_date,city,venue")
    .eq("id", bookingId)
    .maybeSingle();
  if (bookingError) throw new Error(bookingError.message);
  if (!booking || booking.status !== "pre_show") return null;

  const [briefResult, talentResult, advanceResult, taskResult, confirmationResult] = await Promise.all([
    supabase.from("briefs").select("event_type").eq("id", booking.brief_id).maybeSingle(),
    supabase.from("talents").select("name").eq("id", booking.talent_id).maybeSingle(),
    supabase
      .from("booking_advances")
      .select("revision_no,status,confirmed_revision_no,confirmed_at,event_timezone,venue_name,venue_address,call_at_local,soundcheck_at_local,show_start_at_local,show_end_at_local,onsite_pic_name,onsite_pic_phone,technical_pic_name,technical_pic_phone,talent_pic_name,talent_pic_phone,personnel_count,lineup_notes")
      .eq("booking_id", booking.id)
      .maybeSingle(),
    supabase
      .from("pre_show_checklist_items")
      .select("id,checkpoint_code,item_key,label,due_date,status,notes,completed_at,required_parties,advance_revision_no")
      .eq("booking_id", booking.id)
      .order("due_date", { ascending: true })
      .order("item_key", { ascending: true }),
    supabase
      .from("pre_show_task_confirmations")
      .select("checklist_item_id,party,response,note,advance_revision_no,updated_at")
      .eq("booking_id", booking.id)
      .order("updated_at", { ascending: true }),
  ]);

  if (briefResult.error) throw new Error(briefResult.error.message);
  if (talentResult.error) throw new Error(talentResult.error.message);
  if (advanceResult.error) throw new Error(advanceResult.error.message);
  if (taskResult.error) throw new Error(taskResult.error.message);
  if (confirmationResult.error) throw new Error(confirmationResult.error.message);

  const advance = advanceResult.data;
  if (
    !advance
    || advance.status !== "confirmed"
    || advance.confirmed_revision_no !== advance.revision_no
    || !advance.confirmed_at
  ) return null;

  const confirmations = (confirmationResult.data ?? []) as PreShowConfirmation[];
  const tasks = (taskResult.data ?? []).map((row) => {
    const currentConfirmations = confirmations.filter(
      (confirmation) =>
        confirmation.checklist_item_id === row.id
        && confirmation.advance_revision_no === row.advance_revision_no,
    );
    return { ...row, confirmations: currentConfirmations } as PreShowTask;
  });

  return {
    booking: {
      id: booking.id,
      status: booking.status,
      event_date: booking.event_date,
      city: booking.city,
      venue: booking.venue,
    },
    event: {
      event_type: briefResult.data?.event_type ?? null,
      talent_name: talentResult.data?.name ?? "Talent",
    },
    advance: {
      revision_no: advance.revision_no,
      event_timezone: advance.event_timezone,
      venue_name: advance.venue_name,
      venue_address: advance.venue_address,
      call_at_local: advance.call_at_local,
      soundcheck_at_local: advance.soundcheck_at_local,
      show_start_at_local: advance.show_start_at_local,
      show_end_at_local: advance.show_end_at_local,
      onsite_pic_name: advance.onsite_pic_name,
      onsite_pic_phone: advance.onsite_pic_phone,
      technical_pic_name: advance.technical_pic_name,
      technical_pic_phone: advance.technical_pic_phone,
      talent_pic_name: advance.talent_pic_name,
      talent_pic_phone: advance.talent_pic_phone,
      personnel_count: advance.personnel_count,
      lineup_notes: advance.lineup_notes,
    },
    tasks,
    partyTasks: tasks.filter((task) => task.required_parties.includes(party)),
    allTasksComplete: tasks.length > 0 && tasks.every((task) => task.status !== "pending" && task.advance_revision_no === advance.revision_no),
  };
}
