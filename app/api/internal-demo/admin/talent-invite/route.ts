import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import { signAccessToken } from "@/lib/signed-access";

export const runtime = "nodejs";

const CATEGORIES = ["Solo", "Duo/Trio", "Band", "DJ", "MC/Host", "Speaker", "Traditional/Ethnic", "Specialty Performer"] as const;

function getServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase server environment is not configured");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function clean(value: unknown, max = 180) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export async function POST(request: Request) {
  try {
    if (process.env.VERCEL_ENV && request.headers.get("x-ns-admin-verified") !== "1") {
      return NextResponse.json({ error: "Akses admin diperlukan" }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const name = clean(body?.name);
    const category = clean(body?.category, 80);
    const contactName = clean(body?.contactName);
    const whatsapp = clean(body?.whatsapp, 60);
    const email = clean(body?.email, 180).toLowerCase();

    if (!name) return NextResponse.json({ error: "Nama talent wajib diisi" }, { status: 400 });
    if (!CATEGORIES.includes(category as (typeof CATEGORIES)[number])) {
      return NextResponse.json({ error: "Pilih kategori talent yang tersedia" }, { status: 400 });
    }
    if (!whatsapp && !email) {
      return NextResponse.json({ error: "Isi minimal WhatsApp atau email talent/manajer" }, { status: 400 });
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "Format email belum benar" }, { status: 400 });
    }

    const supabase = getServerClient();
    const { data: existing, error: existingError } = await supabase
      .from("talents")
      .select("id,name,status,onboarding_status")
      .ilike("name", name)
      .neq("status", "inactive")
      .limit(1)
      .maybeSingle();
    if (existingError) throw new Error(existingError.message);
    if (existing) {
      return NextResponse.json(
        { error: "Talent dengan nama ini sudah ada. Buka profil yang sudah ada agar tidak membuat data ganda.", existingTalentId: existing.id },
        { status: 409 },
      );
    }

    const { data: talent, error } = await supabase
      .from("talents")
      .insert({
        name,
        category,
        manager_name: contactName || null,
        manager_whatsapp: whatsapp || null,
        manager_email: email || null,
        status: "draft",
        public_visible: false,
        onboarding_status: "not_started",
      })
      .select("id,name,category")
      .single();
    if (error) throw new Error(error.message);

    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const token = signAccessToken("talent_onboarding", talent.id, expiresAt);
    const origin = new URL(request.url).origin;
    const url = `${origin}/talent-onboarding/${encodeURIComponent(talent.id)}?token=${encodeURIComponent(token)}`;
    const recipient = contactName || name;
    const message = `Halo ${recipient}, Nusantara Star mengundang Anda untuk melengkapi profil talent ${name}. Silakan isi data melalui link aman berikut (berlaku 7 hari): ${url}\n\nLink ini khusus untuk Anda. Untuk tahap ini tidak perlu membuat akun.`;

    return NextResponse.json({ ok: true, talentId: talent.id, url, expiresAt: expiresAt.toISOString(), message });
  } catch (error) {
    return NextResponse.json({ error: "Gagal menambahkan talent", detail: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
