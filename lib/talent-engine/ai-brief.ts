import "server-only";

import { parseBriefText } from "./parse-brief";
import type { BriefFieldEvidence, BriefFieldName, StructuredBrief } from "./types";

const briefFields: BriefFieldName[] = [
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
];

const evidenceFieldSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    status: { type: "string", enum: ["explicit", "normalized", "inferred_review", "missing"] },
    sourceExcerpt: { type: ["string", "null"] },
  },
  required: ["status", "sourceExcerpt"],
};

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
    fieldEvidence: {
      type: "object",
      additionalProperties: false,
      properties: Object.fromEntries(briefFields.map((field) => [field, evidenceFieldSchema])),
      required: briefFields,
    },
  },
  required: [...briefFields, "fieldEvidence"],
};

function hasBriefValue(brief: StructuredBrief, field: BriefFieldName) {
  const value = brief[field];
  return Array.isArray(value) ? value.length > 0 : value !== null && value !== undefined && value !== "";
}

function normalizeEvidenceText(value: string) {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function sanitizeEvidence(text: string, brief: StructuredBrief) {
  const source = normalizeEvidenceText(text);
  const incoming = brief.fieldEvidence ?? {};
  const result: Partial<Record<BriefFieldName, BriefFieldEvidence>> = {};

  for (const field of briefFields) {
    if (!hasBriefValue(brief, field)) {
      result[field] = { status: "missing", sourceExcerpt: null };
      continue;
    }

    const evidence = incoming[field];
    const excerpt = typeof evidence?.sourceExcerpt === "string" ? evidence.sourceExcerpt.trim() : "";
    const excerptExists = excerpt.length > 0 && source.includes(normalizeEvidenceText(excerpt));

    if (!excerptExists) {
      result[field] = { status: "inferred_review", sourceExcerpt: null };
      continue;
    }

    const status = evidence?.status;
    result[field] = {
      status: status === "explicit" || status === "normalized" || status === "inferred_review" ? status : "inferred_review",
      sourceExcerpt: excerpt,
    };
  }

  return result;
}

function fallbackEvidence(brief: StructuredBrief) {
  const result: Partial<Record<BriefFieldName, BriefFieldEvidence>> = {};
  for (const field of briefFields) {
    result[field] = hasBriefValue(brief, field)
      ? { status: "inferred_review", sourceExcerpt: null }
      : { status: "missing", sourceExcerpt: null };
  }
  return result;
}

export async function parseBriefWithAI(text: string): Promise<{ brief: StructuredBrief; source: "ai" | "fallback" }> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    const brief = parseBriefText(text);
    return { brief: { ...brief, fieldEvidence: fallbackEvidence(brief) }, source: "fallback" };
  }

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
              "Extract an entertainment event booking brief. Never invent missing facts. Return null or empty arrays when information is absent. Normalize Indonesian rupiah budgets to integer IDR and explicit dates to YYYY-MM-DD. For every field, also return evidence. sourceExcerpt must be a short exact excerpt copied from the user's text (maximum 80 characters) that supports the field, or null if no exact supporting excerpt exists. Use status explicit when the value is directly stated, normalized when formatting or canonicalization is applied, inferred_review when interpretation is required, and missing when absent. Never fabricate an excerpt.",
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

    const parsed = JSON.parse(outputText) as StructuredBrief;
    const brief: StructuredBrief = {
      ...parsed,
      sourceText: text,
      fieldEvidence: sanitizeEvidence(text, parsed),
    };
    return { brief, source: "ai" };
  } catch (error) {
    console.error("Groq brief parsing failed, using deterministic fallback", error);
    const brief = parseBriefText(text);
    return { brief: { ...brief, fieldEvidence: fallbackEvidence(brief) }, source: "fallback" };
  }
}
