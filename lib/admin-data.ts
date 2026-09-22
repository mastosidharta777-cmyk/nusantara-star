import { createClient } from "@supabase/supabase-js";

import { getLaunchMode } from "@/lib/launch-control";
import type { SupplyType } from "@/lib/supply-onboarding";

type SupplyRow = {
  id: string;
  name: string;
  category: string;
  supply_service_ids: string[] | null;
  primary_supply_service_id: string | null;
  supply_other_service: string | null;
  supply_type: SupplyType;
  onboarding_status: string;
  base_city: string | null;
  budget_min: number | null;
  budget_max: number | null;
  status: string;
  public_visible: boolean;
  last_calendar_updated_at: string | null;
};

type SupplySubmissionSnapshot = {
  talent_id: string;
  name: string | null;
  base_city: string | null;
  supply_service_ids: string[] | null;
  primary_supply_service_id: string | null;
  supply_other_service: string | null;
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

type PublicationAssetRow = {
  talent_id: string;
  asset_type: string;
  upload_status: string;
  review_status: string;
  buyer_visible: boolean;
};

export type AdminLaunchReadinessTalent = {
  id: string;
  name: string;
  category: string;
  publicVisible: boolean;
  technicallyReady: boolean;
  blockers: string[];
};

export type AdminTalent = SupplyRow & {
  supply_type: "talent";
  freshness: "fresh" | "needs_confirmation" | "stale" | "never_updated";
  daysSinceCalendarUpdate: number | null;
};

export type AdminSupplyIntake = SupplyRow & {
  supply_type: "professional" | "production_partner";
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

  const [
    { data: supplyRows, error: supplyError },
    { data: submissions, error: submissionError },
    { data: briefs, error: briefError },
    { data: publicationAssets, error: publicationAssetsError },
  ] = await Promise.all([
    supabase
      .from("talents")
      .select("id,name,category,supply_service_ids,primary_supply_service_id,supply_other_service,supply_type,onboarding_status,base_city,budget_min,budget_max,status,public_visible,last_calendar_updated_at")
      .order("created_at", { ascending: false }),
    supabase
      .from("talent_profile_submissions")
      .select("talent_id,name,base_city,supply_service_ids,primary_supply_service_id,supply_other_service"),
    supabase
      .from("briefs")
      .select("id,event_type,event_date,city,talent_category,budget_min,budget_max,request_mode,requested_talent_id,status,created_at")
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("talent_assets")
      .select("talent_id,asset_type,upload_status,review_status,buyer_visible")
      .in("asset_type", ["profile_photo", "live_performance", "showreel", "event_clip"]),
  ]);

  if (supplyError || submissionError || briefError || publicationAssetsError) {
    throw new Error(supplyError?.message ?? submissionError?.message ?? briefError?.message ?? publicationAssetsError?.message ?? "Failed to load admin data");
  }

  const rows = (supplyRows ?? []) as SupplyRow[];
  const adminTalents: AdminTalent[] = rows
    .filter((row): row is SupplyRow & { supply_type: "talent" } => row.supply_type === "talent")
    .map((talent) => ({ ...talent, ...getFreshness(talent.last_calendar_updated_at) }));
  const submissionByTalentId = new Map(
    ((submissions ?? []) as SupplySubmissionSnapshot[]).map((submission) => [submission.talent_id, submission]),
  );
  const supplyIntake = rows
    .filter((row): row is AdminSupplyIntake => row.supply_type === "professional" || row.supply_type === "production_partner")
    .map((supply) => {
      const submission = submissionByTalentId.get(supply.id);
      if (!submission) return supply;
      return {
        ...supply,
        name: submission.name || supply.name,
        base_city: submission.base_city || supply.base_city,
        supply_service_ids: submission.supply_service_ids ?? supply.supply_service_ids,
        primary_supply_service_id: submission.primary_supply_service_id ?? supply.primary_supply_service_id,
        supply_other_service: submission.supply_other_service ?? supply.supply_other_service,
      };
    });

  const talentNameMap = new Map(adminTalents.map((talent) => [talent.id, talent.name]));
  const briefRows: AdminBrief[] = ((briefs ?? []) as BriefRow[]).map((brief) => ({
    ...brief,
    requested_talent_name: brief.requested_talent_id ? talentNameMap.get(brief.requested_talent_id) ?? null : null,
  }));
  const approvedBuyerAssets = ((publicationAssets ?? []) as PublicationAssetRow[]).filter(
    (asset) => asset.upload_status === "uploaded" && asset.review_status === "approved" && asset.buyer_visible,
  );
  const assetsByTalent = new Map<string, PublicationAssetRow[]>();
  for (const asset of approvedBuyerAssets) {
    assetsByTalent.set(asset.talent_id, [...(assetsByTalent.get(asset.talent_id) ?? []), asset]);
  }
  const launchTalents: AdminLaunchReadinessTalent[] = adminTalents.map((talent) => {
    const assets = assetsByTalent.get(talent.id) ?? [];
    const hasPhoto = assets.some((asset) => asset.asset_type === "profile_photo");
    const hasPerformanceMedia = assets.some((asset) => ["live_performance", "showreel", "event_clip"].includes(asset.asset_type));
    const blockers = [
      talent.status !== "verified" ? "belum terverifikasi" : null,
      talent.onboarding_status !== "approved" ? "onboarding belum disetujui" : null,
      !hasPhoto ? "foto publik belum disetujui" : null,
      !hasPerformanceMedia ? "media penampilan belum disetujui" : null,
    ].filter((reason): reason is string => Boolean(reason));
    return {
      id: talent.id,
      name: talent.name || "Pendaftaran Talent",
      category: talent.category || "Kategori belum diisi",
      publicVisible: talent.public_visible,
      technicallyReady: blockers.length === 0,
      blockers,
    };
  });

  return {
    talents: adminTalents,
    supplyIntake,
    briefs: briefRows,
    launchReadiness: {
      mode: getLaunchMode(),
      preparedCount: launchTalents.filter((talent) => talent.publicVisible).length,
      readyInternalCount: launchTalents.filter((talent) => talent.technicallyReady && !talent.publicVisible).length,
      blockedCount: launchTalents.filter((talent) => !talent.technicallyReady).length,
      talents: launchTalents,
    },
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
