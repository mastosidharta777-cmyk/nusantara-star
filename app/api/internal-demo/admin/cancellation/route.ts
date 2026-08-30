import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import { commercialIntegrityReady } from "@/lib/commercial-integrity";

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

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const action = text(body?.action);
    const supabase = getServerClient();
    if (!(await commercialIntegrityReady(supabase))) {
      return NextResponse.json({ error: "Commercial integrity database cutover is not complete" }, { status: 503 });
    }

    if (action === "approve_case") {
      const bookingId = text(body?.bookingId);
      const initiatedBy = text(body?.initiatedBy);
      const reason = text(body?.reason);
      const buyerRefundAmount = Number(body?.buyerRefundAmount ?? -1);
      const talentDueAmount = Number(body?.talentDueAmount ?? -1);
      const decisionNotes = text(body?.decisionNotes);
      const idempotencyKey = text(body?.idempotencyKey);
      if (!bookingId || !initiatedBy || !reason || !Number.isSafeInteger(buyerRefundAmount) || buyerRefundAmount < 0 || !Number.isSafeInteger(talentDueAmount) || talentDueAmount < 0 || !idempotencyKey) {
        return NextResponse.json({ error: "Data keputusan pembatalan belum lengkap" }, { status: 400 });
      }
      const { data, error } = await supabase.rpc("ns_approve_cancellation_v1", {
        p_booking_id: bookingId,
        p_initiated_by: initiatedBy,
        p_reason: reason,
        p_buyer_refund_amount: buyerRefundAmount,
        p_talent_due_amount: talentDueAmount,
        p_decision_notes: decisionNotes || null,
        p_idempotency_key: idempotencyKey,
      });
      if (error) return NextResponse.json({ error: error.message }, { status: 409 });
      return NextResponse.json({ ok: true, cancellationCase: data });
    }

    if (action === "record_buyer_refund") {
      const caseId = text(body?.caseId);
      const paymentId = text(body?.paymentId);
      const amount = Number(body?.amount ?? 0);
      const provider = text(body?.provider);
      const providerReference = text(body?.providerReference);
      const idempotencyKey = text(body?.idempotencyKey);
      const notes = text(body?.notes);
      if (!caseId || !paymentId || !Number.isSafeInteger(amount) || amount <= 0 || !providerReference || !idempotencyKey) {
        return NextResponse.json({ error: "Data refund klien belum lengkap" }, { status: 400 });
      }
      const { data, error } = await supabase.rpc("ns_record_buyer_refund_v1", {
        p_case_id: caseId,
        p_payment_id: paymentId,
        p_amount: amount,
        p_provider: provider || null,
        p_provider_reference: providerReference,
        p_idempotency_key: idempotencyKey,
        p_refunded_at: new Date().toISOString(),
        p_notes: notes || null,
      });
      if (error) return NextResponse.json({ error: error.message }, { status: 409 });
      return NextResponse.json({ ok: true, refund: data });
    }

    if (action === "reverse_talent_settlement") {
      const caseId = text(body?.caseId);
      const settlementId = text(body?.settlementId);
      const amount = Number(body?.amount ?? 0);
      const provider = text(body?.provider);
      const providerReference = text(body?.providerReference);
      const idempotencyKey = text(body?.idempotencyKey);
      const notes = text(body?.notes);
      if (!caseId || !settlementId || !Number.isSafeInteger(amount) || amount <= 0 || !providerReference || !idempotencyKey) {
        return NextResponse.json({ error: "Data reversal pembayaran talent belum lengkap" }, { status: 400 });
      }
      const { data, error } = await supabase.rpc("ns_reverse_talent_settlement_v1", {
        p_case_id: caseId,
        p_settlement_id: settlementId,
        p_amount: amount,
        p_provider: provider || null,
        p_provider_reference: providerReference,
        p_idempotency_key: idempotencyKey,
        p_reversed_at: new Date().toISOString(),
        p_notes: notes || null,
      });
      if (error) return NextResponse.json({ error: error.message }, { status: 409 });
      return NextResponse.json({ ok: true, reversal: data });
    }

    if (action === "finalize_case") {
      const caseId = text(body?.caseId);
      if (!caseId) return NextResponse.json({ error: "ID kasus pembatalan wajib diisi" }, { status: 400 });
      const { data, error } = await supabase.rpc("ns_finalize_cancellation_v1", { p_case_id: caseId });
      if (error) return NextResponse.json({ error: error.message }, { status: 409 });
      return NextResponse.json({ ok: true, cancellationCase: data });
    }

    return NextResponse.json({ error: "Aksi pembatalan tidak dikenal" }, { status: 400 });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown error";
    console.error("Cancellation action failed", detail);
    return NextResponse.json({ error: "Proses pembatalan gagal" }, { status: 500 });
  }
}
