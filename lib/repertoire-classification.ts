import "server-only";

export type RepertoireSong = { title: string; artist: string };
export type RepertoireClassification = { genres: string[]; styles: string[]; eras: string[] };

function cleanList(value: unknown) {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean))).slice(0, 12);
}

export function sanitizeRepertoire(value: unknown): RepertoireSong[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 20).flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const title = typeof (item as any).title === "string" ? (item as any).title.trim().slice(0, 180) : "";
    const artist = typeof (item as any).artist === "string" ? (item as any).artist.trim().slice(0, 180) : "";
    return title || artist ? [{ title, artist }] : [];
  });
}

export function repertoireIsComplete(songs: RepertoireSong[]) {
  return songs.length >= 10 && songs.length <= 20 && songs.every((song) => Boolean(song.title && song.artist));
}

export async function classifyRepertoire(songs: RepertoireSong[]): Promise<RepertoireClassification | null> {
  if (!repertoireIsComplete(songs)) return null;
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return null;

  const schema = {
    type: "object",
    additionalProperties: false,
    properties: {
      genres: { type: "array", items: { type: "string" }, maxItems: 12 },
      styles: { type: "array", items: { type: "string" }, maxItems: 12 },
      eras: { type: "array", items: { type: "string" }, maxItems: 12 },
    },
    required: ["genres", "styles", "eras"],
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
            content: "Classify a musician's sample repertoire using ONLY the supplied song title and artist pairs. Return concise aggregate genres, performance/listening styles, and eras represented by the repertoire. Do not invent songs or commercial facts. If a classification is uncertain, omit it rather than guessing. Eras should use simple labels such as 1980s, 1990s, 2000s, 2010s, 2020s. No confidence scores and no explanation.",
          },
          { role: "user", content: JSON.stringify({ repertoire: songs }) },
        ],
        response_format: { type: "json_schema", json_schema: { name: "repertoire_classification", strict: true, schema } },
        temperature: 0,
      }),
      cache: "no-store",
    });
    if (!response.ok) return null;
    const payload = await response.json();
    const raw = payload?.choices?.[0]?.message?.content;
    if (typeof raw !== "string" || !raw) return null;
    const parsed = JSON.parse(raw);
    return { genres: cleanList(parsed.genres), styles: cleanList(parsed.styles), eras: cleanList(parsed.eras) };
  } catch (error) {
    console.error("Repertoire classification failed", error instanceof Error ? error.message : String(error));
    return null;
  }
}
