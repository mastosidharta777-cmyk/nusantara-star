"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import type { ShowAdvanceData } from "@/lib/show-advance-data";

function localValue(value: string | null | undefined) {
  if (!value) return "";
  return value.replace(" ", "T").slice(0, 16);
}

function shortDate(value: string) {
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" }).format(date)
    : value;
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
  const d = data.defaults;

  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState(a?.status ?? "draft");
  const [revision, setRevision] = useState(a?.revision_no ?? 0);

  const [eventTimezone, setEventTimezone] = useState(a?.event_timezone ?? "Asia/Jakarta");
  const [venueName, setVenueName] = useState(a?.venue_name ?? d.venueName ?? "");
  const [venueAddress, setVenueAddress] = useState(a?.venue_address ?? "");
  const [loadInAt, setLoadInAt] = useState(localValue(a?.load_in_at_local));
  const [callAt, setCallAt] = useState(localValue(a?.call_at_local));
  const [soundcheckAt, setSoundcheckAt] = useState(localValue(a?.soundcheck_at_local));
  const [showStartAt, setShowStartAt] = useState(localValue(a?.show_start_at_local));
  const [showEndAt, setShowEndAt] = useState(localValue(a?.show_end_at_local));
  const [performanceDuration, setPerformanceDuration] = useState(String(a?.performance_duration_minutes ?? d.performanceDurationMinutes ?? ""));

  const [buyerPicName, setBuyerPicName] = useState(a?.buyer_pic_name ?? d.buyerPicName ?? "");
  const [buyerPicPhone, setBuyerPicPhone] = useState(a?.buyer_pic_phone ?? d.buyerPicPhone ?? "");
  const [onsitePicName, setOnsitePicName] = useState(a?.onsite_pic_name ?? "");
  const [onsitePicPhone, setOnsitePicPhone] = useState(a?.onsite_pic_phone ?? "");
  const [technicalPicName, setTechnicalPicName] = useState(a?.technical_pic_name ?? "");
  const [technicalPicPhone, setTechnicalPicPhone] = useState(a?.technical_pic_phone ?? "");
  const [talentPicName, setTalentPicName] = useState(a?.talent_pic_name ?? d.talentPicName ?? "");
  const [talentPicPhone, setTalentPicPhone] = useState(a?.talent_pic_phone ?? d.talentPicPhone ?? "");

  const [personnelCount, setPersonnelCount] = useState(String(a?.personnel_count ?? ""));
  const [riderVersionId, setRiderVersionId] = useState(a?.rider_version_id ?? "");
  const [lineupNotes, setLineupNotes] = useState(a?.lineup_notes ?? "");
  const [transportNotes, setTransportNotes] = useState(a?.transport_notes ?? "");
  const [accommodationNotes, setAccommodationNotes] = useState(a?.accommodation_notes ?? "");
  const [hospitalityNotes, setHospitalityNotes] = useState(a?.hospitality_notes ?? "");
  const [technicalNotes, setTechnicalNotes] = useState(a?.technical_notes ?? "");
  const [backlineNotes, setBacklineNotes] = useState(a?.backline_notes ?? "");
  const [accessLoadingNotes, setAccessLoadingNotes] = useState(a?.access_loading_notes ?? "");
  const [parkingNotes, setParkingNotes] = useState(a?.parking_notes ?? "");
  const [internalNotes, setInternalNotes] = useState(a?.internal_notes ?? "");

  const [buyerConfirmationReference, setBuyerConfirmationReference] = useState("");
  const [talentConfirmationReference, setTalentConfirmationReference] = useState("");

  const editable = ["secured", "pre_show"].includes(bookingStatus);
  const currentConfirmed = status === "confirmed";

  async function saveAdvance() {
    setBusy("save");
    setError(null);
    try {
      const response = await fetch("/api/internal-demo/admin/show-advance", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          bookingId,
          action: "save",
          payload: {
            event_timezone: eventTimezone,
            venue_name: venueName,
            venue_address: venueAddress,
            load_in_at_local: loadInAt || null,
            call_at_local: callAt || null,
            soundcheck_at_local: soundcheckAt || null,
            show_start_at_local: showStartAt || null,
            show_end_at_local: showEndAt || null,
            performance_duration_minutes: performanceDuration || null,
            buyer_pic_name: buyerPicName,
            buyer_pic_phone: buyerPicPhone,
            onsite_pic_name: onsitePicName,
            onsite_pic_phone: onsitePicPhone,
            technical_pic_name: technicalPicName,
            technical_pic_phone: technicalPicPhone,
            talent_pic_name: talentPicName,
            talent_pic_phone: talentPicPhone,
            personnel_count: personnelCount || null,
            rider_version_id: riderVersionId || null,
            lineup_notes: lineupNotes,
            transport_notes: transportNotes,
            accommodation_notes: accommodationNotes,
            hospitality_notes: hospitalityNotes,
            technical_notes: technicalNotes,
            backline_notes: backlineNotes,
            access_loading_notes: accessLoadingNotes,
            parking_notes: parkingNotes,
            internal_notes: internalNotes,
          },
        }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error ?? body?.detail ?? "Gagal menyimpan Show Advance");
      const row = Array.isArray(body?.advance) ? body.advance[0] : body?.advance;
      setStatus("draft");
      if (row?.revision_no) setRevision(Number(row.revision_no));
      setBuyerConfirmationReference("");
      setTalentConfirmationReference("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menyimpan Show Advance");
    } finally {
      setBusy(null);
    }
  }

  async function confirmAdvance() {
    setBusy("confirm");
    setError(null);
    try {
      const response = await fetch("/api/internal-demo/admin/show-advance", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          bookingId,
          action: "confirm",
          buyerConfirmationReference: buyerConfirmationReference.trim(),
          talentConfirmationReference: talentConfirmationReference.trim(),
        }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error ?? body?.detail ?? "Gagal mengonfirmasi Show Advance");
      setStatus("confirmed");
      if (body?.revisionNo) setRevision(Number(body.revisionNo));
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal mengonfirmasi Show Advance");
    } finally {
      setBusy(null);
    }
  }

  const fieldClass = "mt-1 w-full border border-black/15 bg-white p-2 text-sm font-normal disabled:bg-black/[0.03] disabled:text-black/50";
  const areaClass = "mt-1 min-h-20 w-full border border-black/15 bg-white p-2 text-sm font-normal disabled:bg-black/[0.03] disabled:text-black/50";

  return (
    <section className="mt-7 border border-black/10 bg-white p-5 md:p-6">
      <div className="flex flex-col gap-3 border-b border-black/10 pb-5 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-semibold">Show Advance / Booking Confirmation</p>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-black/45">
            Source of truth operasional setelah booking secured. Perubahan setelah konfirmasi otomatis membuat versi baru dan wajib dikonfirmasi ulang.
          </p>
        </div>
        <div className="text-left sm:text-right">
          <span className={`inline-block border px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] ${currentConfirmed ? "border-emerald-700/25 bg-emerald-50 text-emerald-900" : "border-amber-500/30 bg-amber-50 text-amber-950"}`}>
            {currentConfirmed ? "Confirmed" : "Draft / perlu konfirmasi"}
          </span>
          <p className="mt-2 text-xs text-black/45">Revision {revision || "belum dibuat"}</p>
        </div>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <label className="text-xs font-semibold">Tanggal acara
          <input value={d.eventDate} disabled className={fieldClass} />
        </label>
        <label className="text-xs font-semibold">Zona waktu acara
          <select value={eventTimezone} onChange={(e) => setEventTimezone(e.target.value)} disabled={!editable} className={fieldClass}>
            <option value="Asia/Jakarta">WIB · Asia/Jakarta</option>
            <option value="Asia/Makassar">WITA · Asia/Makassar</option>
            <option value="Asia/Jayapura">WIT · Asia/Jayapura</option>
          </select>
        </label>
        <label className="text-xs font-semibold">Venue
          <input value={venueName} onChange={(e) => setVenueName(e.target.value)} disabled={!editable} placeholder="Nama venue final" className={fieldClass} />
        </label>
        <label className="text-xs font-semibold">Alamat venue lengkap
          <input value={venueAddress} onChange={(e) => setVenueAddress(e.target.value)} disabled={!editable} placeholder="Alamat pintu masuk / loading bila relevan" className={fieldClass} />
        </label>
      </div>

      <div className="mt-6">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-black/45">Run of Show</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <label className="text-xs font-semibold">Load-in <span className="font-normal text-black/40">(opsional)</span>
            <input type="datetime-local" value={loadInAt} onChange={(e) => setLoadInAt(e.target.value)} disabled={!editable} className={fieldClass} />
          </label>
          <label className="text-xs font-semibold">Call time
            <input type="datetime-local" value={callAt} onChange={(e) => setCallAt(e.target.value)} disabled={!editable} className={fieldClass} />
          </label>
          <label className="text-xs font-semibold">Soundcheck <span className="font-normal text-black/40">(opsional)</span>
            <input type="datetime-local" value={soundcheckAt} onChange={(e) => setSoundcheckAt(e.target.value)} disabled={!editable} className={fieldClass} />
          </label>
          <label className="text-xs font-semibold">Show start
            <input type="datetime-local" value={showStartAt} onChange={(e) => setShowStartAt(e.target.value)} disabled={!editable} className={fieldClass} />
          </label>
          <label className="text-xs font-semibold">Show end <span className="font-normal text-black/40">(opsional)</span>
            <input type="datetime-local" value={showEndAt} onChange={(e) => setShowEndAt(e.target.value)} disabled={!editable} className={fieldClass} />
          </label>
          <label className="text-xs font-semibold">Durasi tampil (menit)
            <input type="number" min="1" step="1" value={performanceDuration} onChange={(e) => setPerformanceDuration(e.target.value)} disabled={!editable} className={fieldClass} />
          </label>
        </div>
      </div>

      <div className="mt-6">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-black/45">Operational Contacts</p>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <div className="border border-black/10 p-3">
            <p className="text-xs font-semibold">Buyer / booker PIC</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <input value={buyerPicName} onChange={(e) => setBuyerPicName(e.target.value)} disabled={!editable} placeholder="Nama" className="border border-black/15 p-2 text-sm" />
              <input value={buyerPicPhone} onChange={(e) => setBuyerPicPhone(e.target.value)} disabled={!editable} placeholder="WhatsApp / telepon" className="border border-black/15 p-2 text-sm" />
            </div>
          </div>
          <div className="border border-black/10 p-3">
            <p className="text-xs font-semibold">PIC onsite venue / EO <span className="text-red-700">*</span></p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <input value={onsitePicName} onChange={(e) => setOnsitePicName(e.target.value)} disabled={!editable} placeholder="Nama onsite PIC" className="border border-black/15 p-2 text-sm" />
              <input value={onsitePicPhone} onChange={(e) => setOnsitePicPhone(e.target.value)} disabled={!editable} placeholder="WhatsApp / telepon" className="border border-black/15 p-2 text-sm" />
            </div>
          </div>
          <div className="border border-black/10 p-3">
            <p className="text-xs font-semibold">PIC teknis <span className="font-normal text-black/40">(opsional)</span></p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <input value={technicalPicName} onChange={(e) => setTechnicalPicName(e.target.value)} disabled={!editable} placeholder="Nama PIC teknis" className="border border-black/15 p-2 text-sm" />
              <input value={technicalPicPhone} onChange={(e) => setTechnicalPicPhone(e.target.value)} disabled={!editable} placeholder="WhatsApp / telepon" className="border border-black/15 p-2 text-sm" />
            </div>
          </div>
          <div className="border border-black/10 p-3">
            <p className="text-xs font-semibold">PIC talent / manager / road manager <span className="text-red-700">*</span></p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <input value={talentPicName} onChange={(e) => setTalentPicName(e.target.value)} disabled={!editable} placeholder="Nama" className="border border-black/15 p-2 text-sm" />
              <input value={talentPicPhone} onChange={(e) => setTalentPicPhone(e.target.value)} disabled={!editable} placeholder="WhatsApp / telepon" className="border border-black/15 p-2 text-sm" />
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <label className="text-xs font-semibold">Jumlah personel datang
          <input type="number" min="1" step="1" value={personnelCount} onChange={(e) => setPersonnelCount(e.target.value)} disabled={!editable} className={fieldClass} />
        </label>
        <label className="text-xs font-semibold">Final rider <span className="font-normal text-black/40">(jika tersedia)</span>
          <select value={riderVersionId} onChange={(e) => setRiderVersionId(e.target.value)} disabled={!editable} className={fieldClass}>
            <option value="">Tidak ada rider terpilih</option>
            {data.approvedRiders.map((rider) => (
              <option key={rider.id} value={rider.id}>v{rider.version_no} · {rider.source_filename ?? "Rider approved"}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2">
        <label className="text-xs font-semibold">Lineup / personnel
          <textarea value={lineupNotes} onChange={(e) => setLineupNotes(e.target.value)} disabled={!editable} placeholder="Nama/personel, format tampil, additional player bila ada" className={areaClass} />
        </label>
        <label className="text-xs font-semibold">Technical notes
          <textarea value={technicalNotes} onChange={(e) => setTechnicalNotes(e.target.value)} disabled={!editable} placeholder="PA, monitor/IEM, input, stage, lighting, kebutuhan teknis final" className={areaClass} />
        </label>
        <label className="text-xs font-semibold">Backline
          <textarea value={backlineNotes} onChange={(e) => setBacklineNotes(e.target.value)} disabled={!editable} placeholder="Yang disediakan venue / talent / vendor" className={areaClass} />
        </label>
        <label className="text-xs font-semibold">Access / loading
          <textarea value={accessLoadingNotes} onChange={(e) => setAccessLoadingNotes(e.target.value)} disabled={!editable} placeholder="Loading dock, lift, gate, credential, batas jam masuk" className={areaClass} />
        </label>
        <label className="text-xs font-semibold">Transport
          <textarea value={transportNotes} onChange={(e) => setTransportNotes(e.target.value)} disabled={!editable} placeholder="Pickup, kendaraan, titik kumpul, tiket, driver" className={areaClass} />
        </label>
        <label className="text-xs font-semibold">Accommodation
          <textarea value={accommodationNotes} onChange={(e) => setAccommodationNotes(e.target.value)} disabled={!editable} placeholder="Hotel, kamar, check-in/out bila relevan" className={areaClass} />
        </label>
        <label className="text-xs font-semibold">Hospitality
          <textarea value={hospitalityNotes} onChange={(e) => setHospitalityNotes(e.target.value)} disabled={!editable} placeholder="Meal, dressing room, air mineral, hospitality lain" className={areaClass} />
        </label>
        <label className="text-xs font-semibold">Parking
          <textarea value={parkingNotes} onChange={(e) => setParkingNotes(e.target.value)} disabled={!editable} placeholder="Slot parkir, kendaraan kru, loading vehicle" className={areaClass} />
        </label>
      </div>

      <label className="mt-4 block text-xs font-semibold">Catatan internal agency
        <textarea value={internalNotes} onChange={(e) => setInternalNotes(e.target.value)} disabled={!editable} placeholder="Tidak untuk diteruskan otomatis ke buyer/talent." className={areaClass} />
      </label>

      {editable ? (
        <div className="mt-5 border-t border-black/10 pt-5">
          {currentConfirmed ? (
            <p className="mb-3 border border-amber-500/30 bg-amber-50 p-3 text-xs leading-5 text-amber-950">
              Versi ini sudah confirmed. Menekan Simpan setelah perubahan akan membuat revision baru berstatus Draft dan menghapus status konfirmasi aktif sampai buyer dan talent reconfirm.
            </p>
          ) : null}
          <button type="button" onClick={saveAdvance} disabled={busy !== null} className="bg-black px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">
            {busy === "save" ? "Menyimpan…" : a ? "Simpan sebagai revision baru" : "Simpan Show Advance"}
          </button>
        </div>
      ) : null}

      {editable && revision > 0 && !currentConfirmed ? (
        <div className="mt-5 border border-black/10 bg-[#f5f3ee] p-4">
          <p className="text-sm font-semibold">Konfirmasi revision {revision}</p>
          <p className="mt-1 text-xs leading-5 text-black/45">
            Catat evidence komunikasi nyata, misalnya “WA buyer 18/09/2026 14:20” dan “WA manager talent 18/09/2026 14:35”. Ini V1 internal; bukan tanda tangan digital.
          </p>
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            <input value={buyerConfirmationReference} onChange={(e) => setBuyerConfirmationReference(e.target.value)} placeholder="Bukti konfirmasi buyer" className="border border-black/15 bg-white p-2 text-sm" />
            <input value={talentConfirmationReference} onChange={(e) => setTalentConfirmationReference(e.target.value)} placeholder="Bukti konfirmasi talent/manager" className="border border-black/15 bg-white p-2 text-sm" />
          </div>
          <button
            type="button"
            onClick={confirmAdvance}
            disabled={busy !== null || !buyerConfirmationReference.trim() || !talentConfirmationReference.trim()}
            className="mt-3 border border-black bg-white px-4 py-2 text-sm font-semibold disabled:opacity-40"
          >
            {busy === "confirm" ? "Mengonfirmasi…" : "Konfirmasi Show Advance"}
          </button>
        </div>
      ) : null}

      {currentConfirmed ? (
        <div className="mt-5 border border-emerald-700/20 bg-emerald-50 p-4 text-sm text-emerald-950">
          <p className="font-semibold">Revision {revision} siap menjadi basis pre-show.</p>
          <p className="mt-1 text-xs">Pre-show hanya dapat dimulai selama revision ini tetap current dan confirmed.</p>
        </div>
      ) : null}

      {data.confirmations.length > 0 ? (
        <details className="mt-5 border border-black/10">
          <summary className="cursor-pointer p-3 text-xs font-semibold">Riwayat konfirmasi Show Advance</summary>
          <div className="border-t border-black/10 p-3">
            {data.confirmations.map((item) => (
              <div key={item.id} className="border-b border-black/10 py-2 text-xs last:border-b-0">
                <strong>Revision {item.revision_no}</strong> · {shortDate(item.confirmed_at)}
                <p className="mt-1 text-black/50">Buyer: {item.buyer_confirmation_reference} · Talent: {item.talent_confirmation_reference}</p>
              </div>
            ))}
          </div>
        </details>
      ) : null}

      {error ? <p className="mt-4 text-xs font-semibold text-red-700">{error}</p> : null}
    </section>
  );
}
