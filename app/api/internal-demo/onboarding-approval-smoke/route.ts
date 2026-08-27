import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function getServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase server environment is not configured");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function GET() {
  if (process.env.VERCEL_ENV === "production") return NextResponse.json({ error: "Not found" }, { status: 404 });
  const s = getServerClient();
  const stamp = Date.now();
  const ids: string[] = [];

  async function seedTalent(label: string) {
    const { data: talent, error: te } = await s.from("talents").insert({ name: `${label} ${stamp}`, category: "singer", status: "curated", onboarding_status: "submitted", public_visible: false }).select("id").single();
    if (te || !talent) throw new Error(te?.message ?? "Talent seed failed");
    ids.push(talent.id);
    const { error: se } = await s.from("talent_profile_submissions").insert({
      talent_id: talent.id,
      name: `${label} ${stamp}`,
      category: "singer",
      base_city: "Jakarta",
      genres: ["Pop"],
      service_cities: [],
      performance_formats: ["Solo"],
      event_types: ["Corporate"],
      bio: "Smoke test",
      status: "submitted",
      submitted_at: new Date().toISOString(),
    });
    if (se) throw new Error(se.message);
    return talent.id as string;
  }

  try {
    const approvedTalentId = await seedTalent("Onboarding Atomic Approve");
    const { error: assetError } = await s.from("talent_assets").insert([
      { talent_id: approvedTalentId, asset_type: "profile_photo", provider: "supabase_storage", storage_key: `smoke/${stamp}/photo.jpg`, mime_type: "image/jpeg", size_bytes: 1000, upload_status: "uploaded", review_status: "approved", buyer_visible: true },
      { talent_id: approvedTalentId, asset_type: "showreel", provider: "cloudflare_r2", storage_key: `smoke/${stamp}/showreel.mp4`, mime_type: "video/mp4", size_bytes: 1000, upload_status: "uploaded", review_status: "approved", buyer_visible: true },
    ]);
    if (assetError) throw new Error(assetError.message);

    const { error: riderError } = await s.from("talent_rider_versions").insert({
      talent_id: approvedTalentId,
      version_no: 1,
      source_type: "form_text",
      source_hash: `atomic-onboarding-${stamp}`,
      normalized_data: {},
      missing_questions: [],
      answers: {},
      normalization_source: "rules",
      status: "ready_for_admin",
      is_current: true,
      talent_confirmed_at: new Date().toISOString(),
    });
    if (riderError) throw new Error(riderError.message);

    const riderFirst = await s.rpc("ns_approve_talent_rider_v1", { p_talent_id: approvedTalentId });
    if (riderFirst.error) throw new Error(riderFirst.error.message);
    const riderSecond = await s.rpc("ns_approve_talent_rider_v1", { p_talent_id: approvedTalentId });
    if (riderSecond.error) throw new Error(riderSecond.error.message);

    const profileApprove = await s.rpc("ns_approve_talent_profile_v1", { p_talent_id: approvedTalentId });
    if (profileApprove.error) throw new Error(profileApprove.error.message);

    const [{ data: approvedTalent }, { data: approvedSubmission }, { data: approvedRider }] = await Promise.all([
      s.from("talents").select("onboarding_status,status,public_visible").eq("id", approvedTalentId).single(),
      s.from("talent_profile_submissions").select("status").eq("talent_id", approvedTalentId).single(),
      s.from("talent_rider_versions").select("status,admin_approved_at").eq("talent_id", approvedTalentId).eq("is_current", true).single(),
    ]);

    const riderApprovalAtomic = approvedRider?.status === "admin_approved" && Boolean(approvedRider?.admin_approved_at) && riderSecond.data?.alreadyApproved === true;
    const profileApprovalAtomic = approvedTalent?.onboarding_status === "approved" && approvedTalent?.status === "verified" && approvedTalent?.public_visible === true && approvedSubmission?.status === "approved";

    const rejectedTalentId = await seedTalent("Onboarding Atomic Reject");
    const reject = await s.rpc("ns_reject_talent_profile_v1", { p_talent_id: rejectedTalentId, p_rejection_note: "Smoke rejection" });
    if (reject.error) throw new Error(reject.error.message);
    const [{ data: rejectedTalent }, { data: rejectedSubmission }] = await Promise.all([
      s.from("talents").select("onboarding_status,public_visible").eq("id", rejectedTalentId).single(),
      s.from("talent_profile_submissions").select("status,rejection_note").eq("talent_id", rejectedTalentId).single(),
    ]);
    const profileRejectionAtomic = rejectedTalent?.onboarding_status === "rejected" && rejectedTalent?.public_visible === false && rejectedSubmission?.status === "rejected" && rejectedSubmission?.rejection_note === "Smoke rejection";

    return NextResponse.json({
      ok: riderApprovalAtomic && profileApprovalAtomic && profileRejectionAtomic,
      checks: { riderApprovalAtomic, profileApprovalAtomic, profileRejectionAtomic },
      cleanup: "automatic",
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  } finally {
    for (const talentId of ids) {
      await s.from("talent_rider_versions").delete().eq("talent_id", talentId);
      await s.from("talent_assets").delete().eq("talent_id", talentId);
      await s.from("talent_profile_submissions").delete().eq("talent_id", talentId);
      await s.from("talents").delete().eq("id", talentId);
    }
  }
}
