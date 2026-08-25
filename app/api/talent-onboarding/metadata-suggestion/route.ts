import "server-only";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifyAccessToken } from "@/lib/signed-access";

export const runtime = "nodejs";

const schema = {
  type: "object",
  additionalProperties: false,
  properties: {
    title: { type: "string" },
    description: { type: "string" },
    tags: { type: "array", items: { type: "string" }, maxItems: 6 },
  },
  required: ["title", "description", "tags"],
};

function getServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) throw new Error("Supabase server environment is not configured");
  return createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

function cleanBaseName(fileName: string) {
  return fileName.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const talentId = typeof body?.talentId === "string" ? body.talentId : "";
    const token = typeof body?.token === "string" ? body.token : "";
    const fileName = typeof body?.fileName === "string" ? body.fileName.trim() : "";
    const assetType = typeof body?.assetType === "string" ? body.assetType : "live_performance";
    const notes = typeof body?.notes === "string" ? body.notes.trim().slice(0, 1000) : "";

    if (!talentId || !fileName || !verifyAccessToken(token, "talent_onboarding", talentId)) {
      return NextResponse.json({ error: "Invalid or expired onboarding link" }, { status: 401 });
    }

    const supabase = getServerClient();
    const [{ data: talent, error: talentError }, { data: submission, error: submissionError }] = await Promise.all([
      supabase.from("talents").select("name,category,genres,bio").eq("id", talentId).maybeSingle(),
      supabase.from("talent_profile_submissions").select("name,category,genres,bio").eq("talent_id", talentId).maybeSingle(),
    ]);
    if (talentError) throw new Error(talentError.message);
    if (submissionError) throw new Error(submissionError.message);
    if (!talent) return NextResponse.json({ error: "Talent not found" }, { status: 404 });

    const source = submission ?? talent;
    const fallbackTitle = cleanBaseName(fileName) || `${source.name} live performance`;
    const fallback = {
      title: fallbackTitle,
      description: `${source.name} — ${assetType.replace(/_/g, " ")}.`,
      tags: Array.from(new Set([source.category, ...(source.genres ?? [])].filter(Boolean))).slice(0, 6),
    };

    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) return NextResponse.json({ ok: true, source: "fallback", suggestion: fallback });

    const context = {
      talentName: source.name,
      category: source.category,
      genres: source.genres ?? [],
      bio: source.bio ?? null,
      assetType,
      fileName,
      notes: notes || null,
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
              content: "Create concise metadata for an entertainment talent video. Use only supplied facts. Never invent event name, venue, date, song title, awards, audience size, performance claims, or commercial facts. Title should be natural and buyer-friendly, description max 240 characters, tags max 6 short phrases. If a detail is unknown, omit it. Return Indonesian unless the supplied title/name naturally uses English.",
            },
            { role: "user", content: JSON.stringify(context) },
          ],
          response_format: { type: "json_schema", json_schema: { name: "talent_video_metadata", strict: true, schema } },
          temperature: 0,
        }),
        cache: "no-store",
      });
      if (!response.ok) throw new Error(`Groq request failed: ${response.status}`);
      const payload = await response.json();
      const outputText = payload?.choices?.[0]?.message?.content;
      if (typeof outputText !== "string" || !outputText) throw new Error("No metadata returned");
      const parsed = JSON.parse(outputText);
      return NextResponse.json({ ok: true, source: "ai", suggestion: parsed });
    } catch (error) {
      console.error("Talent metadata suggestion failed, using fallback", error);
      return NextResponse.json({ ok: true, source: "fallback", suggestion: fallback });
    }
  } catch (error) {
    return NextResponse.json({ error: "Metadata suggestion failed", detail: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
