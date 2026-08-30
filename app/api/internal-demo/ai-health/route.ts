import { NextResponse } from "next/server";

import { parseBriefWithAI } from "@/lib/talent-engine/ai-brief";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function safeGroqError(payload: unknown) {
  if (!payload || typeof payload !== "object") return null;
  const root = payload as Record<string, unknown>;
  const error = root.error && typeof root.error === "object" ? root.error as Record<string, unknown> : null;
  if (!error) return null;
  return {
    message: typeof error.message === "string" ? error.message.slice(0, 500) : null,
    type: typeof error.type === "string" ? error.type.slice(0, 100) : null,
    code: typeof error.code === "string" ? error.code.slice(0, 100) : null,
  };
}

export async function GET() {
  if (process.env.VERCEL_ENV === "production") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const apiKey = process.env.GROQ_API_KEY?.trim();
  const model = process.env.GROQ_MODEL?.trim() || "openai/gpt-oss-20b";
  if (!apiKey) {
    return NextResponse.json({
      ok: false,
      configuredModel: model,
      apiKeyConfigured: false,
      minimalStrictSchema: false,
      applicationBriefParser: false,
      error: "GROQ_API_KEY is not configured",
    });
  }

  const schema = {
    type: "object",
    additionalProperties: false,
    properties: {
      ok: { type: "boolean" },
      label: { type: "string" },
    },
    required: ["ok", "label"],
  };

  let minimalStrictSchema = false;
  let minimalError: unknown = null;
  try {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        temperature: 0,
        messages: [
          { role: "system", content: "Return the requested health-check JSON only." },
          { role: "user", content: "Set ok=true and label=healthy." },
        ],
        response_format: {
          type: "json_schema",
          json_schema: { name: "nusantara_star_ai_health", strict: true, schema },
        },
      }),
      cache: "no-store",
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      minimalError = { status: response.status, detail: safeGroqError(payload) };
    } else {
      const payload = await response.json();
      const raw = payload?.choices?.[0]?.message?.content;
      const parsed = typeof raw === "string" ? JSON.parse(raw) : null;
      minimalStrictSchema = parsed?.ok === true && parsed?.label === "healthy";
    }
  } catch (error) {
    minimalError = { message: error instanceof Error ? error.message : String(error) };
  }

  let applicationBriefParser = false;
  let parserSource: "ai" | "fallback" | null = null;
  let parserError: string | null = null;
  try {
    const result = await parseBriefWithAI("Corporate event di Jakarta pada 30 September 2026 membutuhkan singer pop. Budget Rp10-15 juta.");
    parserSource = result.source;
    applicationBriefParser = result.source === "ai" && result.brief.city?.toLowerCase() === "jakarta";
  } catch (error) {
    parserError = error instanceof Error ? error.message : String(error);
  }

  return NextResponse.json({
    ok: minimalStrictSchema && applicationBriefParser,
    configuredModel: model,
    apiKeyConfigured: true,
    minimalStrictSchema,
    minimalError,
    applicationBriefParser,
    parserSource,
    parserError,
  });
}
