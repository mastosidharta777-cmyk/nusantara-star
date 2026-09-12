import "server-only";

import { createClient } from "@supabase/supabase-js";

import type { BuyerBriefContact } from "@/lib/brief-persistence";
import type { StructuredBrief } from "@/lib/talent-engine/types";

type ContinuationRow = {
  id: string;
  event_type: string | null;
  event_date: string | null;
  city: string | null;
  venue: string | null;
  audience_size: number | null;
  talent_category: string | null;
  genre_style: string[] | null;
  budget_min: number | null;
  budget_max: number | null;
  performance_duration_minutes: number | null;
  event_vibe: string[] | null;
  special_requirements: string[] | null;
  source_text: string | null;
  field_evidence: StructuredBrief["fieldEvidence"] | null;
  buyer_name: string | null;
  buyer_company: string | null;
  buyer_whatsapp: string | null;
  buyer_email: string | null;
};

function getServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) throw new Error("Supabase server environment is not configured");
  return createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

export function isBriefReference(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export async function loadBriefContinuation(briefId: string): Promise<{ brief: StructuredBrief; contact: BuyerBriefContact } | null> {
  if (!isBriefReference(briefId)) return null;

  const { data, error } = await getServerClient()
    .from("briefs")
    .select("id,event_type,event_date,city,venue,audience_size,talent_category,genre_style,budget_min,budget_max,performance_duration_minutes,event_vibe,special_requirements,source_text,field_evidence,buyer_name,buyer_company,buyer_whatsapp,buyer_email")
    .eq("id", briefId)
    .eq("request_mode", "discovery")
    .maybeSingle();

  if (error) throw new Error(`Brief continuation load failed: ${error.message}`);
  if (!data) return null;
  const row = data as ContinuationRow;
  if (!row.buyer_name || !row.buyer_whatsapp || !row.buyer_email) return null;

  return {
    brief: {
      eventType: row.event_type,
      eventDate: row.event_date,
      city: row.city,
      venue: row.venue,
      audienceSize: row.audience_size,
      talentCategory: row.talent_category,
      genreStyle: row.genre_style ?? [],
      budgetMin: row.budget_min,
      budgetMax: row.budget_max,
      performanceDurationMinutes: row.performance_duration_minutes,
      eventVibe: row.event_vibe ?? [],
      specialRequirements: row.special_requirements ?? [],
      sourceText: row.source_text ?? undefined,
      fieldEvidence: row.field_evidence ?? undefined,
    },
    contact: {
      name: row.buyer_name,
      company: row.buyer_company,
      whatsapp: row.buyer_whatsapp,
      email: row.buyer_email,
    },
  };
}
