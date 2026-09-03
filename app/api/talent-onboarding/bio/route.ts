import { NextResponse } from "next/server";

import { extractBioText, normalizeTalentBio } from "@/lib/bio-normalization";
import { verifyAccessToken } from "@/lib/signed-access";

export const runtime = "nodejs";

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const ALLOWED_TYPES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
]);

function formText(form: FormData, key: string) {
  const value = form.get(key);
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const talentId = formText(form, "talentId");
    const token = formText(form, "token");
    if (!talentId || !verifyAccessToken(token, "talent_onboarding", talentId)) {
      return NextResponse.json({ error: "Tautan pendaftaran tidak valid atau sudah kedaluwarsa" }, { status: 401 });
    }

    const file = form.get("file");
    if (!(file instanceof File) || !file.name || !ALLOWED_TYPES.has(file.type) || file.size <= 0 || file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: "Gunakan file PDF, DOCX, atau TXT maksimal 5 MB" }, { status: 400 });
    }

    const sourceText = await extractBioText(Buffer.from(await file.arrayBuffer()), file.type);
    const bio = await normalizeTalentBio({
      sourceText,
      talentName: formText(form, "talentName"),
      category: formText(form, "category"),
      baseCity: formText(form, "baseCity"),
    });
    return NextResponse.json({ ok: true, bio });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Gagal memproses dokumen bio";
    console.error(JSON.stringify({ level: "error", message: "Talent bio processing failed", route: "/api/talent-onboarding/bio", detail: message }));
    return NextResponse.json({
      error: message,
    }, { status: message.includes("sedang dibatasi") ? 503 : 422 });
  }
}
