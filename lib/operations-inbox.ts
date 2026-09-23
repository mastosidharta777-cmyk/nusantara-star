import { createClient } from "@supabase/supabase-js";

export type OperationsInboxPriority = "urgent" | "action";

export type OperationsFollowUp = {
  party: "buyer" | "talent" | "supply";
  label: string;
  phone: string | null;
  scope: "buyer_advance" | "talent_advance" | "buyer_pre_show" | "talent_pre_show" | "talent_offer" | "talent_onboarding";
  messageKind: "advance" | "post_show" | "availability" | "onboarding";
};

export type OperationsInboxItem = {
  key: string;
  code:
    | "NEW_BRIEF_UNREVIEWED"
    | "SUPPLY_INTEREST_UNREVIEWED"
    | "AVAILABILITY_RESPONSE_OVERDUE"
    | "ONBOARDING_NOT_STARTED"
    | "OPEN_INCIDENT"
    | "ADVANCE_UNCONFIRMED"
    | "POST_SHOW_CONFIRMATION_MISSING"
    | "SETTLEMENT_DUE";
  priority: OperationsInboxPriority;
  briefId: string | null;
  bookingId: string | null;
  followUpSubjectId?: string | null;
  talentName: string;
  eventLabel: string;
  eventDate: string | null;
  city: string | null;
  title: string;
  detail: string;
  amount: number | null;
  followUps: OperationsFollowUp[];
  reviewHref?: string;
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

type NewBriefRow = {
  id: string;
  event_type: string | null;
  event_date: string | null;
  city: string | null;
  request_mode: "discovery" | "direct_talent";
  created_at: string;
};

type PendingAvailabilityRow = {
  id: string;
  brief_id: string;
  talent_id: string;
  requested_at: string;
};

type PendingAvailabilityBrief = {
  id: string;
  event_type: string | null;
  event_date: string | null;
  city: string | null;
};

type PendingAvailabilityTalent = {
  id: string;
  name: string | null;
  manager_whatsapp: string | null;
};

type PendingOnboardingRow = {
  id: string;
  name: string | null;
  supply_type: "talent" | "professional" | "production_partner";
  manager_whatsapp: string | null;
  created_at: string;
};

type NewSupplyInterestRow = {
  id: string;
  applicant_name: string | null;
  supply_type: "talent" | "professional" | "production_partner";
  created_at: string;
};

type BriefRow = {
  id: string;
  event_type: string | null;
  city: string | null;
  buyer_whatsapp: string | null;
};

type TalentRow = {
  id: string;
  name: string | null;
  manager_whatsapp: string | null;
};

type AdvanceRow = {
  booking_id: string;
  status: string;
  revision_no: number;
  confirmed_revision_no: number | null;
  buyer_confirmed_at: string | null;
  talent_confirmed_at: string | null;
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

function hoursSince(timestamp: string) {
  const diff = Date.now() - new Date(timestamp).getTime();
  return Math.max(0, Math.floor(diff / 3_600_000));
}

function daysBetween(from: string, to: string) {
  const parse = (value: string) => {
    const [year, month, day] = value.split("-").map(Number);
    return Date.UTC(year, month - 1, day);
  };
  return Math.round((parse(to) - parse(from)) / 86_400_000);
}

function briefAgeLabel(hours: number) {
  if (hours < 24) return `${hours} jam`;
  const days = Math.floor(hours / 24);
  return `${days} hari`;
}

function sortOperationsItems(items: OperationsInboxItem[]) {
  items.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority === "urgent" ? -1 : 1;
    return (a.eventDate ?? "9999-12-31").localeCompare(b.eventDate ?? "9999-12-31");
  });
}

export async function loadOperationsInbox() {
  const supabase = getServerClient();

  const [
    { data: bookingsData, error: bookingsError },
    { data: newBriefsData, error: newBriefsError },
    { data: pendingAvailabilityData, error: pendingAvailabilityError },
    { data: pendingOnboardingData, error: pendingOnboardingError },
    { data: newSupplyInterestData, error: newSupplyInterestError },
  ] = await Promise.all([
    supabase
      .from("bookings")
      .select("id,brief_id,talent_id,status,event_date,talent_payable,completed_at")
      .in("status", ["secured", "pre_show", "incident", "completed"])
      .order("event_date", { ascending: true }),
    supabase
      .from("briefs")
      .select("id,event_type,event_date,city,request_mode,created_at")
      .eq("status", "new")
      .order("created_at", { ascending: true }),
    supabase
      .from("availability_requests")
      .select("id,brief_id,talent_id,requested_at")
      .eq("status", "pending")
      .order("requested_at", { ascending: true }),
    supabase
      .from("talents")
      .select("id,name,supply_type,manager_whatsapp,created_at")
      .eq("onboarding_status", "not_started")
      .order("created_at", { ascending: true }),
    supabase
      .from("supply_interest_submissions")
      .select("id,applicant_name,supply_type,created_at")
      .eq("status", "new")
      .order("created_at", { ascending: true }),
  ]);

  if (bookingsError) throw new Error(bookingsError.message);
  if (newBriefsError) throw new Error(newBriefsError.message);
  if (pendingAvailabilityError) throw new Error(pendingAvailabilityError.message);
  if (pendingOnboardingError) throw new Error(pendingOnboardingError.message);
  if (newSupplyInterestError) throw new Error(newSupplyInterestError.message);

  const bookings = (bookingsData ?? []) as BookingRow[];
  const newBriefs = (newBriefsData ?? []) as NewBriefRow[];
  const pendingAvailability = (pendingAvailabilityData ?? []) as PendingAvailabilityRow[];
  const pendingOnboarding = (pendingOnboardingData ?? []) as PendingOnboardingRow[];
  const newSupplyInterest = (newSupplyInterestData ?? []) as NewSupplyInterestRow[];
  const today = jakartaDateString();
  const items: OperationsInboxItem[] = [];

  for (const interest of newSupplyInterest) {
    const ageHours = hoursSince(interest.created_at);

    // Curation is intentionally asynchronous, but a qualified applicant should not
    // disappear into an unreviewed list. Seven days is an internal escalation, not a promise.
    if (ageHours < 24) continue;

    const supplyLabel = interest.supply_type === "talent"
      ? "Talent"
      : interest.supply_type === "professional"
        ? "Professional"
        : "Production Partner";
    const applicantName = interest.applicant_name?.trim() || `Pendaftar ${supplyLabel}`;
    items.push({
      key: `${interest.id}:SUPPLY_INTEREST_UNREVIEWED`,
      code: "SUPPLY_INTEREST_UNREVIEWED",
      priority: ageHours >= 168 ? "urgent" : "action",
      briefId: null,
      bookingId: null,
      talentName: applicantName,
      eventLabel: `${supplyLabel} · kurasi roster`,
      eventDate: null,
      city: null,
      title: `${applicantName} · minat supply belum ditinjau`,
      detail: `Pendaftaran beserta portofolio masuk ${briefAgeLabel(ageHours)} lalu. Tinjau kelayakan sebelum mengirim undangan onboarding.`,
      amount: null,
      followUps: [],
      reviewHref: "/admin#supply-interest-inbox",
    });
  }

  for (const brief of newBriefs) {
    const ageHours = hoursSince(brief.created_at);
    const daysToEvent = brief.event_date ? daysBetween(today, brief.event_date) : null;
    const eventNear = daysToEvent != null && daysToEvent <= 7;

    // Four hours is an exception threshold, not a public response-time promise.
    if (ageHours < 4 && !eventNear) continue;

    const urgent = ageHours >= 24 || eventNear;
    const requestLabel = brief.request_mode === "direct_talent" ? "Direct inquiry" : "Brief pencarian talent";
    const eventTiming = daysToEvent == null
      ? null
      : daysToEvent < 0
        ? "Tanggal acara sudah lewat"
        : daysToEvent === 0
          ? "Acara berlangsung hari ini"
          : `Acara tinggal ${daysToEvent} hari`;
    items.push({
      key: `${brief.id}:NEW_BRIEF_UNREVIEWED`,
      code: "NEW_BRIEF_UNREVIEWED",
      priority: urgent ? "urgent" : "action",
      briefId: brief.id,
      bookingId: null,
      talentName: "Belum ditentukan",
      eventLabel: brief.event_type?.trim() || requestLabel,
      eventDate: brief.event_date,
      city: brief.city,
      title: `${requestLabel} belum ditinjau`,
      detail: eventNear
        ? `Masih berstatus Baru setelah ${briefAgeLabel(ageHours)}. ${eventTiming}.`
        : `Masih berstatus Baru setelah ${briefAgeLabel(ageHours)}. Buka brief untuk mulai review dan pencocokan.`,
      amount: null,
      followUps: [],
    });
  }

  for (const supply of pendingOnboarding) {
    const ageHours = hoursSince(supply.created_at);

    // A newly created profile may still be waiting for the invite to reach its PIC.
    // Keep the first 48 hours out of the exception queue, then escalate after a week.
    if (ageHours < 48) continue;

    const supplyLabel = supply.supply_type === "talent"
      ? "Talent"
      : supply.supply_type === "professional"
        ? "Professional"
        : "Production Partner";
    const supplyName = supply.name?.trim() || `Pendaftaran ${supplyLabel}`;
    items.push({
      key: `${supply.id}:ONBOARDING_NOT_STARTED`,
      code: "ONBOARDING_NOT_STARTED",
      priority: ageHours >= 168 ? "urgent" : "action",
      briefId: null,
      bookingId: null,
      followUpSubjectId: supply.id,
      talentName: supplyName,
      eventLabel: `${supplyLabel} onboarding`,
      eventDate: null,
      city: null,
      title: `${supplyName} · onboarding belum dimulai`,
      detail: `Profil internal dibuat ${briefAgeLabel(ageHours)} lalu, tetapi belum ada draft. Buat ulang secure link dan kirim hanya kepada PIC yang sudah dikurasi.`,
      amount: null,
      followUps: [{
        party: "supply",
        label: "Siapkan link onboarding",
        phone: supply.manager_whatsapp,
        scope: "talent_onboarding",
        messageKind: "onboarding",
      }],
      reviewHref: `/admin/talents/${supply.id}`,
    });
  }

  if (pendingAvailability.length > 0) {
    const pendingBriefIds = [...new Set(pendingAvailability.map((row) => row.brief_id))];
    const pendingTalentIds = [...new Set(pendingAvailability.map((row) => row.talent_id))];
    const [
      { data: pendingBriefsData, error: pendingBriefsError },
      { data: pendingTalentsData, error: pendingTalentsError },
    ] = await Promise.all([
      supabase.from("briefs").select("id,event_type,event_date,city").in("id", pendingBriefIds),
      supabase.from("talents").select("id,name,manager_whatsapp").in("id", pendingTalentIds),
    ]);
    if (pendingBriefsError) throw new Error(pendingBriefsError.message);
    if (pendingTalentsError) throw new Error(pendingTalentsError.message);

    const pendingBriefs = new Map(((pendingBriefsData ?? []) as PendingAvailabilityBrief[]).map((row) => [row.id, row]));
    const pendingTalents = new Map(((pendingTalentsData ?? []) as PendingAvailabilityTalent[]).map((row) => [row.id, row]));

    for (const request of pendingAvailability) {
      const ageHours = hoursSince(request.requested_at);
      const brief = pendingBriefs.get(request.brief_id);
      const talent = pendingTalents.get(request.talent_id);
      const daysToEvent = brief?.event_date ? daysBetween(today, brief.event_date) : null;
      const eventNear = daysToEvent != null && daysToEvent <= 7;

      // Keep recent requests out of the exception queue; 12 hours is an internal follow-up threshold.
      if (ageHours < 12 && !eventNear) continue;

      const talentName = talent?.name?.trim() || "Talent/Manager";
      items.push({
        key: `${request.id}:AVAILABILITY_RESPONSE_OVERDUE`,
        code: "AVAILABILITY_RESPONSE_OVERDUE",
        priority: ageHours >= 24 || eventNear ? "urgent" : "action",
        briefId: request.brief_id,
        bookingId: null,
        followUpSubjectId: request.id,
        talentName,
        eventLabel: brief?.event_type?.trim() || "Acara",
        eventDate: brief?.event_date ?? null,
        city: brief?.city ?? null,
        title: `${talentName} · konfirmasi ketersediaan belum dijawab`,
        detail: `Permintaan dikirim ${briefAgeLabel(ageHours)} lalu. Siapkan ulang secure link dan follow-up Talent/Manager.`,
        amount: null,
        followUps: [{
          party: "talent",
          label: "Follow-up Talent/Manager",
          phone: talent?.manager_whatsapp ?? null,
          scope: "talent_offer",
          messageKind: "availability",
        }],
      });
    }
  }

  if (bookings.length === 0) {
    sortOperationsItems(items);
    return {
      items,
      urgentCount: items.filter((item) => item.priority === "urgent").length,
      paymentCount: 0,
    };
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
    supabase.from("briefs").select("id,event_type,city,buyer_whatsapp").in("id", briefIds),
    supabase.from("talents").select("id,name,manager_whatsapp").in("id", talentIds),
    supabase
      .from("booking_advances")
      .select("booking_id,status,revision_no,confirmed_revision_no,buyer_confirmed_at,talent_confirmed_at")
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
        followUps: [],
      });
    }

    const advanceConfirmed =
      Boolean(advance) &&
      advance?.status === "confirmed" &&
      advance.confirmed_revision_no === advance.revision_no;

    if (["secured", "pre_show"].includes(booking.status) && !advanceConfirmed) {
      const eventNear = Boolean(booking.event_date && booking.event_date <= today);
      const followUps: OperationsFollowUp[] = [];
      if (!advance?.buyer_confirmed_at) {
        followUps.push({
          party: "buyer",
          label: "Follow-up Buyer/EO",
          phone: brief?.buyer_whatsapp ?? null,
          scope: "buyer_advance",
          messageKind: "advance",
        });
      }
      if (!advance?.talent_confirmed_at) {
        followUps.push({
          party: "talent",
          label: "Follow-up Talent/Manager",
          phone: talent?.manager_whatsapp ?? null,
          scope: "talent_advance",
          messageKind: "advance",
        });
      }
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
        followUps,
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
        const followUps: OperationsFollowUp[] = [];
        if (!buyer) {
          followUps.push({
            party: "buyer",
            label: "Follow-up Buyer/EO",
            phone: brief?.buyer_whatsapp ?? null,
            scope: "buyer_pre_show",
            messageKind: "post_show",
          });
        }
        if (!talentConfirmation) {
          followUps.push({
            party: "talent",
            label: "Follow-up Talent/Manager",
            phone: talent?.manager_whatsapp ?? null,
            scope: "talent_pre_show",
            messageKind: "post_show",
          });
        }
        items.push({
          ...base,
          key: `${booking.id}:POST_SHOW_CONFIRMATION_MISSING`,
          code: "POST_SHOW_CONFIRMATION_MISSING",
          priority: "urgent",
          title: `${talentName} · konfirmasi post-show belum lengkap`,
          detail: `${missing} belum mengirim hasil pertunjukan.`,
          amount: null,
          followUps,
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
          followUps: [],
        });
      }
    }
  }

  sortOperationsItems(items);

  return {
    items,
    urgentCount: items.filter((item) => item.priority === "urgent").length,
    paymentCount: items.filter((item) => item.code === "SETTLEMENT_DUE").length,
  };
}
