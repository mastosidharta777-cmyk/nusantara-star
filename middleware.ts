import { NextRequest, NextResponse } from "next/server";

const MUTATION_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function unauthorized(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith("/api/")) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const url = request.nextUrl.clone();
  url.pathname = "/admin/login";
  url.searchParams.set("next", request.nextUrl.pathname + request.nextUrl.search);
  return NextResponse.redirect(url);
}

function forbidden(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith("/api/")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return new NextResponse("Forbidden", { status: 403 });
}

function roleCanMutate(role: string, path: string) {
  if (role === "admin") return true;
  if (role === "viewer") return false;
  if (role === "finance") return ["/payment", "/payment-milestones", "/commercial-terms", "/deal-review", "/booking", "/settlement", "/cancellation"].some((suffix) => path.includes(suffix));
  if (role === "operations") return ["/match-action", "/proposal-sent", "/booking", "/talent-commercial-profile", "/access-link", "/operations"].some((suffix) => path.includes(suffix));
  return false;
}

export async function middleware(request: NextRequest) {
  // Keep local development frictionless, but enforce admin auth on every hosted Vercel environment, including Preview.
  if (!process.env.VERCEL_ENV) return NextResponse.next();
  if (request.nextUrl.pathname === "/admin/login" || request.nextUrl.pathname.startsWith("/api/auth/")) return NextResponse.next();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) return unauthorized(request);
  const accessToken = request.cookies.get("ns_admin_access")?.value;
  if (!accessToken) return unauthorized(request);

  const authHeaders = { apikey: anonKey, Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" };
  const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, { headers: authHeaders, cache: "no-store" });
  if (!userResponse.ok) return unauthorized(request);
  const user = await userResponse.json().catch(() => null) as { id?: string } | null;
  if (!user?.id) return unauthorized(request);

  const roleResponse = await fetch(`${supabaseUrl}/rest/v1/admin_users?user_id=eq.${encodeURIComponent(user.id)}&active=eq.true&select=role&limit=1`, { headers: authHeaders, cache: "no-store" });
  if (!roleResponse.ok) return forbidden(request);
  const roles = await roleResponse.json().catch(() => []) as Array<{ role?: string }>;
  const role = roles[0]?.role;
  if (!role) return forbidden(request);

  const isAdminApi = request.nextUrl.pathname.startsWith("/api/internal-demo/admin/");
  if (isAdminApi && MUTATION_METHODS.has(request.method) && !roleCanMutate(role, request.nextUrl.pathname)) return forbidden(request);

  if (isAdminApi && MUTATION_METHODS.has(request.method)) {
    await fetch(`${supabaseUrl}/rest/v1/audit_logs`, {
      method: "POST",
      headers: { ...authHeaders, Prefer: "return=minimal" },
      body: JSON.stringify({ actor_user_id: user.id, actor_role: role, action: `${request.method} ${request.nextUrl.pathname}`, entity_type: "api_route", metadata: { path: request.nextUrl.pathname } }),
      cache: "no-store",
    }).catch(() => null);
  }

  const headers = new Headers(request.headers);
  headers.set("x-ns-admin-verified", "1");
  headers.set("x-ns-admin-role", role);
  headers.set("x-ns-admin-user", user.id);
  return NextResponse.next({ request: { headers } });
}

export const config = { matcher: ["/admin/:path*", "/api/internal-demo/admin/:path*"] };
