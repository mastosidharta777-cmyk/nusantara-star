import "server-only";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifyAccessToken } from "@/lib/signed-access";

export const runtime = "nodejs";

const schema = {
  type: "object",
  additionalProperties: false,
  properties: {
    baseRider: { type: "string" },
    travelPolicy: { type: "string" },
    accommodationPolicy: { type: "string" },
    unclearItems: { type: "array", items: { type: "string" }, maxItems: 12 },
  },
  required: ["baseRider", "travelPolicy", "accommodationPolicy", "unclearItems"],
};

function getServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) throw new Error("Supabase server environment is not configured");
  return createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const talentId = typeof body?.talentId === "string" ? body.talentId : "";
    const token = typeof body?.token === "string" ? body.token : "";
    const baseRider = typeof body?.baseRider === "string" ? body.baseRider.trim().slice(0, 12000) : "";
    const travelPolicy = typeof body?.travelPolicy === "string" ? body.travelPolicy.trim().slice(0, 6000) : "";
    const accommodationPolicy = typeof body?.accommodationPolicy === "string" ? body.accommodationPolicy.trim().slice(0, 6000) : "";

    if (!talentId || !verifyAccessToken(token, "talent_onboarding", talentId)) {
      return NextResponse.json({ error: "Invalid or expired onboarding link" }, { status: 401 });
    }
    if (!baseRider && !travelPolicy && !accommodationPolicy) {
      return NextResponse.json({ error: "Isi atau tempel teks rider terlebih dahulu" }, { status: 400 });
    }

    const supabase = getServerClient();
    const [{ data: talent, error: talentError }, { data: submission, error: submissionError }] = await Promise.all([
      supabase.from("talents").select("name,category").eq("id", talentId).maybeSingle(),
      supabase.from("talent_profile_submissions").select("name,category").eq("talent_id", talentId).maybeSingle(),
    ]);
    if (talentError) throw new Error(talentError.message);
    if (submissionError) throw new Error(submissionError.message);
    if (!talent) return NextResponse.json({ error: "Talent not found" }, { status: 404 });

    const source = submission ?? talent;
    const fallback = { baseRider, travelPolicy, accommodationPolicy, unclearItems: [] as string[] };
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) return NextResponse.json({ ok: true, source: "fallback", suggestion: fallback });

    const context = {
      talentName: source.name,
      category: source.category,
      sourceText: { baseRider, travelPolicy, accommodationPolicy },
    };

    try {
      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: process.env.GROQ_MODEL ?? "openai/gpt-oss-20b",
          messages: [
            {
              role: "system",
              content: "Rapikan rider talent ke standar operasional Nusantara Star dengan hanya memakai fakta dari sourceText. Jangan menambah alat, jumlah crew, hotel, transportasi, konsumsi, nominal, spesifikasi teknis, atau syarat yang tidak tertulis. Pindahkan informasi ke tiga bagian: baseRider untuk technical/hospitality/crew/special requirements; travelPolicy untuk transport dan baggage; accommodationPolicy untuk hotel/akomodasi. Pertahankan angka, merek, jumlah, dan syarat persis. Jika kalimat ambigu atau bertentangan, jangan menebak: masukkan ringkas ke unclearItems. Gunakan Bahasa Indonesia profesional dan ringkas.",
            },
            { role: "user", content: JSON.stringify(context) },
          ],
          response_format: { type: "json_schema", json_schema: { name: "normalized_talent_rider", strict: true, schema } },
          temperature: 0,
        }),
        cache: "no-store",
      });
      if (!response.ok) throw new Error(`Groq request failed: ${response.status}`);
      const payload = await response.json();
      const outputText = payload?.choices?.[0]?.message?.content;
      if (typeof outputText !== "string" || !outputText) throw new Error("No rider normalization returned");
      const parsed = JSON.parse(outputText);
      return NextResponse.json({ ok: true, source: "ai", suggestion: parsed });
    } catch (error) {
      console.error("Rider normalization failed, using source text", error);
      return NextResponse.json({ ok: true, source: "fallback", suggestion: fallback });
    }
  } catch (error) {
    return NextResponse.json({ error: "Rider normalization failed", detail: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
