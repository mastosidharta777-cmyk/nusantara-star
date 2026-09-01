import "server-only";

type StructuredRequest = {
  schemaName: string;
  schema: Record<string, unknown>;
  systemPrompt: string;
  userContent: string;
  maxCompletionTokens?: number;
};

function retryDelay(response: Response, attempt: number) {
  const raw = response.headers.get("retry-after");
  if (raw) {
    const seconds = Number(raw);
    if (Number.isFinite(seconds)) return Math.min(Math.max(seconds * 1_000 + 250, 500), 10_000);
    const date = Date.parse(raw);
    if (Number.isFinite(date)) return Math.min(Math.max(date - Date.now() + 250, 500), 10_000);
  }
  return 750 * (2 ** attempt);
}

export async function requestOpenAIStructured(input: StructuredRequest) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY belum tersedia");
  const model = process.env.OPENAI_FALLBACK_MODEL ?? "gpt-5.4-mini";
  let lastStatus = 0;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: input.systemPrompt },
          { role: "user", content: input.userContent },
        ],
        max_completion_tokens: input.maxCompletionTokens ?? 1_200,
        response_format: {
          type: "json_schema",
          json_schema: { name: input.schemaName, strict: true, schema: input.schema },
        },
      }),
      cache: "no-store",
    });

    if (response.ok) {
      const payload = await response.json();
      const raw = payload?.choices?.[0]?.message?.content;
      if (typeof raw !== "string" || !raw) throw new Error(`OpenAI ${model} tidak mengembalikan hasil`);
      return JSON.parse(raw);
    }

    lastStatus = response.status;
    const providerBody = (await response.text().catch(() => "")).slice(0, 300);
    console.warn(JSON.stringify({ level: "warning", message: "OpenAI fallback failed", model, status: response.status, attempt: attempt + 1, retryAfter: response.headers.get("retry-after"), providerBody }));
    if (![429, 500, 502, 503].includes(response.status) || attempt === 1) break;
    await new Promise(resolve => setTimeout(resolve, retryDelay(response, attempt)));
  }

  throw new Error(`OpenAI fallback gagal (${lastStatus || "unknown"})`);
}
