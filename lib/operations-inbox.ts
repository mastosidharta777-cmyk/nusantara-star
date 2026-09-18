import { createClient } from "@supabase/supabase-js";

export type OperationsInboxPriority = "urgent" | "action";

export type OperationsInboxItem = {
  key: string;
  code:
    | "OPEN_INCIDENT"
    | "ADVANCE_UNCONFIRMED"
    | "POST_SHOW_CONFIRMATION_MISSING"
    | "SETTLEMENT_DUE";
  priority: OperationsInboxPriority;
  briefId: string;
  bookingId: string;
  talentName: string;
  eventLabel: string;
  eventDate: string | null;
  city: string | null;
  title: string;
  detail: string;
  amount: number | null;
};

type BookingRow = {
  id: string;
  brief_id: string;
  talent_id: string;
  status: string;
  event_date: string | null;
  talent_payable: number | null;
  completed_at: string | null;
};

type BriefRow = {
  id: string;
  event_type: string | null;
  city: string | null;
};

type TalentRow = {
  id: string;
  name: string | null;
};

type AdvanceRow = {
  booking_id: string;
  status: string;
  revision_no: number;
  confirmed_revision_no: number | null;
};

type IncidentRow = {
  id: string;
  booking_id: string;
  status: string;
  summary: string;
};

type PostShowRow = {
  booking_id: string;
  party: "buyer" | "talent";
  outcome: "performed_as_agreed" | "performed_with_issue" | "not_performed";
  advance_revision_no: number;
};

type SettlementRow = {
  booking_id: string;
  amount: number;
  status: "paid" | "reversed";
};

function getServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) throw new Error("Supabase server environment is not configured");
  return createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

function jakartaDateString() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function daysSince(timestamp: string | null) {
  if (!timestamp) return 0;
  const diff = Date.now() - new Date(timestamp).getTime();
  return Math.max(0, Math.floor(diff / 86_400_000));
}

export async function loadOperationsInbox() {
  const supabase = getServerClient();

  const { data: bookingsData, error: bookingsError } = await supabase
    .from("bookings")
    .select("id,brief_id,talent_id,status,event_date,talent_payable,completed_at")
    .in("status", ["secured", "pre_show", "incident", "completed"])
    .order("event_date", { ascending: true });

  if (bookingsError) throw new Error(bookingsError.message);

  const bookings = (bookingsData ?? []) as BookingRow[];
  if (bookings.length === 0) {
    return { items: [] as OperationsInboxItem[], urgentCount: 0, paymentCount: 0 };
  }

  const bookingIds = bookings.map((row) => row.id);
  const briefIds = [...new Set(bookings.map((row) => row.brief_id))];
  const talentIds = [...new Set(bookings.map((row) => row.talent_id))];

  const [
    { data: briefsData, error: briefsError },
    { data: talentsData, error: talentsError },
    { data: advancesData, error: advancesError },
    { data: incidentsData, error: incidentsError },
    { data: postShowData, error: postShowError },
    { data: settlementsData, error: settlementsError },
  ] = await Promise.all([
    supabase.from("briefs").select("id,event_type,city").in("id", briefIds),
    supabase.from("talents").select("id,name").in("id", talentIds),
    supabase
      .from("booking_advances")
      .select("booking_id,status,revision_no,confirmed_revision_no")
      .in("booking_id", bookingIds),
    supabase
      .from("incidents")
      .select("id,booking_id,status,summary")
      .in("booking_id", bookingIds)
      .eq("status", "open"),
    supabase
      .from("post_show_confirmations")
      .select("booking_id,party,outcome,advance_revision_no")
      .in("booking_id", bookingIds),
    supabase
      .from("talent_settlements")
      .select("booking_id,amount,status")
      .in("booking_id", bookingIds),
  ]);

  const firstError = briefsError ?? talentsError ?? advancesError ?? incidentsError ?? postShowError ?? settlementsError;
  if (firstError) throw new Error(firstError.message);

  const briefs = new Map(((briefsData ?? []) as BriefRow[]).map((row) => [row.id, row]));
  const talents = new Map(((talentsData ?? []) as TalentRow[]).map((row) => [row.id, row]));
  const advances = new Map(((advancesData ?? []) as AdvanceRow[]).map((row) => [row.booking_id, row]));
  const incidents = (incidentsData ?? []) as IncidentRow[];
  const postShow = (postShowData ?? []) as PostShowRow[];
  const settlements = (settlementsData ?? []) as SettlementRow[];
  const today = jakartaDateString();
  const items: OperationsInboxItem[] = [];

  for (const booking of bookings) {
    const brief = briefs.get(booking.brief_id);
    const talent = talents.get(booking.talent_id);
    const advance = advances.get(booking.id);
    const talentName = talent?.name?.trim() || "Talent";
    const eventLabel = brief?.event_type?.trim() || "Acara";
    const base = {
      briefId: booking.brief_id,
      bookingId: booking.id,
      talentName,
      eventLabel,
      eventDate: booking.event_date,
      city: brief?.city ?? null,
    };

    const openIncidents = incidents.filter((row) => row.booking_id === booking.id);
    if (openIncidents.length > 0) {
      items.push({
        ...base,
        key: `${booking.id}:OPEN_INCIDENT`,
        code: "OPEN_INCIDENT",
        priority: "urgent",
        title: `${talentName} · incident perlu keputusan`,
        detail:
          openIncidents.length === 1
            ? openIncidents[0].summary
            : `${openIncidents.length} incident masih terbuka`,
        amount: null,
      });
    }

    const advanceConfirmed =
      Boolean(advance) &&
      advance?.status === "confirmed" &&
      advance.confirmed_revision_no === advance.revision_no;

    if (["secured", "pre_show"].includes(booking.status) && !advanceConfirmed) {
      const eventNear = Boolean(booking.event_date && booking.event_date <= today);
      items.push({
        ...base,
        key: `${booking.id}:ADVANCE_UNCONFIRMED`,
        code: "ADVANCE_UNCONFIRMED",
        priority: eventNear ? "urgent" : "action",
        title: `${talentName} · Show Advance belum confirmed`,
        detail: eventNear
          ? "Tanggal acara sudah tiba/lewat. Operasional tidak boleh berjalan dengan revision yang belum dikonfirmasi."
          : "Buyer/EO dan Talent/Manager perlu mengonfirmasi revision Show Advance aktif.",
        amount: null,
      });
    }

    if (
      booking.status === "pre_show" &&
      advanceConfirmed &&
      booking.event_date &&
      booking.event_date < today
    ) {
      const confirmations = postShow.filter(
        (row) =>
          row.booking_id === booking.id &&
          row.advance_revision_no === advance?.revision_no,
      );
      const buyer = confirmations.find((row) => row.party === "buyer");
      const talentConfirmation = confirmations.find((row) => row.party === "talent");
      if (!buyer || !talentConfirmation) {
        const missing = [
          !buyer ? "Buyer/EO" : null,
          !talentConfirmation ? "Talent/Manager" : null,
        ].filter(Boolean).join(" + ");
        items.push({
          ...base,
          key: `${booking.id}:POST_SHOW_CONFIRMATION_MISSING`,
          code: "POST_SHOW_CONFIRMATION_MISSING",
          priority: "urgent",
          title: `${talentName} · konfirmasi post-show belum lengkap`,
          detail: `${missing} belum mengirim hasil pertunjukan.`,
          amount: null,
        });
      }
    }

    if (booking.status === "completed") {
      const paid = settlements
        .filter((row) => row.booking_id === booking.id && row.status === "paid")
        .reduce((sum, row) => sum + Number(row.amount ?? 0), 0);
      const reversed = settlements
        .filter((row) => row.booking_id === booking.id && row.status === "reversed")
        .reduce((sum, row) => sum + Number(row.amount ?? 0), 0);
      const netPaid = Math.max(0, paid - reversed);
      const remaining = Math.max(0, Number(booking.talent_payable ?? 0) - netPaid);

      if (remaining > 0) {
        const overdue = daysSince(booking.completed_at) >= 7;
        items.push({
          ...base,
          key: `${booking.id}:SETTLEMENT_DUE`,
          code: "SETTLEMENT_DUE",
          priority: overdue ? "urgent" : "action",
          title: `${talentName} · settlement belum selesai`,
          detail: overdue
            ? "Show selesai ≥7 hari dan masih ada talent payable yang belum tercatat lunas."
            : "Show sudah completed; masih ada talent payable yang belum tercatat lunas.",
          amount: remaining,
        });
      }
    }
  }

  items.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority === "urgent" ? -1 : 1;
    return (a.eventDate ?? "9999-12-31").localeCompare(b.eventDate ?? "9999-12-31");
  });

  return {
    items,
    urgentCount: items.filter((item) => item.priority === "urgent").length,
    paymentCount: items.filter((item) => item.code === "SETTLEMENT_DUE").length,
  };
}
