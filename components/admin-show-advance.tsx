"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { SecureAccessLinkButton } from "@/components/secure-access-link-button";
import type { ShowAdvanceData } from "@/lib/show-advance-data";

function dateLabel(value: string | null | undefined) {
  if (!value) return "—";
  return value.replace("T", " ").slice(0, 16);
}

export function AdminShowAdvance({
  bookingId,
  bookingStatus,
  data,
}: {
  bookingId: string;
  bookingStatus: string;
  data: ShowAdvanceData;
}) {
  const router = useRouter();
  const a = data.advance;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const buyerSubmitted = Boolean(a?.buyer_submitted_at);
  const talentSubmitted = Boolean(a?.talent_submitted_at);
  const reviewed = Boolean(a && a.admin_reviewed_revision_no === a.revision_no && a.admin_reviewed_at);
  const buyerConfirmed = Boolean(a?.buyer_confirmed_at);
  const talentConfirmed = Boolean(a?.talent_confirmed_at);
  const fullyConfirmed = Boolean(
    a
      && a.status === "confirmed"
      && a.confirmed_revision_no === a.revision_no
      && buyerConfirmed
      && talentConfirmed,
  );

  async function review() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/internal-demo/admin/show-advance", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ bookingId, action: "review" }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error ?? body?.detail ?? "Show Advance review gagal");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Show Advance review gagal");
    } finally {
      setBusy(false);
    }
  }

  const selectedRider = data.approvedRiders.find((rider) => rider.id === a?.rider_version_id);

  return (
    <section className="mt-7 border border-black/10 bg-white p-5 md:p-6">
      <div className="flex flex-col gap-3 border-b border-black/10 pb-5 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-semibold">Show Advance · Control Panel</p>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-black/45">
            Buyer/EO dan Talent/Manager mengisi bagian mereka sendiri. Admin hanya memonitor kelengkapan, review merged revision, dan menangani exception.
          </p>
        </div>
        <div className="text-left sm:text-right">
          <span className={`inline-block border px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] ${fullyConfirmed ? "border-emerald-700/25 bg-emerald-50 text-emerald-900" : reviewed ? "border-blue-700/20 bg-blue-50 text-blue-900" : "border-amber-500/30 bg-amber-50 text-amber-950"}`}>
            {fullyConfirmed ? "Final confirmed" : reviewed ? "Menunggu party confirmation" : "Collecting / review"}
          </span>
          <p className="mt-2 text-xs text-black/45">Revision {a?.revision_no ?? "belum dibuat"}</p>
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="border border-black/10 p-3 text-sm"><span className="text-black/45">Buyer / EO input</span><br /><strong>{buyerSubmitted ? "Sudah masuk" : "Belum"}</strong></div>
        <div className="border border-black/10 p-3 text-sm"><span className="text-black/45">Talent / Manager input</span><br /><strong>{talentSubmitted ? "Sudah masuk" : "Belum"}</strong></div>
        <div className="border border-black/10 p-3 text-sm"><span className="text-black/45">Admin review</span><br /><strong>{reviewed ? "Lolos revision ini" : "Belum"}</strong></div>
        <div className="border border-black/10 p-3 text-sm"><span className="text-black/45">Final confirmation</span><br /><strong>{buyerConfirmed ? "Buyer ✓" : "Buyer —"} · {talentConfirmed ? "Talent ✓" : "Talent —"}</strong></div>
      </div>

      {["secured", "pre_show"].includes(bookingStatus) && !fullyConfirmed ? (
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <div className="border border-black/10 bg-[#f5f3ee] p-4">
            <p className="text-sm font-semibold">Buyer / EO</p>
            <p className="mt-1 text-xs leading-5 text-black/45">Venue, schedule, onsite/technical PIC, access/loading, transport/hotel/hospitality arrangement.</p>
            <div className="mt-3"><SecureAccessLinkButton scope="buyer_advance" subjectId={bookingId} label="Buat link Buyer / EO" delivery="copy" /></div>
          </div>
          <div className="border border-black/10 bg-[#f5f3ee] p-4">
            <p className="text-sm font-semibold">Talent / Manager</p>
            <p className="mt-1 text-xs leading-5 text-black/45">Talent PIC, personnel/lineup, final rider, backline, dan catatan operasional talent.</p>
            <div className="mt-3"><SecureAccessLinkButton scope="talent_advance" subjectId={bookingId} label="Buat link Talent / Manager" delivery="copy" /></div>
          </div>
        </div>
      ) : null}

      {a ? (
        <div className="mt-5 border border-black/10 p-4">
          <p className="text-sm font-semibold">Merged revision {a.revision_no}</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div className="border border-black/10 p-3 text-sm"><span className="text-black/45">Event</span><br />{data.defaults.eventDate} · {data.defaults.city ?? "—"}<br />Durasi: {a.performance_duration_minutes ?? data.defaults.performanceDurationMinutes ?? "—"} menit</div>
            <div className="border border-black/10 p-3 text-sm"><span className="text-black/45">Venue</span><br /><strong>{a.venue_name ?? "—"}</strong><br />{a.venue_address ?? "—"}</div>
            <div className="border border-black/10 p-3 text-sm"><span className="text-black/45">Schedule</span><br />Call: {dateLabel(a.call_at_local)}<br />Show: {dateLabel(a.show_start_at_local)}</div>
            <div className="border border-black/10 p-3 text-sm"><span className="text-black/45">Onsite / technical</span><br />{a.onsite_pic_name ?? "—"} · {a.onsite_pic_phone ?? "—"}<br />Teknis: {a.technical_pic_name ?? "—"} · {a.technical_pic_phone ?? "—"}</div>
            <div className="border border-black/10 p-3 text-sm"><span className="text-black/45">Talent / personnel</span><br />{a.talent_pic_name ?? "—"} · {a.talent_pic_phone ?? "—"}<br />{a.personnel_count ?? "—"} orang · {a.lineup_notes ?? "—"}</div>
            <div className="border border-black/10 p-3 text-sm"><span className="text-black/45">Final rider</span><br />{selectedRider ? `v${selectedRider.version_no} · ${selectedRider.source_filename ?? "Approved rider"}` : "—"}</div>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <div className="text-sm"><span className="text-black/45">Buyer technical / logistics</span><br />{a.technical_notes ?? "—"}<br />Transport: {a.transport_notes ?? "—"}<br />Hotel: {a.accommodation_notes ?? "—"}<br />Hospitality: {a.hospitality_notes ?? "—"}</div>
            <div className="text-sm"><span className="text-black/45">Talent requirements / notes</span><br />Backline: {a.backline_notes ?? "—"}<br />{a.talent_operational_notes ?? "—"}</div>
          </div>
        </div>
      ) : (
        <p className="mt-5 border border-black/10 p-4 text-sm text-black/50">Show Advance belum dimulai oleh Buyer/EO atau Talent/Manager.</p>
      )}

      {a && buyerSubmitted && talentSubmitted && !reviewed ? (
        <div className="mt-5 border border-black/10 bg-[#f5f3ee] p-4">
          <p className="text-sm font-semibold">Admin review revision {a.revision_no}</p>
          <p className="mt-1 text-xs leading-5 text-black/45">Sistem akan memvalidasi field wajib, urutan waktu, durasi, dan final rider. Admin tidak mengetik ulang data pihak.</p>
          <button type="button" onClick={review} disabled={busy} className="mt-3 bg-black px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">
            {busy ? "Memeriksa…" : "Review & approve revision"}
          </button>
        </div>
      ) : null}

      {reviewed && !fullyConfirmed ? (
        <p className="mt-5 border border-blue-700/20 bg-blue-50 p-4 text-sm text-blue-950">
          Revision {a?.revision_no} sudah lolos admin review. Buyer/EO dan Talent/Manager sekarang harus membuka secure link masing-masing dan menekan <strong>Confirm revision final</strong>.
        </p>
      ) : null}

      {fullyConfirmed ? (
        <p className="mt-5 border border-emerald-700/20 bg-emerald-50 p-4 text-sm font-semibold text-emerald-900">
          ✓ Revision {a?.revision_no} final-confirmed oleh Buyer/EO dan Talent/Manager. Siap menjadi basis pre-show.
        </p>
      ) : null}

      {data.confirmations.length ? (
        <details className="mt-5 border border-black/10">
          <summary className="cursor-pointer p-3 text-xs font-semibold">Riwayat final confirmation</summary>
          <div className="border-t border-black/10 p-3">
            {data.confirmations.map((item) => (
              <div key={item.id} className="border-b border-black/10 py-2 text-xs last:border-b-0">
                Revision {item.revision_no} · Buyer: {item.buyer_confirmation_reference} · Talent: {item.talent_confirmation_reference}
              </div>
            ))}
          </div>
        </details>
      ) : null}

      {error ? <p className="mt-4 text-xs font-semibold text-red-700">{error}</p> : null}
    </section>
  );
}
