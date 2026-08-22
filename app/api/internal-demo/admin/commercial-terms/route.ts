import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const calculationTypes = new Set(["percentage", "fixed_amount", "remaining_balance"]);
const dueBases = new Set(["booking_date", "event_date", "event_completion", "invoice_date", "custom_date"]);
const milestoneTypes = new Set(["booking_fee", "deposit", "balance", "full_payment", "other"]);

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

function parseSchedule(value: unknown) {
  if (!Array.isArray(value)) return null;
  const rows = [];
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
    if (dueBasis === "custom_date" && !customDueDate) return null;

    rows.push({
      milestone_type: milestoneType,
      sequence_no: index + 1,
      calculation_type: calculationType,
      percentage: calculationType === "percentage" ? percentage : null,
      amount: calculationType === "fixed_amount" ? amount : null,
      due_basis: dueBasis,
      due_offset_days: dueOffsetDays,
      custom_due_date: customDueDate,
      refundable,
      cancellation_note: typeof row?.cancellation_note === "string" ? row.cancellation_note : null,
      notes: typeof row?.notes === "string" ? row.notes : null,
    });
  }
  return rows;
}

export async function POST(request: Request) {
  if (process.env.VERCEL_ENV === "production") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

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

    if (
      !briefId || !talentId || buyerPrice === null || talentPayable === null || directCosts === null || taxesAndPaymentFees === null ||
      buyerPrice < 0 || talentPayable < 0 || directCosts < 0 || taxesAndPaymentFees < 0 || !buyerSchedule || !talentSchedule
    ) {
      return NextResponse.json({ error: "Invalid deal sheet payload" }, { status: 400 });
    }

    if (buyerPrice < talentPayable + directCosts + taxesAndPaymentFees) {
      return NextResponse.json({ error: "Buyer price must cover talent payable, direct costs, and taxes/payment fees" }, { status: 409 });
    }

    if (status === "agreed") {
      if (buyerPrice <= 0 || talentPayable <= 0) {
        return NextResponse.json({ error: "Buyer price and talent fee must be greater than zero before the deal can be locked" }, { status: 409 });
      }
      if (buyerSchedule.length === 0 || talentSchedule.length === 0) {
        return NextResponse.json({ error: "Buyer and talent payment schedules must both be defined before the deal can be locked" }, { status: 409 });
      }
    }

    const supabase = getServerClient();
    const [{ data: brief, error: briefError }, { data: selection, error: selectionError }] = await Promise.all([
      supabase.from("briefs").select("id,status").eq("id", briefId).single(),
      supabase.from("buyer_selections").select("talent_id,status").eq("brief_id", briefId).eq("status", "selected").single(),
    ]);

    if (briefError || !brief) return NextResponse.json({ error: "Brief not found" }, { status: 404 });
    if (selectionError || !selection || selection.talent_id !== talentId) {
      return NextResponse.json({ error: "Talent is not the buyer-selected talent" }, { status: 409 });
    }
    if (!["proposal_sent", "buyer_selected", "terms_agreed"].includes(brief.status)) {
      return NextResponse.json({ error: "Brief is not ready for a deal sheet" }, { status: 409 });
    }

    const now = new Date().toISOString();
    const { error: upsertError } = await supabase.from("commercial_terms").upsert(
      {
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
      },
      { onConflict: "brief_id" },
    );
    if (upsertError) throw new Error(upsertError.message);

    const nextStatus = status === "agreed" ? "terms_agreed" : "buyer_selected";
    const { error: briefUpdateError } = await supabase.from("briefs").update({ status: nextStatus }).eq("id", briefId);
    if (briefUpdateError) throw new Error(briefUpdateError.message);

    return NextResponse.json({ ok: true, briefId, talentId, status, briefStatus: nextStatus });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown error";
    console.error("Deal sheet action failed", detail);
    return NextResponse.json({ error: "Deal sheet action failed", detail }, { status: 500 });
  }
}
