import { createClient } from "@supabase/supabase-js";

export type OperationsTaskConfirmation = {
  checklist_item_id: string;
  party: "buyer" | "talent" | "admin" | "system";
  response: "done" | "not_applicable";
  note: string | null;
  advance_revision_no: number;
  updated_at: string;
};

export type OperationsChecklistItem = {
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
  confirmations: OperationsTaskConfirmation[];
};

export type OperationsIncidentEvidence = {
  id: string;
  incident_id: string;
  uploaded_by_party: "buyer" | "talent" | "admin";
  evidence_type: "photo" | "document" | "link";
  provider: "supabase_storage" | "external_url";
  original_filename: string | null;
  external_url: string | null;
  signed_url: string | null;
  created_at: string;
};

export type OperationsIncident = {
  id: string;
  incident_type: string;
  summary: string;
  details: string | null;
  status: "open" | "resolved";
  reported_by_party: "buyer" | "talent" | "admin" | "system";
  report_source: "signed_link" | "admin_portal" | "system";
  occurred_at: string;
  resolved_at: string | null;
  resolution_notes: string | null;
  evidence: OperationsIncidentEvidence[];
};

export type OperationsPostShowConfirmation = {
  id: string;
  booking_id: string;
  party: "buyer" | "talent";
  outcome: "performed_as_agreed" | "performed_with_issue" | "not_performed";
  note: string | null;
  advance_revision_no: number;
  confirmed_at: string;
};

export type TalentSettlement = {
  id: string;
  amount: number;
  currency: string;
  provider: string | null;
  provider_reference: string;
  status: "paid" | "reversed";
  paid_at: string;
  notes: string | null;
};

function getServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) throw new Error("Supabase server environment is not configured");
  return createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function loadOperationsData(bookingId: string | null) {
  if (!bookingId) {
    return {
      checklist: [] as OperationsChecklistItem[],
      incidents: [] as OperationsIncident[],
      postShowConfirmations: [] as OperationsPostShowConfirmation[],
      settlements: [] as TalentSettlement[],
    };
  }

  const supabase = getServerClient();
  const [checklistResult, confirmationResult, incidentsResult, evidenceResult, postShowResult, settlementsResult] = await Promise.all([
    supabase
      .from("pre_show_checklist_items")
      .select("id,checkpoint_code,item_key,label,due_date,status,notes,completed_at,required_parties,advance_revision_no")
      .eq("booking_id", bookingId)
      .order("due_date", { ascending: true })
      .order("item_key", { ascending: true }),
    supabase
      .from("pre_show_task_confirmations")
      .select("checklist_item_id,party,response,note,advance_revision_no,updated_at")
      .eq("booking_id", bookingId)
      .order("updated_at", { ascending: true }),
    supabase
      .from("incidents")
      .select("id,incident_type,summary,details,status,reported_by_party,report_source,occurred_at,resolved_at,resolution_notes")
      .eq("booking_id", bookingId)
      .order("occurred_at", { ascending: false }),
    supabase
      .from("incident_evidence")
      .select("id,incident_id,uploaded_by_party,evidence_type,provider,storage_key,external_url,original_filename,upload_status,created_at")
      .eq("booking_id", bookingId)
      .eq("upload_status", "uploaded")
      .order("created_at", { ascending: true }),
    supabase
      .from("post_show_confirmations")
      .select("id,booking_id,party,outcome,note,advance_revision_no,confirmed_at")
      .eq("booking_id", bookingId)
      .order("confirmed_at", { ascending: true }),
    supabase
      .from("talent_settlements")
      .select("id,amount,currency,provider,provider_reference,status,paid_at,notes")
      .eq("booking_id", bookingId)
      .order("paid_at", { ascending: true }),
  ]);

  if (checklistResult.error) throw new Error(checklistResult.error.message);
  if (confirmationResult.error) throw new Error(confirmationResult.error.message);
  if (incidentsResult.error) throw new Error(incidentsResult.error.message);
  if (evidenceResult.error) throw new Error(evidenceResult.error.message);
  if (postShowResult.error) throw new Error(postShowResult.error.message);
  if (settlementsResult.error) throw new Error(settlementsResult.error.message);

  const confirmations = (confirmationResult.data ?? []) as OperationsTaskConfirmation[];
  const checklist = (checklistResult.data ?? []).map((item) => ({
    ...item,
    confirmations: confirmations.filter(
      (confirmation) =>
        confirmation.checklist_item_id === item.id
        && confirmation.advance_revision_no === item.advance_revision_no,
    ),
  })) as OperationsChecklistItem[];

  const evidence = await Promise.all((evidenceResult.data ?? []).map(async (row) => {
    let signedUrl: string | null = null;
    if (row.provider === "supabase_storage" && row.storage_key) {
      const { data } = await supabase.storage.from("incident-evidence").createSignedUrl(row.storage_key, 3600);
      signedUrl = data?.signedUrl ?? null;
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
      created_at: row.created_at,
    };
  }));

  const incidents = (incidentsResult.data ?? []).map((incident) => ({
    ...incident,
    evidence: evidence.filter((row) => row.incident_id === incident.id),
  })) as OperationsIncident[];

  return {
    checklist,
    incidents,
    postShowConfirmations: (postShowResult.data ?? []) as OperationsPostShowConfirmation[],
    settlements: (settlementsResult.data ?? []) as TalentSettlement[],
  };
}
