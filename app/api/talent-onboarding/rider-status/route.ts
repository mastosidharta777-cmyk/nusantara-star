import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { normalizeRiderSource } from "@/lib/rider-normalization";
import { verifyAccessToken } from "@/lib/signed-access";
import { getTalentOnboardingStatus, isTalentOnboardingEditable, talentOnboardingEditConflict } from "@/lib/talent-onboarding-state";

export const runtime = "nodejs";

function client() {
  const u = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const k = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!u || !k) throw new Error("Supabase server environment is not configured");
  return createClient(u, k, { auth: { persistSession: false, autoRefreshToken: false } });
}

function auth(b: any) {
  const talentId = typeof b?.talentId === "string" ? b.talentId : "";
  const token = typeof b?.token === "string" ? b.token : "";
  return { talentId, ok: Boolean(talentId && verifyAccessToken(token, "talent_onboarding", talentId)) };
}

function requiredQuestionsFromNormalized(data: any) {
  const questions: Array<{ key: string; question: string; required: boolean }> = [];
  if (data?.accommodation_required === true && (!Array.isArray(data?.accommodation_requirements) || data.accommodation_requirements.length === 0)) {
    questions.push({
      key: "accommodation_details",
      question: "Akomodasi diperlukan. Mohon isi detail minimum yang dibutuhkan (misalnya jumlah kamar/tipe kamar atau ketentuan hotel). Jika fleksibel, tulis: mengikuti kesepakatan advance.",
      required: true,
    });
  }
  return questions;
}

export async function GET(request: Request) {
  try {
    const u = new URL(request.url);
    const talentId = u.searchParams.get("talentId") ?? "";
    const token = u.searchParams.get("token") ?? "";
    if (!talentId || !verifyAccessToken(token, "talent_onboarding", talentId)) {
      return NextResponse.json({ error: "Invalid or expired onboarding link" }, { status: 401 });
    }

    const s = client();
    const onboardingStatus = await getTalentOnboardingStatus(s, talentId);
    const editable = isTalentOnboardingEditable(onboardingStatus);
    const { data, error } = await s
      .from("talent_rider_versions")
      .select("id,version_no,source_type,source_asset_id,source_filename,normalized_data,missing_questions,answers,normalization_source,status,is_current,updated_at")
      .eq("talent_id", talentId)
      .eq("is_current", true)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return NextResponse.json({ ok: true, rider: null, editable });

    const stored = Array.isArray(data.missing_questions) ? data.missing_questions : [];
    const additional = requiredQuestionsFromNormalized(data.normalized_data);
    const byKey = new Map<string, any>();
    for (const q of [...stored, ...additional]) if (q?.key) byKey.set(q.key, q);
    const questions = [...byKey.values()];
    const nextStatus = questions.length ? "needs_talent_input" : data.status;

    if (editable && (questions.length !== stored.length || nextStatus !== data.status)) {
      const now = new Date().toISOString();
      const { data: updated, error: ue } = await s
        .from("talent_rider_versions")
        .update({ missing_questions: questions, status: nextStatus, talent_confirmed_at: questions.length ? null : undefined, updated_at: now })
        .eq("id", data.id)
        .select("id,version_no,source_type,source_asset_id,source_filename,normalized_data,missing_questions,answers,normalization_source,status,is_current,updated_at")
        .single();
      if (ue) throw new Error(ue.message);
      return NextResponse.json({ ok: true, rider: updated, editable });
    }

    return NextResponse.json({ ok: true, rider: data, editable });
  } catch (e) {
    return NextResponse.json({ error: "Rider status failed", detail: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const b = await request.json().catch(() => null);
    const { talentId, ok } = auth(b);
    if (!ok) return NextResponse.json({ error: "Invalid or expired onboarding link" }, { status: 401 });

    const s = client();
    const editConflict = await talentOnboardingEditConflict(s, talentId);
    if (editConflict) return editConflict;
    const { data: current, error: ce } = await s.from("talent_rider_versions").select("*").eq("talent_id", talentId).eq("is_current", true).maybeSingle();
    if (ce) throw new Error(ce.message);
    if (!current) return NextResponse.json({ error: "Belum ada draft rider aktif" }, { status: 409 });

    const now = new Date().toISOString();
    if (b?.action === "discard_current") {
      if (current.status === "admin_approved") return NextResponse.json({ error: "Rider yang sudah disetujui admin tidak dapat dibatalkan dari portal talent" }, { status: 409 });
      await s.from("talent_rider_versions").update({ is_current: false, status: "superseded", updated_at: now }).eq("id", current.id);
      if (current.source_asset_id) {
        await s.from("talent_assets").update({ review_status: "rejected", buyer_visible: false, description: "Draft rider dibatalkan oleh talent/manager.", reviewed_at: now, updated_at: now }).eq("id", current.source_asset_id);
      }
      return NextResponse.json({ ok: true, discarded: true });
    }

    const answers = b?.answers && typeof b.answers === "object" && !Array.isArray(b.answers) ? b.answers : {};
    const clean: Record<string, string> = {};
    for (const [k, v] of Object.entries(answers)) if (typeof v === "string" && v.trim()) clean[k] = v.trim().slice(0, 1200);

    const [{ data: talent }, { data: submission }] = await Promise.all([
      s.from("talents").select("name,base_city,category").eq("id", talentId).maybeSingle(),
      s.from("talent_profile_submissions").select("name,base_city,category").eq("talent_id", talentId).maybeSingle(),
    ]);
    const merged = { ...(current.answers ?? {}), ...clean };
    const source = submission ?? talent;
    const result = await normalizeRiderSource({ sourceText: current.source_text ?? "", talentName: source?.name ?? null, baseCity: source?.base_city ?? null, category: source?.category ?? null, answers: merged });
    const extra = requiredQuestionsFromNormalized(result.normalized);
    const byKey = new Map<string, any>();
    for (const q of [...result.questions, ...extra]) if (q?.key) byKey.set(q.key, q);
    const questions = [...byKey.values()];
    const status = questions.length ? "needs_talent_input" : "ready_for_admin";

    const { data, error } = await s.from("talent_rider_versions").update({ answers: merged, normalized_data: result.normalized, missing_questions: questions, normalization_source: "ai", status, talent_confirmed_at: questions.length ? null : now, updated_at: now }).eq("id", current.id).select("id,version_no,source_type,source_asset_id,source_filename,normalized_data,missing_questions,answers,normalization_source,status,is_current,updated_at").single();
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true, rider: data });
  } catch (e) {
    return NextResponse.json({ error: "Rider update failed", detail: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
