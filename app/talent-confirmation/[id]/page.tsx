import Link from "next/link";
import { notFound } from "next/navigation";

import { AvailabilityResponseActions } from "@/components/availability-response-actions";
import { loadAvailabilityResponseDetail } from "@/lib/availability-response-detail";
import { verifyAccessToken } from "@/lib/signed-access";

export const dynamic = "force-dynamic";

function money(value: number | null) {
  if (value == null) return "—";
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value);
}
function humanAvailability(value: string | null | undefined) {
  if (value === "confirmed") return "Tersedia";
  if (value === "unavailable") return "Tidak tersedia";
  if (value === "tentative") return "Belum final (data lama)";
  return "Menunggu konfirmasi";
}
function formatRequirement(items: string[] | null | undefined) {
  const row = (items ?? []).find((item) => /^format penampilan\s*:/i.test(item));
  return row ? row.replace(/^format penampilan\s*:/i, "").trim() : null;
}
function otherRequirements(items: string[] | null | undefined) {
  return (items ?? []).filter((item) => !/^format penampilan\s*:/i.test(item));
}

export default async function TalentConfirmationPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ token?: string }> }) {
  const { id } = await params;
  const { token = "" } = await searchParams;
  const hosted = Boolean(process.env.VERCEL_ENV);
  if (hosted && !verifyAccessToken(token, "talent_offer", id)) notFound();

  const detail = await loadAvailabilityResponseDetail(id);
  if (!detail) notFound();
  const { request, brief, talent, offer } = detail;
  const requestedFormat = formatRequirement(brief.special_requirements);
  const requirements = otherRequirements(brief.special_requirements);

  return (
    <main className="min-h-screen bg-[#f5f3ee] text-[#171713]">
      <div className="mx-auto max-w-[760px] px-5 py-8 md:px-10 md:py-12">
        <p className="eyebrow mb-3">Nusantara Star · Permintaan Acara</p>
        <h1 className="text-3xl font-semibold tracking-[-0.03em] md:text-5xl">{talent.name}</h1>
        <p className="mt-3 text-sm leading-6 text-black/55">Periksa detail acara di bawah ini. Setelah jadwal benar-benar dipastikan, pilih Tersedia atau Tidak tersedia. Jika tersedia, isi penawaran untuk acara ini. Jawaban Tersedia belum berarti pemesanan sudah dikonfirmasi.</p>
        <section className="mt-7 border border-black/10 bg-white p-5 md:p-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <div><p className="text-xs font-semibold uppercase tracking-[0.12em] text-black/40">Acara</p><p className="mt-2 font-semibold">{brief.event_type ?? "—"}</p></div>
            <div><p className="text-xs font-semibold uppercase tracking-[0.12em] text-black/40">Tanggal</p><p className="mt-2 font-semibold">{brief.event_date ?? "—"}</p></div>
            <div><p className="text-xs font-semibold uppercase tracking-[0.12em] text-black/40">Kota</p><p className="mt-2 font-semibold">{brief.city ?? "—"}</p></div>
            <div><p className="text-xs font-semibold uppercase tracking-[0.12em] text-black/40">Lokasi / Venue</p><p className="mt-2 font-semibold">{brief.venue ?? "Belum diinformasikan"}</p></div>
            <div><p className="text-xs font-semibold uppercase tracking-[0.12em] text-black/40">Kategori</p><p className="mt-2 font-semibold">{brief.talent_category ?? "—"}</p></div>
            <div><p className="text-xs font-semibold uppercase tracking-[0.12em] text-black/40">Format penampilan</p><p className="mt-2 font-semibold">{requestedFormat ?? "Belum ditentukan"}</p></div>
            <div><p className="text-xs font-semibold uppercase tracking-[0.12em] text-black/40">Durasi</p><p className="mt-2 font-semibold">{brief.performance_duration_minutes ? `${brief.performance_duration_minutes} menit` : "Belum ditentukan"}</p></div>
            <div><p className="text-xs font-semibold uppercase tracking-[0.12em] text-black/40">Perkiraan jumlah tamu</p><p className="mt-2 font-semibold">{brief.audience_size != null ? `${brief.audience_size} orang` : "Belum diinformasikan"}</p></div>
          </div>

          {requirements.length ? (
            <div className="mt-6 border-t border-black/10 pt-5">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-black/40">Kebutuhan / Catatan Klien</p>
              <ul className="mt-3 space-y-2 text-sm leading-6 text-black/65">
                {requirements.map((item) => <li key={item}>• {item.replace(/^catatan buyer\s*:/i, "").trim()}</li>)}
              </ul>
            </div>
          ) : null}

          {offer ? (
            <div className="mt-6 border border-black/10 bg-[#f5f3ee] p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-black/45">Jawaban terakhir</p>
              <div className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
                <p><span className="text-black/45">Ketersediaan:</span><br />{humanAvailability(offer.availability_status)}</p>
                <p><span className="text-black/45">Fee untuk acara ini:</span><br />{money(offer.event_fee)}</p>
                <p><span className="text-black/45">Ketentuan pembayaran:</span><br />{offer.payment_terms ?? "—"}</p>
                <p><span className="text-black/45">Penawaran berlaku sampai:</span><br />{offer.quote_valid_until ? new Date(offer.quote_valid_until).toLocaleString("id-ID") : "—"}</p>
              </div>
            </div>
          ) : null}

          <AvailabilityResponseActions requestId={request.id} currentStatus={request.status} existingOffer={offer} accessToken={token} />
        </section>
        {!hosted ? <Link href={`/admin/briefs/${brief.id}`} className="mt-6 inline-block text-sm font-semibold text-black/55 hover:text-black">← Kembali ke Detail Permintaan</Link> : null}
      </div>
    </main>
  );
}
