import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) throw new Error("Supabase server environment is not configured");
  return createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

const parties = new Set(["buyer", "talent"]);
const milestoneTypes = new Set(["booking_fee", "deposit", "balance", "full_payment", "other"]);
const calculationTypes = new Set(["percentage", "fixed_amount", "remaining_balance"]);
const dueBases = new Set(["booking_date", "event_date", "event_completion", "invoice_date", "custom_date"]);

export async function POST(request: Request) {
  if (process.env.VERCEL_ENV === "production") return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    const body = await request.json();
    const bookingId = String(body.bookingId ?? "");
    const party = String(body.party ?? "");
    const milestoneType = String(body.milestoneType ?? "");
    const calculationType = String(body.calculationType ?? "");
    const dueBasis = String(body.dueBasis ?? "");
    const sequenceNo = Number(body.sequenceNo ?? 1);
    const dueOffsetDays = Number(body.dueOffsetDays ?? 0);
    const refundable = body.refundable === null || body.refundable === undefined ? null : Boolean(body.refundable);
    const cancellationNote = body.cancellationNote ? String(body.cancellationNote).trim() : null;
    const notes = body.notes ? String(body.notes).trim() : null;
    const customDueDate = body.customDueDate ? String(body.customDueDate) : null;
    const percentage = calculationType === "percentage" ? Number(body.percentage) : null;
    const amount = calculationType === "fixed_amount" ? Number(body.amount) : null;

    if (!bookingId || !parties.has(party) || !milestoneTypes.has(milestoneType) || !calculationTypes.has(calculationType) || !dueBases.has(dueBasis)) {
      return NextResponse.json({ error: "Invalid payment milestone data" }, { status: 400 });
    }
    if (!Number.isInteger(sequenceNo) || sequenceNo < 1 || !Number.isInteger(dueOffsetDays)) {
      return NextResponse.json({ error: "Sequence and offset must be whole numbers" }, { status: 400 });
    }
    if (calculationType === "percentage" && (!Number.isFinite(percentage) || percentage! < 0 || percentage! > 100)) {
      return NextResponse.json({ error: "Percentage must be between 0 and 100" }, { status: 400 });
    }
    if (calculationType === "fixed_amount" && (!Number.isFinite(amount) || amount! < 0)) {
      return NextResponse.json({ error: "Amount must be zero or greater" }, { status: 400 });
    }
    if (dueBasis === "custom_date" && !customDueDate) {
      return NextResponse.json({ error: "Custom due date is required" }, { status: 400 });
    }

    const supabase = getServerClient();
    const bookingResult = await supabase.from("bookings").select("id").eq("id", bookingId).maybeSingle();
    if (bookingResult.error) throw new Error(bookingResult.error.message);
    if (!bookingResult.data) return NextResponse.json({ error: "Booking not found" }, { status: 404 });

    const { data, error } = await supabase
      .from("payment_milestones")
      .insert({
        booking_id: bookingId,
        party,
        milestone_type: milestoneType,
        sequence_no: sequenceNo,
        calculation_type: calculationType,
        percentage,
        amount,
        due_basis: dueBasis,
        due_offset_days: dueOffsetDays,
        custom_due_date: dueBasis === "custom_date" ? customDueDate : null,
        refundable,
        cancellation_note: cancellationNote,
        status: "planned",
        notes,
      })
      .select("*")
      .single();

    if (error) return NextResponse.json({ error: "Failed to save milestone", detail: error.message }, { status: 400 });
    return NextResponse.json({ milestone: data });
  } catch (error) {
    return NextResponse.json({ error: "Failed to save milestone", detail: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
