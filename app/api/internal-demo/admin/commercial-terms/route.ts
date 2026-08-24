import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import { forwardOnlyBriefStatus } from "@/lib/brief-status";

export const runtime = "nodejs";

const calculationTypes = new Set(["percentage", "fixed_amount", "remaining_balance"]);
const dueBases = new Set(["booking_date", "event_date", "event_completion", "invoice_date", "custom_date"]);
const milestoneTypes = new Set(["booking_fee", "deposit", "balance", "full_payment", "other"]);

type ParsedMilestone = {
  milestone_type: string;
  sequence_no: number;
  calculation_type: "percentage" | "fixed_amount" | "remaining_balance";
  percentage: number | null;
  amount: number | null;
  due_basis: string;
  due_offset_days: number;
  custom_due_date: string | null;
  refundable: boolean | null;
  cancellation_note: string | null;
  notes: string | null;
};

function getServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) throw new Error("Supabase server environment is not configured");
  return createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

function parseAmount(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const amount = typeof value === "number" ? value : Number(value);
  return Number.isFinite(amount) ? amount : null;
}

function isIsoDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function parseSchedule(value: unknown): ParsedMilestone[] | null {
  if (!Array.isArray(value)) return null;
  const rows: ParsedMilestone[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const row = value[index] as Record<string, unknown>;
    const milestoneType = typeof row?.milestone_type === "string" ? row.milestone_type : "";
    const calculationType = typeof row?.calculation_type === "string" ? row.calculation_type : "";
    const dueBasis = typeof row?.due_basis === "string" ? row.due_basis : "";
    const percentage = row?.percentage === null || row?.percentage === undefined ? null : Number(row.percentage);
    const amount = row?.amount === null || row?.amount === undefined ? null : Number(row.amount);
    const dueOffsetDays = Number(row?.due_offset_days ?? 0);
    const customDueDate = typeof row?.custom_due_date === "string" && row.custom_due_date ? row.custom_due_date : null;
    const refundable = typeof row?.refundable === "boolean" ? row.refundable : null;

    if (!milestoneTypes.has(milestoneType) || !calculationTypes.has(calculationType) || !dueBases.has(dueBasis)) return null;
    if (!Number.isInteger(dueOffsetDays)) return null;
    if (calculationType === "percentage" && (percentage === null || !Number.isFinite(percentage) || percentage < 0 || percentage > 100)) return null;
    if (calculationType === "fixed_amount" && (amount === null || !Number.isFinite(amount) || amount < 0)) return null;
    if (calculationType === "remaining_balance" && (percentage !== null || amount !== null)) return null;
    if (dueBasis === "custom_date") {
      if (!customDueDate || !isIsoDate(customDueDate)) return null;
    } else if (customDueDate !== null) {
      return null;
    }

    rows.push({
      milestone_type: milestoneType,
      sequence_no: index + 1,
      calculation_type: calculationType as ParsedMilestone["calculation_type"],
      percentage: calculationType === "percentage" ? percentage : null,
      amount: calculationType === "fixed_amount" ? amount : null,
      due_basis: dueBasis,
      due_offset_days: dueOffsetDays,
      custom_due_date: dueBasis === "custom_date" ? customDueDate : null,
      refundable,
      cancellation_note: typeof row?.cancellation_note === "string" ? row.cancellation_note : null,
      notes: typeof row?.notes === "string" ? row.notes : null,
    });
  }
  return rows;
}

function validateSchedule(rows: ParsedMilestone[], total: number, requireComplete: boolean) {
  let used = 0;
  let remainingSeen = false;

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    if (row.calculation_type === "remaining_balance") {
      if (remainingSeen) return "Only one remaining-balance milestone is allowed";
      if (index !== rows.length - 1) return "Remaining-balance milestone must be the final payment stage";
      remainingSeen = true;
      const remainder = total - used;
      if (remainder < 0) return "Payment schedule exceeds the deal total";
      if (requireComplete && remainder <= 0) return "Final remaining-balance milestone must have a positive amount";
      used = total;
      continue;
    }

    const resolved = row.calculation_type === "percentage" ? Math.round(total * ((row.percentage ?? 0) / 100)) : row.amount ?? 0;
    if (requireComplete && resolved <= 0) return "Every agreed payment stage must have a positive amount";
    used += resolved;
    if (used > total) return "Payment schedule exceeds the deal total";
  }

  if (requireComplete && used !== total) return "Agreed payment schedule must cover exactly 100% of the deal total";
  return null;
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const briefId = typeof body?.briefId === "string" ? body.briefId : "";
    const talentId = typeof body?.talentId === "string" ? body.talentId : "";
    const buyerPrice = parseAmount(body?.buyerPrice);
    const talentPayable = parseAmount(body?.talentPayable);
    const directCosts = parseAmount(body?.directCosts ?? 0);
    const taxesAndPaymentFees = parseAmount(body?.taxesAndPaymentFees ?? 0);
    const buyerSchedule = parseSchedule(body?.buyerPaymentSchedule);
    const talentSchedule = parseSchedule(body?.talentPaymentSchedule);
    const status = body?.status === "agreed" ? "agreed" : "draft";

    if (!briefId || !talentId || buyerPrice === null || talentPayable === null || directCosts === null || taxesAndPaymentFees === null || buyerPrice < 0 || talentPayable < 0 || directCosts < 0 || taxesAndPaymentFees < 0 || !buyerSchedule || !talentSchedule) {
      return NextResponse.json({ error: "Invalid deal sheet payload" }, { status: 400 });
    }

    if (buyerPrice < talentPayable + directCosts + taxesAndPaymentFees) return NextResponse.json({ error: "Buyer price must cover talent payable, direct costs, and taxes/payment fees" }, { status: 409 });

    const buyerScheduleError = validateSchedule(buyerSchedule, buyerPrice, status === "agreed");
    if (buyerScheduleError) return NextResponse.json({ error: `Buyer schedule invalid: ${buyerScheduleError}` }, { status: 409 });
    const talentScheduleError = validateSchedule(talentSchedule, talentPayable, status === "agreed");
    if (talentScheduleError) return NextResponse.json({ error: `Talent schedule invalid: ${talentScheduleError}` }, { status: 409 });

    if (status === "agreed") {
      if (buyerPrice <= 0 || talentPayable <= 0) return NextResponse.json({ error: "Buyer price and talent fee must be greater than zero before the deal can be locked" }, { status: 409 });
      if (buyerSchedule.length === 0 || talentSchedule.length === 0) return NextResponse.json({ error: "Buyer and talent payment schedules must both be defined before the deal can be locked" }, { status: 409 });
    }

    const supabase = getServerClient();
    const [{ data: brief, error: briefError }, { data: selection, error: selectionError }, { data: existingTerms, error: existingTermsError }] = await Promise.all([
      supabase.from("briefs").select("id,status").eq("id", briefId).single(),
      supabase.from("buyer_selections").select("talent_id,status").eq("brief_id", briefId).eq("status", "selected").single(),
      supabase.from("commercial_terms").select("status").eq("brief_id", briefId).maybeSingle(),
    ]);

    if (briefError || !brief) return NextResponse.json({ error: "Brief not found" }, { status: 404 });
    if (selectionError || !selection || selection.talent_id !== talentId) return NextResponse.json({ error: "Talent is not the buyer-selected talent" }, { status: 409 });
    if (existingTermsError) throw new Error(existingTermsError.message);
    if (existingTerms?.status === "agreed") return NextResponse.json({ error: "Deal Sheet is already locked and cannot be edited" }, { status: 409 });
    if (!["proposal_sent", "buyer_selected"].includes(brief.status)) return NextResponse.json({ error: "Brief is not ready for an editable Deal Sheet" }, { status: 409 });

    const now = new Date().toISOString();
    const { error: upsertError } = await supabase.from("commercial_terms").upsert({
      brief_id: briefId,
      talent_id: talentId,
      buyer_price: buyerPrice,
      talent_payable: talentPayable,
      direct_costs: directCosts,
      taxes_and_payment_fees: taxesAndPaymentFees,
      buyer_payment_schedule: buyerSchedule,
      talent_payment_schedule: talentSchedule,
      buyer_payment_terms: null,
      talent_payment_terms: null,
      payment_terms: null,
      cancellation_terms: typeof body?.cancellationTerms === "string" ? body.cancellationTerms : null,
      rider_notes: typeof body?.riderNotes === "string" ? body.riderNotes : null,
      special_conditions: typeof body?.specialConditions === "string" ? body.specialConditions : null,
      notes: typeof body?.notes === "string" ? body.notes : null,
      status,
      agreed_at: status === "agreed" ? now : null,
      updated_at: now,
    }, { onConflict: "brief_id" });
    if (upsertError) throw new Error(upsertError.message);

    const proposedStatus = status === "agreed" ? "terms_agreed" : "buyer_selected";
    const nextStatus = forwardOnlyBriefStatus(brief.status, proposedStatus);
    if (nextStatus !== brief.status) {
      const { error: briefUpdateError } = await supabase.from("briefs").update({ status: nextStatus }).eq("id", briefId).eq("status", brief.status);
      if (briefUpdateError) throw new Error(briefUpdateError.message);
    }

    return NextResponse.json({ ok: true, briefId, talentId, status, briefStatus: nextStatus });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown error";
    console.error("Deal sheet action failed", detail);
    return NextResponse.json({ error: "Deal sheet action failed", detail }, { status: 500 });
  }
}
