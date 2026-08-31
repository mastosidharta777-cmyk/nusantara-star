import "server-only";

const BIO_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: { bio: { type: "string" } },
  required: ["bio"],
};

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

  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: process.env.GROQ_MODEL ?? "openai/gpt-oss-20b",
      temperature: 0,
      messages: [
        {
          role: "system",
          content: "Rapikan bahan bio talent menjadi satu bio profil standar Nusantara Star dalam Bahasa Indonesia. Tulis sebagai paragraf orang ketiga yang profesional, hangat, jelas, dan mudah dipahami buyer, sekitar 80–150 kata. Utamakan identitas talent, kota asal bila tersedia, karakter karya atau penampilan, genre, format, pengalaman, dan pencapaian yang memang disebutkan. Gunakan HANYA fakta eksplisit dari dokumen atau konteks yang diberikan. Jangan mengarang penghargaan, angka audiens, klien, panggung, tahun, prestasi, klaim popularitas, atau kemampuan. Jangan sertakan nomor telepon, email, fee, alamat pribadi, instruksi internal, daftar teknis rider, atau ajakan promosi berlebihan. Hilangkan pengulangan dan rapikan tata bahasa tanpa mengubah makna. Jika bahan terbatas, buat bio lebih singkat; jangan mengisi kekosongan dengan asumsi.",
        },
        {
          role: "user",
          content: JSON.stringify({
            talentName: input.talentName?.trim() || null,
            category: input.category?.trim() || null,
            baseCity: input.baseCity?.trim() || null,
            bioDocument: sourceText,
          }),
        },
      ],
      response_format: { type: "json_schema", json_schema: { name: "nusantara_star_talent_bio", strict: true, schema: BIO_SCHEMA } },
    }),
    cache: "no-store",
  });

  if (!response.ok) throw new Error(`AI perapihan bio gagal (${response.status})`);
  const payload = await response.json();
  const raw = payload?.choices?.[0]?.message?.content;
  if (typeof raw !== "string" || !raw) throw new Error("AI tidak mengembalikan bio");
  const parsed = JSON.parse(raw);
  const bio = typeof parsed?.bio === "string" ? parsed.bio.trim().slice(0, 2_000) : "";
  if (!bio) throw new Error("AI tidak menghasilkan bio yang dapat digunakan");
  return bio;
}
