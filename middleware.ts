import { NextRequest, NextResponse } from "next/server";

const MUTATION_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const STATEFUL_QA_PATHS = new Set([
  "/api/internal-demo/atomic-workflow-smoke",
  "/api/internal-demo/booking-smoke",
  "/api/internal-demo/cancellation-smoke",
  "/api/internal-demo/db-smoke",
  "/api/internal-demo/deal-copilot-smoke",
  "/api/internal-demo/direct-inquiry-smoke",
  "/api/internal-demo/onboarding-approval-smoke",
  "/api/internal-demo/operations-smoke",
  "/api/internal-demo/public-brief-smoke",
  "/api/internal-demo/secure-booking-smoke",
  "/api/internal-demo/smart-proposal-smoke",
  "/api/internal-demo/talent-offer-transition-smoke",
]);

function sessionCookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    secure: Boolean(process.env.VERCEL_ENV),
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  };
}

function unauthorized(request: NextRequest) {
  const response = request.nextUrl.pathname.startsWith("/api/")
    ? NextResponse.json({ error: "Sesi admin berakhir. Silakan masuk kembali." }, { status: 401 })
    : (() => {
        const url = request.nextUrl.clone();
        url.pathname = "/admin/login";
        url.searchParams.set("next", request.nextUrl.pathname + request.nextUrl.search);
        return NextResponse.redirect(url);
      })();
  response.cookies.set("ns_admin_access", "", sessionCookieOptions(0));
  response.cookies.set("ns_admin_refresh", "", sessionCookieOptions(0));
  return response;
}

async function refreshAdminSession(supabaseUrl: string, anonKey: string, refreshToken: string) {
  try {
    const response = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=refresh_token`, {
      method: "POST",
      headers: { apikey: anonKey, "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken }),
      cache: "no-store",
    });
    if (!response.ok) return null;
    return await response.json().catch(() => null) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
    } | null;
  } catch {
    return null;
  }
}

function forbidden(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith("/api/")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return new NextResponse("Forbidden", { status: 403 });
}

function statefulQaIsSafe() {
  if (process.env.VERCEL_ENV === "production") return false;
  if (process.env.QA_MUTATIONS_ENABLED !== "true") return false;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const qaProjectRef = (process.env.QA_SUPABASE_PROJECT_REF ?? "").trim();
  if (!qaProjectRef) return false;
  try {
    return new URL(supabaseUrl).hostname === `${qaProjectRef}.supabase.co`;
  } catch {
    return false;
  }
}

function roleCanMutate(role: string, path: string) {
  if (role === "admin") return true;
  if (role === "viewer") return false;
  if (role === "finance") return ["/proposal-sent", "/payment", "/payment-milestones", "/commercial-terms", "/deal-review", "/booking", "/settlement", "/cancellation"].some((suffix) => path.includes(suffix));
  if (role === "operations") return ["/match-action", "/talent-commercial-profile", "/access-link", "/operations"].some((suffix) => path.includes(suffix));
  return false;
}

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;

  if (STATEFUL_QA_PATHS.has(path)) {
    if (!statefulQaIsSafe()) {
      return NextResponse.json({
        error: "Stateful QA is disabled until Preview uses an explicitly approved QA Supabase project.",
      }, { status: 412 });
    }
    return NextResponse.next();
  }

  if (!process.env.VERCEL_ENV) return NextResponse.next();
  if (path === "/admin/login" || path.startsWith("/api/auth/")) return NextResponse.next();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) return unauthorized(request);
  let accessToken = request.cookies.get("ns_admin_access")?.value;
  const refreshToken = request.cookies.get("ns_admin_refresh")?.value;
  let refreshedSession: Awaited<ReturnType<typeof refreshAdminSession>> = null;

  let userResponse = accessToken
    ? await fetch(`${supabaseUrl}/auth/v1/user`, {
        headers: { apikey: anonKey, Authorization: `Bearer ${accessToken}` },
        cache: "no-store",
      })
    : null;

  if ((!userResponse || !userResponse.ok) && refreshToken) {
    refreshedSession = await refreshAdminSession(supabaseUrl, anonKey, refreshToken);
    accessToken = refreshedSession?.access_token;
    userResponse = accessToken
      ? await fetch(`${supabaseUrl}/auth/v1/user`, {
          headers: { apikey: anonKey, Authorization: `Bearer ${accessToken}` },
          cache: "no-store",
        })
      : null;
  }

  if (!accessToken || !userResponse?.ok) return unauthorized(request);
  const user = await userResponse.json().catch(() => null) as { id?: string } | null;
  if (!user?.id) return unauthorized(request);
  const authHeaders = { apikey: anonKey, Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" };

  const roleResponse = await fetch(`${supabaseUrl}/rest/v1/admin_users?user_id=eq.${encodeURIComponent(user.id)}&active=eq.true&select=role&limit=1`, { headers: authHeaders, cache: "no-store" });
  if (!roleResponse.ok) return forbidden(request);
  const roles = await roleResponse.json().catch(() => []) as Array<{ role?: string }>;
  const role = roles[0]?.role;
  if (!role) return forbidden(request);

  const isAdminApi = path.startsWith("/api/internal-demo/admin/");
  if (isAdminApi && MUTATION_METHODS.has(request.method) && !roleCanMutate(role, path)) return forbidden(request);

  if (isAdminApi && MUTATION_METHODS.has(request.method)) {
    let auditResponse: Response | null = null;
    try {
      auditResponse = await fetch(`${supabaseUrl}/rest/v1/audit_logs`, {
        method: "POST",
        headers: { ...authHeaders, Prefer: "return=minimal" },
        body: JSON.stringify({ actor_user_id: user.id, actor_role: role, action: `${request.method} ${path}`, entity_type: "api_route", metadata: { path } }),
        cache: "no-store",
      });
    } catch {
      auditResponse = null;
    }
    if (!auditResponse?.ok) return NextResponse.json({ error: "Audit logging unavailable" }, { status: 503 });
  }

  const headers = new Headers(request.headers);
  headers.set("x-ns-admin-verified", "1");
  headers.set("x-ns-admin-role", role);
  headers.set("x-ns-admin-user", user.id);
  const response = NextResponse.next({ request: { headers } });
  if (refreshedSession?.access_token) {
    response.cookies.set(
      "ns_admin_access",
      refreshedSession.access_token,
      sessionCookieOptions(Math.max(60, refreshedSession.expires_in ?? 3600)),
    );
    const nextRefreshToken = refreshedSession.refresh_token || refreshToken;
    if (nextRefreshToken) {
      response.cookies.set("ns_admin_refresh", nextRefreshToken, sessionCookieOptions(60 * 60 * 24 * 30));
    }
  }
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export const config = {
  matcher: [
    "/admin/:path*",
    "/api/internal-demo/admin/:path*",
    "/api/internal-demo/atomic-workflow-smoke",
    "/api/internal-demo/booking-smoke",
    "/api/internal-demo/cancellation-smoke",
    "/api/internal-demo/db-smoke",
    "/api/internal-demo/deal-copilot-smoke",
    "/api/internal-demo/direct-inquiry-smoke",
    "/api/internal-demo/onboarding-approval-smoke",
    "/api/internal-demo/operations-smoke",
    "/api/internal-demo/public-brief-smoke",
    "/api/internal-demo/secure-booking-smoke",
    "/api/internal-demo/smart-proposal-smoke",
    "/api/internal-demo/talent-offer-transition-smoke",
  ],
};
