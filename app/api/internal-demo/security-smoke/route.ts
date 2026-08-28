import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import { signAccessToken, verifyAccessToken } from "@/lib/signed-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) throw new Error("Supabase server environment is not configured");
  return createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function GET() {
  if (process.env.VERCEL_ENV === "production") return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    const subjectId = "security-smoke";
    const token = signAccessToken("buyer_proposal", subjectId, new Date(Date.now() + 60_000));
    const validSignedLink = verifyAccessToken(token, "buyer_proposal", subjectId);
    const wrongScopeRejected = !verifyAccessToken(token, "talent_offer", subjectId);
    const wrongSubjectRejected = !verifyAccessToken(token, "buyer_proposal", "other-subject");

    const supabase = getServerClient();
    const [admins, audit, payments] = await Promise.all([
      supabase.from("admin_users").select("user_id,role,active").limit(1),
      supabase.from("audit_logs").select("id,action,created_at").limit(1),
      supabase.from("payments").select("id,idempotency_key").limit(1),
    ]);

    if (admins.error) throw new Error(`admin_users unavailable: ${admins.error.message}`);
    if (audit.error) throw new Error(`audit_logs unavailable: ${audit.error.message}`);
    if (payments.error) throw new Error(`payments idempotency column unavailable: ${payments.error.message}`);

    return NextResponse.json({
      ok: true,
      checks: {
        signedLinkValid: validSignedLink,
        wrongScopeRejected,
        wrongSubjectRejected,
        adminRbacSchemaReady: true,
        auditLogSchemaReady: true,
        financialIdempotencySchemaReady: true,
      },
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: "Security smoke failed", detail: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
