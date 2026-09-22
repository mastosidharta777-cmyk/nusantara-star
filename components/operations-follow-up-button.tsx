"use client";

import { useState } from "react";

import type { OperationsFollowUp } from "@/lib/operations-inbox";

function normalizeWhatsAppPhone(value: string | null) {
  if (!value) return null;
  const digits = value.replace(/\D/g, "");
  if (!digits) return null;
  if (digits.startsWith("62")) return digits;
  if (digits.startsWith("0")) return `62${digits.slice(1)}`;
  return digits;
}

function followUpMessage({
  followUp,
  talentName,
  eventLabel,
  eventDate,
  url,
}: {
  followUp: OperationsFollowUp;
  talentName: string;
  eventLabel: string;
  eventDate: string | null;
  url: string;
}) {
  const event = [eventLabel, eventDate].filter(Boolean).join(" · ");
  if (followUp.messageKind === "availability") {
    return [
      "Halo, ini follow-up dari Nusantara Star.",
      `Mohon konfirmasi ketersediaan dan penawaran ${talentName} untuk ${event}.`,
      "Silakan jawab melalui secure link berikut:",
      url,
      "Jawaban tersedia belum berarti booking final; proses tetap menunggu proposal dan kesepakatan buyer.",
    ].join("\n\n");
  }
  if (followUp.messageKind === "advance") {
    return [
      "Halo, ini pengingat operasional dari Nusantara Star.",
      `Mohon cek dan konfirmasi Show Advance untuk ${talentName} — ${event}.`,
      "Silakan gunakan secure link berikut:",
      url,
      "Jika ada detail yang perlu dikoreksi, mohon update melalui halaman tersebut sebelum konfirmasi.",
    ].join("\n\n");
  }
  return [
    "Halo, ini follow-up dari Nusantara Star setelah acara.",
    `Mohon konfirmasi hasil pertunjukan ${talentName} — ${event}.`,
    "Silakan isi hasil show melalui secure link berikut:",
    url,
    "Jika ada kendala saat acara, catat langsung di halaman tersebut agar tercatat dalam operasional.",
  ].join("\n\n");
}

export function OperationsFollowUpButton({
  subjectId,
  followUp,
  talentName,
  eventLabel,
  eventDate,
}: {
  subjectId: string;
  followUp: OperationsFollowUp;
  talentName: string;
  eventLabel: string;
  eventDate: string | null;
}) {
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  async function prepareFollowUp() {
    setBusy(true);
    setFeedback(null);
    try {
      const response = await fetch("/api/internal-demo/admin/access-link", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ scope: followUp.scope, subjectId }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok || !body?.url) throw new Error(body?.detail ?? body?.error ?? "Gagal membuat secure link");

      const message = followUpMessage({
        followUp,
        talentName,
        eventLabel,
        eventDate,
        url: body.url,
      });
      const phone = normalizeWhatsAppPhone(followUp.phone);

      if (phone) {
        window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer");
        setFeedback("WhatsApp siap dikirim.");
        return;
      }

      await navigator.clipboard.writeText(message);
      setFeedback("Nomor WhatsApp belum tersedia. Pesan sudah disalin.");
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Follow-up gagal disiapkan");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={prepareFollowUp}
        disabled={busy}
        className="border border-black px-3 py-2 text-xs font-semibold disabled:opacity-40"
      >
        {busy ? "Menyiapkan…" : followUp.label}
      </button>
      {feedback ? <p className="max-w-52 text-[11px] leading-4 text-black/50">{feedback}</p> : null}
    </div>
  );
}
