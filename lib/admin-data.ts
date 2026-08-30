import { createClient } from "@supabase/supabase-js";

type TalentRow = {
  id: string;
  name: string;
  category: string;
  base_city: string | null;
  budget_min: number | null;
  budget_max: number | null;
  status: string;
  public_visible: boolean;
  last_calendar_updated_at: string | null;
};

type BriefRow = {
  id: string;
  event_type: string | null;
  event_date: string | null;
  city: string | null;
  talent_category: string | null;
  budget_min: number | null;
  budget_max: number | null;
  request_mode: "discovery" | "direct_talent";
  requested_talent_id: string | null;
  status: string;
  created_at: string;
};

export type AdminTalent = TalentRow & {
  freshness: "fresh" | "needs_confirmation" | "stale" | "never_updated";
  daysSinceCalendarUpdate: number | null;
};

export type AdminBrief = BriefRow & {
  requested_talent_name: string | null;
};

function getServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error("Supabase server environment is not configured");
  }

  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function getFreshness(lastUpdated: string | null) {
  if (!lastUpdated) {
    return { freshness: "never_updated" as const, daysSinceCalendarUpdate: null };
  }

  const diffMs = Date.now() - new Date(lastUpdated).getTime();
  const days = Math.max(0, Math.floor(diffMs / 86_400_000));

  if (days <= 7) return { freshness: "fresh" as const, daysSinceCalendarUpdate: days };
  if (days <= 14) return { freshness: "needs_confirmation" as const, daysSinceCalendarUpdate: days };
  return { freshness: "stale" as const, daysSinceCalendarUpdate: days };
}

export async function loadAdminDashboardData() {
  const supabase = getServerClient();

  const [{ data: talents, error: talentError }, { data: briefs, error: briefError }] = await Promise.all([
    supabase
      .from("talents")
      .select("id,name,category,base_city,budget_min,budget_max,status,public_visible,last_calendar_updated_at")
      .order("name"),
    supabase
      .from("briefs")
      .select("id,event_type,event_date,city,talent_category,budget_min,budget_max,request_mode,requested_talent_id,status,created_at")
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  if (talentError || briefError) {
    throw new Error(talentError?.message ?? briefError?.message ?? "Failed to load admin data");
  }

  const adminTalents: AdminTalent[] = ((talents ?? []) as TalentRow[]).map((talent) => ({
    ...talent,
    ...getFreshness(talent.last_calendar_updated_at),
  }));
  const talentNameMap = new Map(adminTalents.map((talent) => [talent.id, talent.name]));
  const briefRows: AdminBrief[] = ((briefs ?? []) as BriefRow[]).map((brief) => ({
    ...brief,
    requested_talent_name: brief.requested_talent_id ? talentNameMap.get(brief.requested_talent_id) ?? null : null,
  }));

  return {
    talents: adminTalents,
    briefs: briefRows,
    kpis: {
      totalTalents: adminTalents.length,
      verifiedTalents: adminTalents.filter((talent) => talent.status === "verified").length,
      staleTalents: adminTalents.filter(
        (talent) => talent.freshness === "stale" || talent.freshness === "never_updated",
      ).length,
      newBriefs: briefRows.filter((brief) => brief.status === "new").length,
      activeBriefs: briefRows.filter((brief) => !["closed", "cancelled"].includes(brief.status)).length,
    },
  };
}
