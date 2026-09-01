import "server-only";

const BIO_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: { bio: { type: "string" } },
  required: ["bio"],
};

const SYSTEM_PROMPT = "Rapikan bahan bio talent menjadi satu bio profil standar Nusantara Star dalam Bahasa Indonesia. Tulis sebagai paragraf orang ketiga yang profesional, hangat, jelas, dan mudah dipahami buyer, sekitar 80–150 kata. Utamakan identitas talent, kota asal bila tersedia, karakter karya atau penampilan, genre, format, pengalaman, dan pencapaian yang memang disebutkan. Gunakan HANYA fakta eksplisit dari dokumen atau konteks yang diberikan. Jangan mengarang penghargaan, angka audiens, klien, panggung, tahun, prestasi, klaim popularitas, atau kemampuan. Jangan sertakan nomor telepon, email, fee, alamat pribadi, instruksi internal, daftar teknis rider, atau ajakan promosi berlebihan. Hilangkan pengulangan dan rapikan tata bahasa tanpa mengubah makna. Jika bahan terbatas, buat bio lebih singkat; jangan mengisi kekosongan dengan asumsi. Kembalikan hanya objek JSON dengan properti bio.";
const RETRYABLE_STATUSES = new Set([429, 498, 500, 502, 503]);

function supportsStrictSchema(model: string) {
  return model === "openai/gpt-oss-20b" || model === "openai/gpt-oss-120b" || model === "qwen/qwen3.8-27b";
}

function retryDelay(response: Response, attempt: number) {
  const value = response.headers.get("retry-after");
  if (value) {
    const seconds = Number(value);
    if (Number.isFinite(seconds)) return Math.min(Math.max(seconds * 1_000, 250), 2_500);
    const date = Date.parse(value);
    if (Number.isFinite(date)) return Math.min(Math.max(date - Date.now(), 250), 2_500);
  }
  return 500 * (2 ** attempt) + Math.floor(Math.random() * 250);
}

async function pause(ms: number) {
  await new Promise(resolve => setTimeout(resolve, ms));
}

async function requestBio(apiKey: string, model: string, userContent: string) {
  let lastStatus = 0;
  let strictMode = supportsStrictSchema(model);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        temperature: 0,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userContent },
        ],
        response_format: strictMode
          ? { type: "json_schema", json_schema: { name: "nusantara_star_talent_bio", strict: true, schema: BIO_SCHEMA } }
          : { type: "json_object" },
      }),
      cache: "no-store",
    });

    if (response.ok) {
      const payload = await response.json();
      const raw = payload?.choices?.[0]?.message?.content;
      if (typeof raw !== "string" || !raw) throw new Error(`Model ${model} tidak mengembalikan bio`);
      const parsed = JSON.parse(raw);
      const bio = typeof parsed?.bio === "string" ? parsed.bio.trim().slice(0, 2_000) : "";
      if (!bio) throw new Error(`Model ${model} tidak menghasilkan bio yang dapat digunakan`);
      return bio;
    }

    lastStatus = response.status;
    const providerBody = (await response.text().catch(() => "")).slice(0, 300);
    console.warn(JSON.stringify({ level: "warning", message: "Groq bio request failed", model, status: response.status, attempt: attempt + 1, strictMode, retryAfter: response.headers.get("retry-after"), providerBody }));
    if (response.status === 400 && strictMode && providerBody.includes("json_validate_failed") && attempt === 0) {
      strictMode = false;
      continue;
    }
    if (!RETRYABLE_STATUSES.has(response.status) || attempt === 1) break;
    await pause(retryDelay(response, attempt));
  }
  throw new Error(`Groq bio request failed: ${lastStatus || "unknown"}`);
}

export async function extractBioText(buffer: Buffer, mimeType: string) {
  if (mimeType === "text/plain") return buffer.toString("utf8");
  if (mimeType === "application/pdf") {
    const module: any = await import("pdf-parse");
    const parse = module.default ?? module;
    const result = await parse(buffer);
    return typeof result?.text === "string" ? result.text : "";
  }
  if (mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    const mammoth: any = await import("mammoth");
    const result = await mammoth.extractRawText({ buffer });
    return typeof result?.value === "string" ? result.value : "";
  }
  throw new Error("Format dokumen bio tidak didukung");
}

export async function normalizeTalentBio(input: {
  sourceText: string;
  talentName?: string | null;
  category?: string | null;
  baseCity?: string | null;
}) {
  const sourceText = input.sourceText.replace(/\u0000/g, " ").trim().slice(0, 30_000);
  if (!sourceText) throw new Error("Dokumen bio tidak memiliki teks yang dapat diproses");
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("AI perapihan bio belum tersedia");
  const userContent = JSON.stringify({
    talentName: input.talentName?.trim() || null,
    category: input.category?.trim() || null,
    baseCity: input.baseCity?.trim() || null,
    bioDocument: sourceText,
  });
  const models = [...new Set([
    process.env.GROQ_MODEL ?? "openai/gpt-oss-20b",
    process.env.GROQ_BIO_FALLBACK_MODEL ?? "openai/gpt-oss-120b",
  ])];
  const failures: string[] = [];
  for (const model of models) {
    try {
      return await requestBio(apiKey, model, userContent);
    } catch (error) {
      failures.push(error instanceof Error ? error.message : String(error));
    }
  }
  console.error(JSON.stringify({ level: "error", message: "All bio normalization models failed", failures }));
  throw new Error("Layanan AI perapihan bio sedang dibatasi. File tidak diubah; silakan coba lagi nanti.");
}
