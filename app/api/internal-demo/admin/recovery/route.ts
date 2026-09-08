import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import { MATCH_ENGINE_VERSION, persistMatchSnapshot } from "@/lib/match-persistence";
import { rankTalents } from "@/lib/talent-engine/matching";
import { loadEngineTalents } from "@/lib/talent-engine/supabase-talents";
import type { StructuredBrief } from "@/lib/talent-engine/types";

export const runtime = "nodejs";

function getServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) throw new Error("Supabase server environment is not configured");
  return createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function toStructuredBrief(row: Record<string, unknown>): StructuredBrief {
  return {
    eventType: typeof row.event_type === "string" ? row.event_type : null,
    eventDate: typeof row.event_date === "string" ? row.event_date : null,
    city: typeof row.city === "string" ? row.city : null,
    venue: typeof row.venue === "string" ? row.venue : null,
    audienceSize: typeof row.audience_size === "number" ? row.audience_size : null,
    talentCategory: typeof row.talent_category === "string" ? row.talent_category : null,
    genreStyle: Array.isArray(row.genre_style) ? row.genre_style.filter((v): v is string => typeof v === "string") : [],
    budgetMin: typeof row.budget_min === "number" ? row.budget_min : null,
    budgetMax: typeof row.budget_max === "number" ? row.budget_max : null,
    performanceDurationMinutes: typeof row.performance_duration_minutes === "number" ? row.performance_duration_minutes : null,
    eventVibe: Array.isArray(row.event_vibe) ? row.event_vibe.filter((v): v is string => typeof v === "string") : [],
    specialRequirements: Array.isArray(row.special_requirements) ? row.special_requirements.filter((v): v is string => typeof v === "string") : [],
    sourceText: typeof row.source_text === "string" ? row.source_text : undefined,
    fieldEvidence: row.field_evidence && typeof row.field_evidence === "object" ? row.field_evidence as StructuredBrief["fieldEvidence"] : undefined,
  };
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const action = text(body?.action);
    if (action !== "open") return NextResponse.json({ error: "Aksi recovery tidak dikenal" }, { status: 400 });

    const bookingId = text(body?.bookingId);
    const incidentId = text(body?.incidentId);
    const reason = text(body?.reason);
    if (!bookingId || !incidentId || !reason) {
      return NextResponse.json({ error: "Booking, insiden, dan alasan recovery wajib tersedia" }, { status: 400 });
    }

    const supabase = getServerClient();
    const idempotencyKey = `recovery:${bookingId}:${incidentId}`;
    const { data: opened, error: openError } = await supabase.rpc("ns_open_recovery_case_v1", {
      p_booking_id: bookingId,
      p_incident_id: incidentId,
      p_reason: reason,
      p_idempotency_key: idempotencyKey,
    });
    if (openError) return NextResponse.json({ error: openError.message }, { status: 409 });

    const recovery = Array.isArray(opened) ? opened[0] : opened;
    if (!recovery?.id || !recovery?.recovery_brief_id || !recovery?.original_talent_id) {
      throw new Error("Recovery case tidak lengkap setelah dibuat");
    }

    const { data: recoveryBrief, error: briefError } = await supabase
      .from("briefs")
      .select("event_type,event_date,city,venue,audience_size,talent_category,genre_style,budget_min,budget_max,performance_duration_minutes,event_vibe,special_requirements,source_text,field_evidence")
      .eq("id", recovery.recovery_brief_id)
      .single();
    if (briefError || !recoveryBrief) throw new Error(briefError?.message ?? "Recovery brief tidak ditemukan");

    const roster = await loadEngineTalents();
    const eligibleRoster = roster.talents.filter((talent) => talent.id !== recovery.original_talent_id);
    const matches = rankTalents(eligibleRoster, toStructuredBrief(recoveryBrief as Record<string, unknown>), 30);
    const snapshot = await persistMatchSnapshot(String(recovery.recovery_brief_id), matches);
    const generatedAt = snapshot.generatedAt ?? new Date().toISOString();

    const { error: markerError } = await supabase
      .from("recovery_cases")
      .update({
        match_engine_version: snapshot.engineVersion || MATCH_ENGINE_VERSION,
        matching_generated_at: generatedAt,
        match_count: matches.length,
        updated_at: new Date().toISOString(),
      })
      .eq("id", recovery.id);
    if (markerError) throw new Error(`Recovery matching marker gagal: ${markerError.message}`);

    return NextResponse.json({
      ok: true,
      recoveryCaseId: String(recovery.id),
      recoveryBriefId: String(recovery.recovery_brief_id),
      originalTalentId: String(recovery.original_talent_id),
      matchCount: matches.length,
      matchEngineVersion: snapshot.engineVersion || MATCH_ENGINE_VERSION,
      matchingGeneratedAt: generatedAt,
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown error";
    console.error("Recovery action failed", detail);
    return NextResponse.json({ error: "Proses recovery gagal", detail }, { status: 500 });
  }
}
