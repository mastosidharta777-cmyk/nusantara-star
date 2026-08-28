import { NextResponse } from "next/server";

import { persistBrief } from "@/lib/brief-persistence";
import { persistMatchSnapshot } from "@/lib/match-persistence";
import { parseBriefWithAI } from "@/lib/talent-engine/ai-brief";
import { rankTalents } from "@/lib/talent-engine/matching";
import { loadEngineTalents } from "@/lib/talent-engine/supabase-talents";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function textValue(value: unknown, max = 500) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function validEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function validWhatsapp(value: string) {
  return value.replace(/\D/g, "").length >= 8;
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Data brief tidak valid" }, { status: 400 });
    }

    // Honeypot. Legitimate UI leaves this field empty.
    if (textValue((body as Record<string, unknown>).website, 200)) {
      return NextResponse.json({ ok: true, received: true }, { status: 202 });
    }

    const input = body as Record<string, unknown>;
    const name = textValue(input.name, 120);
    const company = textValue(input.company, 160);
    const whatsapp = textValue(input.whatsapp, 50);
    const email = textValue(input.email, 180).toLowerCase();
    const eventType = textValue(input.eventType, 120);
    const date = textValue(input.date, 20);
    const city = textValue(input.city, 120);
    const venue = textValue(input.venue, 180);
    const audience = textValue(input.audience, 30);
    const category = textValue(input.category, 120);
    const genre = textValue(input.genre, 180);
    const budget = textValue(input.budget, 80);
    const duration = textValue(input.duration, 80);
    const notes = textValue(input.notes, 1500);

    if (!name || !whatsapp || !email || !eventType || !date || !city || !category || !budget) {
      return NextResponse.json({ error: "Mohon lengkapi semua kolom wajib" }, { status: 400 });
    }
    if (!validEmail(email)) {
      return NextResponse.json({ error: "Format email tidak valid" }, { status: 400 });
    }
    if (!validWhatsapp(whatsapp)) {
      return NextResponse.json({ error: "Nomor WhatsApp tidak valid" }, { status: 400 });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json({ error: "Tanggal acara tidak valid" }, { status: 400 });
    }

    const sourceText = [
      `${eventType} pada ${date} di ${city}${venue ? `, venue ${venue}` : ""}.`,
      audience ? `Jumlah audiens ${audience} orang.` : "",
      `Butuh ${category}${genre ? `, genre/style ${genre}` : ""}.`,
      `Budget ${budget}.`,
      duration ? `Durasi tampil ${duration}.` : "",
      notes ? `Catatan: ${notes}.` : "",
    ].filter(Boolean).join(" ");

    const [{ brief }, roster] = await Promise.all([
      parseBriefWithAI(sourceText),
      loadEngineTalents(),
    ]);
    const matches = rankTalents(roster.talents, brief, 5);
    const persisted = await persistBrief(brief, { name, company: company || null, whatsapp, email });
    await persistMatchSnapshot(persisted.id, matches);

    // Do not return shortlist, internal rate guidance, reliability, score breakdown,
    // or other internal matching data before admin review and live confirmation.
    return NextResponse.json({ ok: true, received: true, briefId: persisted.id }, { status: 201 });
  } catch (error) {
    console.error("Public brief submission failed", error instanceof Error ? error.message : String(error));
    return NextResponse.json({ error: "Brief belum dapat dikirim. Silakan coba lagi." }, { status: 500 });
  }
}
