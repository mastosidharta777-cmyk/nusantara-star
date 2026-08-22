import "server-only";

import { parseBriefText } from "./parse-brief";
import type { StructuredBrief } from "./types";

const briefSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    eventType: { type: ["string", "null"] },
    eventDate: { type: ["string", "null"], description: "YYYY-MM-DD when known" },
    city: { type: ["string", "null"] },
    venue: { type: ["string", "null"] },
    audienceSize: { type: ["integer", "null"] },
    talentCategory: { type: ["string", "null"] },
    genreStyle: { type: "array", items: { type: "string" } },
    budgetMin: { type: ["integer", "null"] },
    budgetMax: { type: ["integer", "null"] },
    performanceDurationMinutes: { type: ["integer", "null"] },
    eventVibe: { type: "array", items: { type: "string" } },
    specialRequirements: { type: "array", items: { type: "string" } },
  },
  required: [
    "eventType",
    "eventDate",
    "city",
    "venue",
    "audienceSize",
    "talentCategory",
    "genreStyle",
    "budgetMin",
    "budgetMax",
    "performanceDurationMinutes",
    "eventVibe",
    "specialRequirements",
  ],
} as const;

export async function parseBriefWithAI(text: string): Promise<{ brief: StructuredBrief; source: "ai" | "fallback" }> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return { brief: parseBriefText(text), source: "fallback" };

  try {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.GROQ_MODEL ?? "openai/gpt-oss-20b",
        messages: [
          {
            role: "system",
            content:
              "Extract an entertainment event booking brief. Never invent missing facts. Return null or empty arrays when the user did not provide the information. Normalize Indonesian rupiah budgets to integer IDR. Normalize explicit dates to YYYY-MM-DD. Keep event/category/genre/vibe wording concise.",
          },
          { role: "user", content: text },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "nusantara_star_event_brief",
            strict: true,
            schema: briefSchema,
          },
        },
        temperature: 0,
      }),
      cache: "no-store",
    });

    if (!response.ok) throw new Error(`Groq request failed: ${response.status}`);
    const payload = await response.json();
    const outputText = payload?.choices?.[0]?.message?.content;
    if (typeof outputText !== "string" || !outputText) throw new Error("No structured output returned");

    const brief = JSON.parse(outputText) as StructuredBrief;
    return { brief: { ...brief, sourceText: text }, source: "ai" };
  } catch (error) {
    console.error("Groq brief parsing failed, using deterministic fallback", error);
    return { brief: parseBriefText(text), source: "fallback" };
  }
}
