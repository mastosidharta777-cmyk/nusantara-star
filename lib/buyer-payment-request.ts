import { createClient } from "@supabase/supabase-js";

type PaymentInstructions = {
  method: "bank_transfer" | "payment_link" | "other";
  provider_name: string;
  destination: string;
  account_name: string | null;
  notes: string | null;
};

type PaymentRequestSnapshot = {
  schema_version: 1;
  request_reference: string;
  booking_id: string;
  deal_id: string;
  payment_milestone_id: string;
  payment_type: string;
  currency: string;
  amount: number;
  issued_at: string;
  due_date: string;
  milestone: {
    sequence_no: number;
    milestone_type: string;
    calculation_type: string;
    percentage: number | null;
    fixed_amount: number | null;
    due_basis: string;
    due_offset_days: number;
    custom_due_date: string | null;
    refundable: boolean | null;
    cancellation_note: string | null;
    notes: string | null;
  };
  event: {
    talent_id?: string;
    talent_name?: string;
    event_type?: string | null;
    event_date?: string | null;
    city?: string | null;
    venue?: string | null;
  };
  accepted_terms_snapshot: Record<string, unknown>;
};

function getServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) throw new Error("Supabase server environment is not configured");
  return createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function parseInstructions(value: unknown): PaymentInstructions | null {
  if (!isObject(value)) return null;
  const method = value.method;
  const providerName = typeof value.provider_name === "string" ? value.provider_name.trim() : "";
  const destination = typeof value.destination === "string" ? value.destination.trim() : "";
  if (!["bank_transfer", "payment_link", "other"].includes(String(method)) || !providerName || !destination) return null;
  return {
    method: method as PaymentInstructions["method"],
    provider_name: providerName,
    destination,
    account_name: typeof value.account_name === "string" && value.account_name.trim() ? value.account_name.trim() : null,
    notes: typeof value.notes === "string" && value.notes.trim() ? value.notes.trim() : null,
  };
}

function parseSnapshot(value: unknown): PaymentRequestSnapshot | null {
  if (!isObject(value) || value.schema_version !== 1 || !isObject(value.milestone) || !isObject(value.event) || !isObject(value.accepted_terms_snapshot)) return null;
  if (typeof value.request_reference !== "string" || typeof value.booking_id !== "string" || typeof value.deal_id !== "string" || typeof value.payment_milestone_id !== "string") return null;
  if (typeof value.payment_type !== "string" || typeof value.currency !== "string" || typeof value.issued_at !== "string" || typeof value.due_date !== "string") return null;
  const amount = Number(value.amount);
  if (!Number.isSafeInteger(amount) || amount <= 0) return null;
  return value as unknown as PaymentRequestSnapshot;
}

export async function loadBuyerPaymentRequest(paymentId: string) {
  const supabase = getServerClient();
  const { data: payment, error: paymentError } = await supabase
    .from("payments")
    .select("id,booking_id,payment_milestone_id,payment_type,amount,currency,status,provider,provider_reference,paid_at,request_reference,request_issued_at,request_due_date,request_snapshot,payment_instructions_snapshot")
    .eq("id", paymentId)
    .maybeSingle();
  if (paymentError || !payment || !["buyer_deposit", "buyer_balance", "buyer_full_payment"].includes(payment.payment_type ?? "")) return null;
  if (!["pending", "paid"].includes(payment.status)) return null;

  const snapshot = parseSnapshot(payment.request_snapshot);
  const instructions = parseInstructions(payment.payment_instructions_snapshot);
  if (!snapshot || !instructions) return null;

  const { data: booking, error: bookingError } = await supabase
    .from("bookings")
    .select("id,deal_id,buyer_terms_accepted_at,buyer_terms_accepted_deal_id,buyer_terms_acceptance_source,buyer_terms_snapshot,buyer_terms_accepted_snapshot,status")
    .eq("id", payment.booking_id)
    .maybeSingle();
  if (bookingError || !booking || !booking.deal_id) return null;

  const accepted = Boolean(
    booking.buyer_terms_accepted_at
    && booking.buyer_terms_accepted_deal_id === booking.deal_id
    && booking.buyer_terms_acceptance_source === "signed_buyer_link"
    && booking.buyer_terms_snapshot
    && JSON.stringify(booking.buyer_terms_accepted_snapshot ?? null) === JSON.stringify(booking.buyer_terms_snapshot)
  );
  if (!accepted) return null;

  const requestValid =
    snapshot.request_reference === payment.request_reference
    && snapshot.booking_id === booking.id
    && snapshot.deal_id === booking.deal_id
    && snapshot.payment_milestone_id === payment.payment_milestone_id
    && snapshot.payment_type === payment.payment_type
    && snapshot.currency === payment.currency
    && snapshot.amount === Number(payment.amount)
    && snapshot.due_date === payment.request_due_date
    && JSON.stringify(snapshot.accepted_terms_snapshot) === JSON.stringify(booking.buyer_terms_snapshot);
  if (!requestValid) return null;

  return {
    payment: {
      id: payment.id,
      status: payment.status,
      amount: Number(payment.amount),
      currency: payment.currency,
      request_reference: payment.request_reference as string,
      request_issued_at: payment.request_issued_at as string,
      request_due_date: payment.request_due_date as string,
      paid_at: payment.paid_at as string | null,
      provider: payment.provider as string | null,
      provider_reference: payment.provider_reference as string | null,
    },
    snapshot,
    instructions,
    bookingStatus: booking.status as string,
  };
}
