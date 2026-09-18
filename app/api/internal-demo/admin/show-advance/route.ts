import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function getServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) throw new Error("Supabase server environment is not configured");
  return createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

function cleanString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const bookingId = cleanString(body?.bookingId);
    const action = cleanString(body?.action);
    if (!bookingId || !action) return NextResponse.json({ error: "Invalid Show Advance payload" }, { status: 400 });

    if (process.env.VERCEL_ENV && request.headers.get("x-ns-admin-verified") !== "1") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (action !== "review") {
      return NextResponse.json({ error: "Admin data entry/confirmation is disabled for Show Advance" }, { status: 409 });
    }

    const supabase = getServerClient();
    const { data, error } = await supabase.rpc("ns_review_booking_advance_v2", { p_booking_id: bookingId });
    if (error) return NextResponse.json({ error: error.message }, { status: 409 });
    return NextResponse.json(data ?? { ok: true });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown error";
    console.error("Show Advance admin review failed", detail);
    return NextResponse.json({ error: "Show Advance review failed", detail }, { status: 500 });
  }
}
