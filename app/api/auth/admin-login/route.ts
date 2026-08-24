import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const email = typeof body?.email === "string" ? body.email.trim() : "";
    const password = typeof body?.password === "string" ? body.password : "";
    if (!email || !password) return NextResponse.json({ error: "Email dan password wajib diisi" }, { status: 400 });

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !anonKey) return NextResponse.json({ error: "Auth belum dikonfigurasi" }, { status: 500 });

    const auth = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await auth.auth.signInWithPassword({ email, password });
    if (error || !data.session || !data.user) return NextResponse.json({ error: "Login gagal" }, { status: 401 });

    const roleResponse = await fetch(
      `${url}/rest/v1/admin_users?user_id=eq.${encodeURIComponent(data.user.id)}&active=eq.true&select=role&limit=1`,
      {
        headers: {
          apikey: anonKey,
          Authorization: `Bearer ${data.session.access_token}`,
          "Content-Type": "application/json",
        },
        cache: "no-store",
      },
    );
    const roles = roleResponse.ok ? await roleResponse.json().catch(() => []) as Array<{ role?: string }> : [];
    if (!roles[0]?.role) {
      await auth.auth.signOut().catch(() => undefined);
      return NextResponse.json({ error: "Akun ini tidak memiliki akses admin aktif" }, { status: 403 });
    }

    const response = NextResponse.json({ ok: true, role: roles[0].role });
    response.cookies.set("ns_admin_access", data.session.access_token, {
      httpOnly: true,
      secure: process.env.VERCEL_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: Math.max(60, data.session.expires_in ?? 3600),
    });
    return response;
  } catch (error) {
    return NextResponse.json({ error: "Login gagal", detail: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
