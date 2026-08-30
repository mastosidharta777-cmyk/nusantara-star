import { createClient } from "@supabase/supabase-js";

import type { StructuredBrief } from "@/lib/talent-engine/types";

export type BuyerBriefContact = {
  name: string;
  company?: string | null;
  whatsapp: string;
  email: string;
};

export type BriefRequestContext = {
  requestMode?: "discovery" | "direct_talent";
  requestedTalentId?: string | null;
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

export async function persistBrief(brief: StructuredBrief, contact?: BuyerBriefContact, context?: BriefRequestContext) {
  const supabase = getServerClient();
  const requestedTalentId = context?.requestedTalentId ?? null;
  const requestMode = context?.requestMode ?? (requestedTalentId ? "direct_talent" : "discovery");

  if (requestMode === "direct_talent" && !requestedTalentId) {
    throw new Error("Direct talent inquiry requires a requested talent id");
  }
  if (requestMode === "discovery" && requestedTalentId) {
    throw new Error("Discovery brief cannot persist a requested talent id");
  }

  const { data, error } = await supabase
    .from("briefs")
    .insert({
      event_type: brief.eventType,
      event_date: brief.eventDate,
      city: brief.city,
      venue: brief.venue,
      audience_size: brief.audienceSize,
      talent_category: brief.talentCategory,
      genre_style: brief.genreStyle,
      budget_min: brief.budgetMin,
      budget_max: brief.budgetMax,
      performance_duration_minutes: brief.performanceDurationMinutes,
      event_vibe: brief.eventVibe,
      special_requirements: brief.specialRequirements,
      source_text: brief.sourceText ?? null,
      field_evidence: brief.fieldEvidence ?? {},
      buyer_name: contact?.name ?? null,
      buyer_company: contact?.company ?? null,
      buyer_whatsapp: contact?.whatsapp ?? null,
      buyer_email: contact?.email ?? null,
      request_mode: requestMode,
      requested_talent_id: requestedTalentId,
      status: "new",
    })
    .select("id")
    .single();

  if (error || !data?.id) {
    throw new Error(`Brief persistence failed: ${error?.message ?? "missing inserted id"}`);
  }

  return { id: String(data.id) };
}
