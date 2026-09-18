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

export type IncidentEvidence = {
  id: string;
  incident_id: string;
  uploaded_by_party: "buyer" | "talent" | "admin";
  evidence_type: "photo" | "document" | "link";
  provider: "supabase_storage" | "external_url";
  original_filename: string | null;
  external_url: string | null;
  signed_url: string | null;
  upload_status: "pending_upload" | "uploaded";
  created_at: string;
};

export type PostShowConfirmation = {
  id: string;
  party: "buyer" | "talent";
  outcome: "performed_as_agreed" | "performed_with_issue" | "not_performed";
  note: string | null;
  advance_revision_no: number;
  confirmed_at: string;
};

export type OperationalIncident = {
  id: string;
  incident_type: string;
  summary: string;
  details: string | null;
  status: "open" | "resolved";
  reported_by_party: "buyer" | "talent" | "admin" | "system";
  report_source: "signed_link" | "admin_portal" | "system";
  occurred_at: string;
  resolved_at: string | null;
  evidence: IncidentEvidence[];
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
  incidents: OperationalIncident[];
  postShowConfirmation: PostShowConfirmation | null;
  allTasksComplete: boolean;
  checklistPausedByIncident: boolean;
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
  if (!booking || !["pre_show", "incident"].includes(booking.status)) return null;

  const [briefResult, talentResult, advanceResult, taskResult, confirmationResult, incidentResult, evidenceResult, postShowResult] = await Promise.all([
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
    supabase
      .from("incidents")
      .select("id,incident_type,summary,details,status,reported_by_party,report_source,occurred_at,resolved_at")
      .eq("booking_id", booking.id)
      .order("occurred_at", { ascending: false }),
    supabase
      .from("incident_evidence")
      .select("id,incident_id,uploaded_by_party,evidence_type,provider,storage_key,external_url,original_filename,upload_status,created_at")
      .eq("booking_id", booking.id)
      .eq("uploaded_by_party", party)
      .eq("upload_status", "uploaded")
      .order("created_at", { ascending: true }),
    supabase
      .from("post_show_confirmations")
      .select("id,party,outcome,note,advance_revision_no,confirmed_at")
      .eq("booking_id", booking.id)
      .eq("party", party)
      .maybeSingle(),
  ]);

  if (briefResult.error) throw new Error(briefResult.error.message);
  if (talentResult.error) throw new Error(talentResult.error.message);
  if (advanceResult.error) throw new Error(advanceResult.error.message);
  if (taskResult.error) throw new Error(taskResult.error.message);
  if (confirmationResult.error) throw new Error(confirmationResult.error.message);
  if (incidentResult.error) throw new Error(incidentResult.error.message);
  if (evidenceResult.error) throw new Error(evidenceResult.error.message);
  if (postShowResult.error) throw new Error(postShowResult.error.message);

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

  const evidenceRows = await Promise.all((evidenceResult.data ?? []).map(async (row) => {
    let signedUrl: string | null = null;
    if (row.provider === "supabase_storage" && row.storage_key) {
      const { data: signed } = await supabase.storage.from("incident-evidence").createSignedUrl(row.storage_key, 3600);
      signedUrl = signed?.signedUrl ?? null;
    }
    return {
      id: row.id,
      incident_id: row.incident_id,
      uploaded_by_party: row.uploaded_by_party,
      evidence_type: row.evidence_type,
      provider: row.provider,
      original_filename: row.original_filename,
      external_url: row.external_url,
      signed_url: signedUrl,
      upload_status: row.upload_status,
      created_at: row.created_at,
    } as IncidentEvidence;
  }));

  const incidents = (incidentResult.data ?? []).map((row) => {
    const ownReport = row.reported_by_party === party;
    return {
      ...row,
      summary: ownReport ? row.summary : "Ada laporan kejadian dari pihak lain yang sedang ditinjau Nusantara Star.",
      details: ownReport ? row.details : null,
      evidence: ownReport ? evidenceRows.filter((evidence) => evidence.incident_id === row.id) : [],
    };
  }) as OperationalIncident[];

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
    incidents,
    postShowConfirmation:
      postShowResult.data && postShowResult.data.advance_revision_no === advance.revision_no
        ? (postShowResult.data as PostShowConfirmation)
        : null,
    allTasksComplete: tasks.length > 0 && tasks.every((task) => task.status !== "pending" && task.advance_revision_no === advance.revision_no),
    checklistPausedByIncident: booking.status === "incident",
  };
}
