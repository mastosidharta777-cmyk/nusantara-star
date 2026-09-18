"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import type { AdvanceParty, CollaborativeAdvance } from "@/lib/collaborative-show-advance";

function localValue(value: string | null | undefined) {
  if (!value) return "";
  return value.replace(" ", "T").slice(0, 16);
}

function labelDate(value: string | null | undefined) {
  if (!value) return "—";
  return value.replace("T", " ").slice(0, 16);
}

export function CollaborativeShowAdvanceForm({
  bookingId,
  party,
  token,
  data,
}: {
  bookingId: string;
  party: AdvanceParty;
  token: string;
  data: CollaborativeAdvance;
}) {
  const router = useRouter();
  const a = data.advance;

  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [eventTimezone, setEventTimezone] = useState(a?.event_timezone ?? data.defaults.event_timezone);
  const [venueName, setVenueName] = useState(a?.venue_name ?? data.defaults.venue_name);
  const [venueAddress, setVenueAddress] = useState(a?.venue_address ?? "");
  const [loadInAt, setLoadInAt] = useState(localValue(a?.load_in_at_local));
  const [callAt, setCallAt] = useState(localValue(a?.call_at_local));
  const [soundcheckAt, setSoundcheckAt] = useState(localValue(a?.soundcheck_at_local));
  const [showStartAt, setShowStartAt] = useState(localValue(a?.show_start_at_local));
  const [showEndAt, setShowEndAt] = useState(localValue(a?.show_end_at_local));
  const [buyerPicName, setBuyerPicName] = useState(a?.buyer_pic_name ?? data.defaults.buyer_pic_name);
  const [buyerPicPhone, setBuyerPicPhone] = useState(a?.buyer_pic_phone ?? data.defaults.buyer_pic_phone);
  const [onsitePicName, setOnsitePicName] = useState(a?.onsite_pic_name ?? "");
  const [onsitePicPhone, setOnsitePicPhone] = useState(a?.onsite_pic_phone ?? "");
  const [technicalPicName, setTechnicalPicName] = useState(a?.technical_pic_name ?? "");
  const [technicalPicPhone, setTechnicalPicPhone] = useState(a?.technical_pic_phone ?? "");
  const [transportNotes, setTransportNotes] = useState(a?.transport_notes ?? "");
  const [accommodationNotes, setAccommodationNotes] = useState(a?.accommodation_notes ?? "");
  const [hospitalityNotes, setHospitalityNotes] = useState(a?.hospitality_notes ?? "");
  const [technicalNotes, setTechnicalNotes] = useState(a?.technical_notes ?? "");
  const [accessLoadingNotes, setAccessLoadingNotes] = useState(a?.access_loading_notes ?? "");
  const [parkingNotes, setParkingNotes] = useState(a?.parking_notes ?? "");

  const [talentPicName, setTalentPicName] = useState(a?.talent_pic_name ?? data.defaults.talent_pic_name);
  const [talentPicPhone, setTalentPicPhone] = useState(a?.talent_pic_phone ?? data.defaults.talent_pic_phone);
  const [personnelCount, setPersonnelCount] = useState(String(a?.personnel_count ?? ""));
  const [lineupNotes, setLineupNotes] = useState(a?.lineup_notes ?? "");
  const [riderVersionId, setRiderVersionId] = useState(a?.rider_version_id ?? "");
  const [backlineNotes, setBacklineNotes] = useState(a?.backline_notes ?? "");
  const [talentOperationalNotes, setTalentOperationalNotes] = useState(a?.talent_operational_notes ?? "");

  async function act(action: "save" | "confirm") {
    setBusy(action);
    setError(null);
    try {
      const payload = party === "buyer"
        ? {
            event_timezone: eventTimezone,
            venue_name: venueName,
            venue_address: venueAddress,
            load_in_at_local: loadInAt || null,
            call_at_local: callAt || null,
            soundcheck_at_local: soundcheckAt || null,
            show_start_at_local: showStartAt || null,
            show_end_at_local: showEndAt || null,
            buyer_pic_name: buyerPicName,
            buyer_pic_phone: buyerPicPhone,
            onsite_pic_name: onsitePicName,
            onsite_pic_phone: onsitePicPhone,
            technical_pic_name: technicalPicName,
            technical_pic_phone: technicalPicPhone,
            transport_notes: transportNotes,
            accommodation_notes: accommodationNotes,
            hospitality_notes: hospitalityNotes,
            technical_notes: technicalNotes,
            access_loading_notes: accessLoadingNotes,
            parking_notes: parkingNotes,
          }
        : {
            talent_pic_name: talentPicName,
            talent_pic_phone: talentPicPhone,
            personnel_count: personnelCount || null,
            lineup_notes: lineupNotes,
            rider_version_id: riderVersionId || null,
            backline_notes: backlineNotes,
            talent_operational_notes: talentOperationalNotes,
          };

      const response = await fetch("/api/show-advance/party", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ bookingId, party, token, action, ...(action === "save" ? { payload } : {}) }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error ?? body?.detail ?? "Gagal memperbarui Show Advance");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memperbarui Show Advance");
    } finally {
      setBusy(null);
    }
  }

  const field = "mt-1 w-full border border-black/15 bg-white p-2 text-sm";
  const area = "mt-1 min-h-20 w-full border border-black/15 bg-white p-2 text-sm";
  const reviewed = data.reviewed;
  const fullyConfirmed = data.fullyConfirmed;

  return (
    <main className="min-h-screen bg-[#f5f3ee] px-5 py-10 text-[#171713] md:px-10 md:py-16">
      <div className="mx-auto max-w-[920px]">
        <p className="eyebrow">Nusantara Star · Show Advance</p>
        <h1 className="mt-4 text-4xl font-semibold tracking-[-0.04em] md:text-6xl">
          {party === "buyer" ? "Lengkapi detail acara." : "Lengkapi detail talent."}
        </h1>
        <p className="mt-5 max-w-3xl text-sm leading-7 text-black/55">
          {party === "buyer"
            ? "Isi hanya data yang dikuasai pihak buyer/EO. Data talent, rider, dan personnel diisi langsung oleh talent/manager."
            : "Isi hanya data talent/manager. Detail venue, jadwal venue, onsite PIC, dan hospitality diisi buyer/EO."}
        </p>

        <section className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["Talent", data.event.talent_name],
            ["Acara", data.event.event_type ?? "—"],
            ["Tanggal", data.booking.event_date],
            ["Kota", data.booking.city ?? "—"],
          ].map(([label, value]) => (
            <div key={label} className="border border-black/10 bg-white p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-black/40">{label}</p>
              <p className="mt-2 text-sm font-semibold">{value}</p>
            </div>
          ))}
        </section>

        <div className="mt-5 border border-black/10 bg-white p-4 text-sm">
          <strong>Durasi tampil:</strong> {data.defaults.performance_duration_minutes ? `${data.defaults.performance_duration_minutes} menit` : "belum tersedia dari booking/brief"}.
          <span className="ml-1 text-black/45">Durasi tidak diketik ulang di Show Advance.</span>
        </div>

        {party === "buyer" ? (
          <section className="mt-5 border border-black/10 bg-white p-5 md:p-6">
            <h2 className="text-xl font-semibold">Bagian Buyer / EO</h2>
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <label className="text-xs font-semibold">Zona waktu acara
                <select value={eventTimezone} onChange={(e) => setEventTimezone(e.target.value)} className={field}>
                  <option value="Asia/Jakarta">WIB · Asia/Jakarta</option>
                  <option value="Asia/Makassar">WITA · Asia/Makassar</option>
                  <option value="Asia/Jayapura">WIT · Asia/Jayapura</option>
                </select>
              </label>
              <label className="text-xs font-semibold">Venue
                <input value={venueName} onChange={(e) => setVenueName(e.target.value)} className={field} placeholder="Nama venue final" />
              </label>
              <label className="text-xs font-semibold md:col-span-2">Alamat venue lengkap
                <input value={venueAddress} onChange={(e) => setVenueAddress(e.target.value)} className={field} placeholder="Alamat final / akses loading bila relevan" />
              </label>
            </div>

            <p className="mt-6 text-xs font-semibold uppercase tracking-[0.12em] text-black/45">Run of Show</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <label className="text-xs font-semibold">Load-in <span className="font-normal text-black/40">(opsional)</span><input type="datetime-local" value={loadInAt} onChange={(e) => setLoadInAt(e.target.value)} className={field} /></label>
              <label className="text-xs font-semibold">Call time<input type="datetime-local" value={callAt} onChange={(e) => setCallAt(e.target.value)} className={field} /></label>
              <label className="text-xs font-semibold">Soundcheck <span className="font-normal text-black/40">(opsional)</span><input type="datetime-local" value={soundcheckAt} onChange={(e) => setSoundcheckAt(e.target.value)} className={field} /></label>
              <label className="text-xs font-semibold">Show start<input type="datetime-local" value={showStartAt} onChange={(e) => setShowStartAt(e.target.value)} className={field} /></label>
              <label className="text-xs font-semibold">Show end <span className="font-normal text-black/40">(opsional)</span><input type="datetime-local" value={showEndAt} onChange={(e) => setShowEndAt(e.target.value)} className={field} /></label>
            </div>

            <p className="mt-6 text-xs font-semibold uppercase tracking-[0.12em] text-black/45">PIC acara</p>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <label className="text-xs font-semibold">Buyer / booker PIC<input value={buyerPicName} onChange={(e) => setBuyerPicName(e.target.value)} className={field} placeholder="Nama" /><input value={buyerPicPhone} onChange={(e) => setBuyerPicPhone(e.target.value)} className={field} placeholder="WhatsApp / telepon" /></label>
              <label className="text-xs font-semibold">PIC onsite venue / EO<input value={onsitePicName} onChange={(e) => setOnsitePicName(e.target.value)} className={field} placeholder="Nama" /><input value={onsitePicPhone} onChange={(e) => setOnsitePicPhone(e.target.value)} className={field} placeholder="WhatsApp / telepon" /></label>
              <label className="text-xs font-semibold">PIC teknis <span className="font-normal text-black/40">(opsional)</span><input value={technicalPicName} onChange={(e) => setTechnicalPicName(e.target.value)} className={field} placeholder="Nama" /><input value={technicalPicPhone} onChange={(e) => setTechnicalPicPhone(e.target.value)} className={field} placeholder="WhatsApp / telepon" /></label>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-2">
              <label className="text-xs font-semibold">Technical provision<textarea value={technicalNotes} onChange={(e) => setTechnicalNotes(e.target.value)} className={area} placeholder="PA, monitor, stage, lighting yang disediakan" /></label>
              <label className="text-xs font-semibold">Access / loading<textarea value={accessLoadingNotes} onChange={(e) => setAccessLoadingNotes(e.target.value)} className={area} /></label>
              <label className="text-xs font-semibold">Transport arrangement<textarea value={transportNotes} onChange={(e) => setTransportNotes(e.target.value)} className={area} /></label>
              <label className="text-xs font-semibold">Accommodation arrangement<textarea value={accommodationNotes} onChange={(e) => setAccommodationNotes(e.target.value)} className={area} /></label>
              <label className="text-xs font-semibold">Hospitality<textarea value={hospitalityNotes} onChange={(e) => setHospitalityNotes(e.target.value)} className={area} /></label>
              <label className="text-xs font-semibold">Parking<textarea value={parkingNotes} onChange={(e) => setParkingNotes(e.target.value)} className={area} /></label>
            </div>
          </section>
        ) : (
          <section className="mt-5 border border-black/10 bg-white p-5 md:p-6">
            <h2 className="text-xl font-semibold">Bagian Talent / Manager</h2>
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <label className="text-xs font-semibold">PIC talent / manager / road manager
                <input value={talentPicName} onChange={(e) => setTalentPicName(e.target.value)} className={field} placeholder="Nama" />
                <input value={talentPicPhone} onChange={(e) => setTalentPicPhone(e.target.value)} className={field} placeholder="WhatsApp / telepon" />
              </label>
              <label className="text-xs font-semibold">Jumlah personel datang
                <input type="number" min="1" step="1" value={personnelCount} onChange={(e) => setPersonnelCount(e.target.value)} className={field} />
              </label>
              <label className="text-xs font-semibold">Final rider
                <select value={riderVersionId} onChange={(e) => setRiderVersionId(e.target.value)} className={field}>
                  <option value="">Tidak ada rider terpilih</option>
                  {data.approvedRiders.map((rider) => <option key={rider.id} value={rider.id}>v{rider.version_no} · {rider.source_filename ?? "Rider approved"}</option>)}
                </select>
              </label>
            </div>
            <div className="mt-5 grid gap-3 md:grid-cols-2">
              <label className="text-xs font-semibold">Lineup / personnel<textarea value={lineupNotes} onChange={(e) => setLineupNotes(e.target.value)} className={area} placeholder="Nama/personel, format tampil, additional player" /></label>
              <label className="text-xs font-semibold">Backline requirement<textarea value={backlineNotes} onChange={(e) => setBacklineNotes(e.target.value)} className={area} /></label>
              <label className="text-xs font-semibold md:col-span-2">Catatan operasional talent<textarea value={talentOperationalNotes} onChange={(e) => setTalentOperationalNotes(e.target.value)} className={area} placeholder="Catatan jadwal, teknis, travel, atau hal yang perlu diselaraskan dengan buyer/EO." /></label>
            </div>
          </section>
        )}

        <section className="mt-5 border border-black/10 bg-white p-5 md:p-6">
          <h2 className="text-lg font-semibold">Status revision</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="border border-black/10 p-3 text-sm"><span className="text-black/45">Revision</span><br /><strong>{a?.revision_no ?? "belum dibuat"}</strong></div>
            <div className="border border-black/10 p-3 text-sm"><span className="text-black/45">Buyer/EO input</span><br /><strong>{a?.buyer_submitted_at ? "Sudah" : "Belum"}</strong></div>
            <div className="border border-black/10 p-3 text-sm"><span className="text-black/45">Talent input</span><br /><strong>{a?.talent_submitted_at ? "Sudah" : "Belum"}</strong></div>
            <div className="border border-black/10 p-3 text-sm"><span className="text-black/45">Admin review</span><br /><strong>{reviewed ? "Lolos review" : "Menunggu"}</strong></div>
          </div>

          {reviewed ? (
            <div className="mt-4 border border-emerald-700/20 bg-emerald-50 p-4 text-sm text-emerald-950">
              <p className="font-semibold">Revision ini sudah direview Nusantara Star.</p>
              <p className="mt-1 text-xs leading-5">Periksa merged summary di bawah. Jika Anda mengubah data lalu menyimpan lagi, revision berubah dan review/confirmation harus diulang.</p>
            </div>
          ) : (
            <p className="mt-4 text-xs leading-5 text-black/50">Setelah Buyer/EO dan Talent/Manager sama-sama mengisi, Nusantara Star akan review merged revision sebelum final confirmation.</p>
          )}

          {!fullyConfirmed ? (
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" onClick={() => act("save")} disabled={busy !== null} className="bg-black px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">
                {busy === "save" ? "Menyimpan…" : data.partySubmitted ? "Simpan perubahan saya" : "Simpan & kirim bagian saya"}
              </button>
              {reviewed && data.partySubmitted && !data.partyConfirmed ? (
                <button type="button" onClick={() => act("confirm")} disabled={busy !== null} className="border border-black px-4 py-2 text-sm font-semibold disabled:opacity-40">
                  {busy === "confirm" ? "Mengonfirmasi…" : "Confirm revision final"}
                </button>
              ) : null}
            </div>
          ) : (
            <p className="mt-4 border border-emerald-700/20 bg-emerald-50 p-4 text-sm font-semibold text-emerald-900">Show Advance revision {a?.revision_no} sudah final-confirmed oleh Buyer/EO dan Talent/Manager.</p>
          )}

          {error ? <p className="mt-3 text-xs font-semibold text-red-700">{error}</p> : null}
        </section>

        {a ? (
          <section className="mt-5 border border-black/10 bg-white p-5 md:p-6">
            <h2 className="text-lg font-semibold">Merged operational summary</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="border border-black/10 p-3 text-sm"><span className="text-black/45">Venue</span><br /><strong>{a.venue_name ?? "—"}</strong><br />{a.venue_address ?? "—"}</div>
              <div className="border border-black/10 p-3 text-sm"><span className="text-black/45">Schedule</span><br />Call: {labelDate(a.call_at_local)}<br />Show: {labelDate(a.show_start_at_local)}</div>
              <div className="border border-black/10 p-3 text-sm"><span className="text-black/45">Onsite PIC</span><br />{a.onsite_pic_name ?? "—"} · {a.onsite_pic_phone ?? "—"}</div>
              <div className="border border-black/10 p-3 text-sm"><span className="text-black/45">Talent PIC</span><br />{a.talent_pic_name ?? "—"} · {a.talent_pic_phone ?? "—"}</div>
              <div className="border border-black/10 p-3 text-sm"><span className="text-black/45">Personnel / lineup</span><br />{a.personnel_count ?? "—"} orang<br />{a.lineup_notes ?? "—"}</div>
              <div className="border border-black/10 p-3 text-sm"><span className="text-black/45">Operational notes</span><br />{a.talent_operational_notes ?? "—"}</div>
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}
