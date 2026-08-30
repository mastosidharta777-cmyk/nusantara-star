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

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const bookingId = typeof body?.bookingId === "string" ? body.bookingId : "";
    const amount = Number(body?.amount ?? 0);
    const provider = typeof body?.provider === "string" ? body.provider.trim() : "";
    const providerReference = typeof body?.providerReference === "string" ? body.providerReference.trim() : "";
    const idempotencyKey = typeof body?.idempotencyKey === "string" ? body.idempotencyKey.trim() : "";
    const notes = typeof body?.notes === "string" && body.notes.trim() ? body.notes.trim() : null;
    if (!bookingId || !Number.isSafeInteger(amount) || amount <= 0 || !providerReference || !idempotencyKey) {
      return NextResponse.json({ error: "Booking, amount, payment evidence, and idempotency key are required" }, { status: 400 });
    }

    const supabase = getServerClient();
    if (!(await commercialIntegrityReady(supabase))) {
      return NextResponse.json({ error: "Commercial integrity database cutover is not complete" }, { status: 503 });
    }
    const { data, error } = await supabase.rpc("ns_record_talent_settlement_v1", {
      p_booking_id: bookingId,
      p_amount: amount,
      p_provider: provider,
      p_provider_reference: providerReference,
      p_idempotency_key: idempotencyKey,
      p_paid_at: new Date().toISOString(),
      p_notes: notes,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 409 });
    return NextResponse.json({ ok: true, settlement: data });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown error";
    console.error("Talent settlement action failed", detail);
    return NextResponse.json({ error: "Talent settlement action failed", detail }, { status: 500 });
  }
}
