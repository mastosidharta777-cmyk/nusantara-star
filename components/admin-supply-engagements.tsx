"use client";

import { FormEvent, useEffect, useRef, useState } from "react";

import { SecureAccessLinkButton } from "@/components/secure-access-link-button";
import { supplyServiceLabel, type NonTalentSupplyType } from "@/lib/supply-onboarding";

type Engagement = {
  id: string;
  work_order_reference: string;
  service_label_snapshot: string;
  project_name: string;
  event_date: string | null;
  city: string | null;
  agreed_fee: number;
  currency: string;
  status: string;
  supplier_response_note: string | null;
};

function money(value: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value);
}

function normalizeWhatsAppPhone(value: string | null) {
  if (!value) return null;
  const digits = value.replace(/\D/g, "");
  if (!digits) return null;
  if (digits.startsWith("62")) return digits;
  if (digits.startsWith("0")) return `62${digits.slice(1)}`;
  return digits;
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    pending_confirmation: "Menunggu konfirmasi",
    confirmed: "Dikonfirmasi",
    declined: "Belum dapat diterima",
    in_progress: "Berjalan",
    awaiting_completion: "Menunggu penyelesaian",
    completed: "Selesai",
    disputed: "Perlu penanganan",
    cancelled: "Dibatalkan",
  };
  return labels[status] ?? status;
}

export function AdminSupplyEngagements({
  supplyId,
  supplyName,
  supplyType,
  serviceIds,
  otherService,
  whatsapp,
  canCreate,
}: {
  supplyId: string;
  supplyName: string;
  supplyType: NonTalentSupplyType;
  serviceIds: string[];
  otherService: string | null;
  whatsapp: string | null;
  canCreate: boolean;
}) {
  const [engagements, setEngagements] = useState<Engagement[]>([]);
  const [ready, setReady] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const requestKey = useRef("");

  async function refresh() {
    const response = await fetch(`/api/internal-demo/admin/supply-engagements?supplyId=${encodeURIComponent(supplyId)}`, { cache: "no-store" });
    const body = await response.json().catch(() => null);
    if (!response.ok) throw new Error(body?.detail ?? body?.error ?? "Gagal memuat Work Order");
    setReady(body?.ready !== false);
    setEngagements(body?.engagements ?? []);
  }

  useEffect(() => {
    refresh().catch((err) => setError(err instanceof Error ? err.message : "Gagal memuat Work Order"));
  }, [supplyId]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const form = new FormData(formElement);
      if (!requestKey.current) requestKey.current = crypto.randomUUID();
      const response = await fetch("/api/internal-demo/admin/supply-engagements", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          supplyId,
          requestKey: requestKey.current,
          projectName: form.get("projectName"),
          serviceId: form.get("serviceId"),
          eventDate: form.get("eventDate"),
          city: form.get("city"),
          scopeOfWork: form.get("scopeOfWork"),
          deliverables: String(form.get("deliverables") ?? "").split("\n"),
          agreedFee: Number(form.get("agreedFee")),
          paymentTerms: form.get("paymentTerms"),
        }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok || !body?.engagement?.id) throw new Error(body?.detail ?? body?.error ?? "Gagal membuat Work Order");

      const linkResponse = await fetch("/api/internal-demo/admin/access-link", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ scope: "supply_engagement", subjectId: body.engagement.id }),
      });
      const linkBody = await linkResponse.json().catch(() => null);
      if (!linkResponse.ok || !linkBody?.url) {
        await refresh();
        throw new Error(linkBody?.detail ?? linkBody?.error ?? "Work Order tersimpan, tetapi link konfirmasi gagal dibuat");
      }

      const text = [
        `Halo ${supplyName}, Nusantara Star mengirim Work Order ${body.engagement.work_order_reference}.`,
        `Proyek: ${body.engagement.project_name}`,
        `Nilai pekerjaan: ${money(body.engagement.agreed_fee)}`,
        "Mohon periksa seluruh scope, deliverables, dan termin lalu konfirmasi melalui link berikut:",
        linkBody.url,
      ].join("\n\n");
      const phone = normalizeWhatsAppPhone(whatsapp);
      if (phone) window.open(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
      else await navigator.clipboard.writeText(text);

      formElement.reset();
      requestKey.current = "";
      setMessage(phone ? "Work Order dibuat. WhatsApp siap dikirim." : "Work Order dibuat. Pesan dan link sudah disalin.");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal membuat Work Order");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-5 border border-black/10 bg-white p-5 md:p-6">
      <div className="flex flex-col gap-2 border-b border-black/10 pb-5 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm font-semibold">Engagement / Work Order</p>
          <p className="mt-1 text-xs leading-5 text-black/45">Scope, deliverables, fee, dan konfirmasi pihak supply tercatat sebagai satu snapshot pekerjaan.</p>
        </div>
        <span className="text-xs font-semibold text-black/45">{engagements.length} Work Order</span>
      </div>

      {!ready ? <p className="mt-5 border border-amber-200 bg-amber-50 p-3 text-xs font-semibold text-amber-800">Schema Engagement V1 belum diterapkan. Form dikunci agar data tidak jatuh ke proses manual.</p> : null}
      {!canCreate ? <p className="mt-5 border border-amber-200 bg-amber-50 p-3 text-xs font-semibold text-amber-800">Work Order baru dapat dibuat setelah profil disetujui.</p> : null}

      {ready && canCreate ? (
        <form onSubmit={submit} className="mt-5 grid gap-4 md:grid-cols-2">
          <label className="text-xs font-semibold text-black/55">Proyek / acara<input required name="projectName" className="mt-2 w-full border border-black/15 p-3 text-sm font-normal text-black" /></label>
          <label className="text-xs font-semibold text-black/55">Layanan<select required name="serviceId" className="mt-2 w-full border border-black/15 bg-white p-3 text-sm font-normal text-black"><option value="">Pilih layanan</option>{serviceIds.map((id) => <option key={id} value={id}>{supplyServiceLabel(supplyType, id, otherService)}</option>)}</select></label>
          <label className="text-xs font-semibold text-black/55">Tanggal pekerjaan<input type="date" name="eventDate" className="mt-2 w-full border border-black/15 p-3 text-sm font-normal text-black" /></label>
          <label className="text-xs font-semibold text-black/55">Kota / lokasi<input name="city" className="mt-2 w-full border border-black/15 p-3 text-sm font-normal text-black" /></label>
          <label className="text-xs font-semibold text-black/55 md:col-span-2">Scope pekerjaan<textarea required name="scopeOfWork" rows={4} className="mt-2 w-full border border-black/15 p-3 text-sm font-normal text-black" /></label>
          <label className="text-xs font-semibold text-black/55 md:col-span-2">Deliverables <span className="font-normal">(satu per baris)</span><textarea required name="deliverables" rows={4} className="mt-2 w-full border border-black/15 p-3 text-sm font-normal text-black" /></label>
          <label className="text-xs font-semibold text-black/55">Fee disepakati (IDR)<input required min="1" step="1" type="number" name="agreedFee" className="mt-2 w-full border border-black/15 p-3 text-sm font-normal text-black" /></label>
          <label className="text-xs font-semibold text-black/55">Termin pembayaran<input required name="paymentTerms" placeholder="Contoh: 50% DP, 50% H+1" className="mt-2 w-full border border-black/15 p-3 text-sm font-normal text-black" /></label>
          <button disabled={busy} className="w-fit border border-black bg-black px-4 py-3 text-sm font-semibold text-white disabled:opacity-40">{busy ? "Membuat…" : "Buat & Siapkan Konfirmasi"}</button>
        </form>
      ) : null}

      {message ? <p className="mt-4 text-sm font-semibold text-green-800">{message}</p> : null}
      {error ? <p className="mt-4 text-sm font-semibold text-red-700">{error}</p> : null}

      {engagements.length ? <div className="mt-6 space-y-3">{engagements.map((item) => <article key={item.id} className="border border-black/10 p-4"><div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"><div><p className="text-xs font-semibold uppercase tracking-[0.1em] text-black/45">{item.work_order_reference}</p><p className="mt-1 font-semibold">{item.project_name}</p><p className="mt-1 text-sm text-black/55">{item.service_label_snapshot}{item.event_date ? ` · ${item.event_date}` : ""}{item.city ? ` · ${item.city}` : ""}</p></div><div className="sm:text-right"><span className="inline-flex border border-black/10 px-2 py-1 text-xs font-semibold">{statusLabel(item.status)}</span><p className="mt-2 text-sm font-semibold">{money(item.agreed_fee)}</p></div></div>{item.supplier_response_note ? <p className="mt-3 border-t border-black/10 pt-3 text-sm text-black/60">Catatan: {item.supplier_response_note}</p> : null}{item.status === "pending_confirmation" ? <div className="mt-3 border-t border-black/10 pt-3"><SecureAccessLinkButton scope="supply_engagement" subjectId={item.id} label="Salin Link Konfirmasi" delivery="copy" /></div> : null}</article>)}</div> : null}
    </section>
  );
}
