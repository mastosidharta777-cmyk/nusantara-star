import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export type TalentOnboardingStatus = "not_started" | "in_progress" | "submitted" | "approved" | "rejected";

export function isTalentOnboardingEditable(status: string | null | undefined) {
  return status != null && status !== "submitted" && status !== "approved";
}

export async function getTalentOnboardingStatus(supabase: SupabaseClient, talentId: string) {
  const { data, error } = await supabase
    .from("talents")
    .select("onboarding_status")
    .eq("id", talentId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return (data?.onboarding_status as TalentOnboardingStatus | undefined) ?? null;
}

export async function talentOnboardingEditConflict(supabase: SupabaseClient, talentId: string) {
  const [{ data: talent, error: talentError }, { data: submission, error: submissionError }] = await Promise.all([
    supabase.from("talents").select("onboarding_status").eq("id", talentId).maybeSingle(),
    supabase.from("talent_profile_submissions").select("status").eq("talent_id", talentId).maybeSingle(),
  ]);
  if (talentError) throw new Error(talentError.message);
  if (submissionError) throw new Error(submissionError.message);
  if (!talent) return NextResponse.json({ error: "Talent tidak ditemukan" }, { status: 404 });
  const statuses = [talent.onboarding_status, submission?.status];
  if (statuses.includes("submitted")) {
    return NextResponse.json(
      { error: "Profil sedang ditinjau. Klik Edit kembali untuk menarik profil sebelum mengubah data." },
      { status: 409 },
    );
  }
  if (statuses.includes("approved")) {
    return NextResponse.json(
      { error: "Profil sudah disetujui. Perubahan profil publik memerlukan alur pembaruan terpisah." },
      { status: 409 },
    );
  }
  return null;
}
