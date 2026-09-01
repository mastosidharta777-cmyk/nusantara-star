"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Asset = { id: string; asset_type: string; provider: string; original_filename: string | null; mime_type?: string | null; upload_status: string; review_status: string; buyer_visible: boolean; preview_url?: string | null };
type Rider = { version_no: number; source_type: string; source_filename?: string | null; normalized_data?: Record<string, unknown>; missing_questions?: { key: string; question: string; required: boolean }[]; answers?: Record<string,string>; status: string; normalization_source?: string };
type ReviewData = { talent: { onboarding_status: string; public_visible: boolean; status?: string }; submission: any; assets: Asset[]; rider?: Rider | null; riderMigrationRequired?: boolean };

function assetLabel(type: string) {
  if (type === "profile_photo") return "Foto profil";
  if (type === "live_performance") return "Video live utama";
  if (type === "showreel") return "Showreel";
  if (type === "event_clip") return "Cuplikan acara";
  if (type === "rider_document") return "Dokumen rider";
  return "File";
}
function reviewLabel(status: string) {
  if (status === "approved") return "Disetujui";
  if (status === "rejected") return "Ditolak";
  return "Menunggu peninjauan";
}
function onboardingStatus(status?: string) {
  if (status === "not_started") return "Belum dimulai";
  if (status === "draft") return "Draf";
  if (status === "submitted") return "Sudah dikirim";
  if (status === "approved") return "Disetujui";
  if (status === "rejected") return "Ditolak";
  return status ? "Status tidak dikenal" : "Memuat…";
}
function riderStatus(status?: string) {
  if (status === "needs_talent_input") return "Perlu dilengkapi talent";
  if (status === "ready_for_admin") return "Siap ditinjau admin";
  if (status === "admin_approved") return "Disetujui admin";
  return status ? "Status rider tidak dikenal" : "Belum diproses";
}
function compactRider(data?: Record<string, unknown>) {
  if (!data) return [] as string[];
  const rows: string[] = [];
  if (data.party_size != null) rows.push(`Total rombongan: ${data.party_size}`);
  if (data.performers_count != null) rows.push(`Jumlah penampil: ${data.performers_count}`);
  if (data.crew_count != null) rows.push(`Jumlah kru: ${data.crew_count}`);
  if (typeof data.departure_city === "string" && data.departure_city) rows.push(`Kota keberangkatan: ${data.departure_city}`);
  if (typeof data.accommodation_required === "boolean") rows.push(`Akomodasi: ${data.accommodation_required ? "Perlu" : "Tidak perlu"}`);
  const sections: [string,string][] = [["technical_requirements","Kebutuhan teknis"],["stage_backline","Panggung / backline"],["hospitality","Konsumsi / hospitality"],["transport_requirements","Transportasi"],["baggage_requirements","Bagasi"],["accommodation_requirements","Akomodasi"],["meals_per_diem","Makan / uang harian"],["special_requirements","Kebutuhan khusus"]];
  for (const [key,label] of sections) { const arr=(data as any)[key]; if(Array.isArray(arr)&&arr.length) rows.push(`${label}: ${arr.join("; ")}`); }
  return rows;
}

export function AdminTalentOnboardingReview({ talentId }: { talentId: string }) {
  const router = useRouter();
  const [data, setData] = useState<ReviewData | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [note, setNote] = useState("");
  const [openPreview, setOpenPreview] = useState<Record<string, boolean>>({});

  async function refresh() {
    const res = await fetch(`/api/internal-demo/admin/talent-onboarding-review?talentId=${encodeURIComponent(talentId)}`, { cache: "no-store" });
    const body = await res.json().catch(() => null);
    if (!res.ok) throw new Error(body?.error ?? "Gagal memuat peninjauan");
    setData(body);
  }
  useEffect(() => { refresh().catch(() => setError("Gagal memuat peninjauan")); }, []);

  async function act(payload: Record<string, unknown>, successText = "Hasil peninjauan berhasil disimpan.") {
    setBusy(true); setError(""); setMessage("");
    try {
      const res = await fetch("/api/internal-demo/admin/talent-onboarding-review", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ talentId, ...payload }) });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? "Peninjauan gagal");
      setMessage(successText); await refresh(); router.refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "Peninjauan gagal"); }
    finally { setBusy(false); }
  }

  const submitted = data?.submission?.status === "submitted";
  const approved = data?.talent.onboarding_status === "approved";
  const riderRows = compactRider(data?.rider?.normalized_data);
  const riderApproved = !data?.rider || data.rider.status === "admin_approved";
  const riderReady = data?.rider?.status === "ready_for_admin" && !(data.rider.missing_questions?.length);

  return <section className="mb-7 border border-black/10 bg-white p-5 md:p-6">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><p className="text-xs font-semibold uppercase tracking-[0.12em] text-black/40">Profil & Media</p><p className="mt-2 text-sm text-black/55">Periksa isi profil, media, dan rider sebelum mengambil keputusan.</p></div>
      <span className="border border-black/10 px-3 py-2 text-xs font-semibold uppercase">{onboardingStatus(data?.talent.onboarding_status)}</span>
    </div>

    {data?.submission ? <div className="mt-5 grid gap-3 text-sm md:grid-cols-2">
      <div><b>Nama</b><p>{data.submission.name}</p></div><div><b>Kategori</b><p>{data.submission.category}</p></div>
      <div className="md:col-span-2"><b>Bio</b><p className="mt-1 whitespace-pre-wrap text-black/60">{data.submission.bio || "—"}</p></div>
      <div><b>Manajer / PIC</b><p>{data.submission.manager_name || "—"}</p></div><div><b>Kontak internal</b><p>{data.submission.manager_whatsapp || data.submission.manager_email || "—"}</p></div>
      <div className="md:col-span-2"><b>Link media/portofolio utama</b><p>{data.submission.portfolio_url ? <a href={data.submission.portfolio_url} target="_blank" rel="noreferrer" className="break-all underline">{data.submission.portfolio_url}</a> : "—"}</p></div>
      <div className="md:col-span-2"><b>Batasan booking</b><p className="mt-1 whitespace-pre-wrap text-black/60">{data.submission.booking_limitations || "Tidak ada batasan yang dicantumkan."}</p></div>
    </div> : <p className="mt-5 text-sm text-black/50">Belum ada profil onboarding yang disimpan.</p>}

    {data?.rider ? <div className="mt-5 border border-black/10 bg-[#f8f7f3] p-4 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2"><div><b>Rider Utama V{data.rider.version_no}</b><p className="mt-1 text-xs text-black/50">{data.rider.source_filename || (data.rider.source_type === "form_text" ? "Rider dari isian formulir" : "Sumber rider")} · {data.rider.normalization_source === "ai" ? "dinormalisasi AI" : "dinormalisasi dengan aturan sistem"}</p></div><span className="border border-black/10 bg-white px-2 py-1 text-xs font-semibold">{riderStatus(data.rider.status)}</span></div>
      {riderRows.length ? <ul className="mt-3 space-y-1 text-black/65">{riderRows.map((row)=><li key={row}>• {row}</li>)}</ul> : <p className="mt-3 text-black/50">Belum ada informasi rider terstruktur.</p>}
      {data.rider.missing_questions?.length ? <div className="mt-3 border-t border-black/10 pt-3"><p className="font-semibold">Masih perlu dijawab talent:</p><ul className="mt-2 space-y-1 text-black/60">{data.rider.missing_questions.map((q)=><li key={q.key}>• {q.question}</li>)}</ul></div> : <p className="mt-3 font-semibold text-green-800">✓ Informasi dasar rider lengkap untuk ditinjau admin.</p>}
      <div className="mt-4 border-t border-black/10 pt-3"><p className="text-xs text-black/50">Persetujuan dokumen sumber dan persetujuan Rider Utama adalah dua langkah terpisah. Rider Utama hanya disetujui setelah hasil normalisasi diperiksa.</p>{data.rider.status === "admin_approved" ? <p className="mt-3 font-semibold text-green-800">✓ Rider Utama sudah disetujui admin.</p> : <button disabled={busy || !riderReady} onClick={() => act({ action: "approve_rider" }, "Rider Utama disetujui.")} className="mt-3 border border-black bg-black px-4 py-2 text-xs font-semibold text-white disabled:opacity-40">Setujui Rider Utama</button>}</div>
    </div> : data?.riderMigrationRequired ? <p className="mt-5 border border-amber-300 bg-amber-50 p-3 text-sm">Fitur normalisasi rider belum diaktifkan di database.</p> : <p className="mt-5 text-sm text-black/50">Tidak ada rider utama. Profil tetap dapat ditinjau jika talent memang tidak memiliki kebutuhan rider khusus.</p>}

    <div className="mt-5 space-y-3">{data?.assets?.length ? data.assets.map((asset) => {
      const isApproved = asset.review_status === "approved"; const isRejected = asset.review_status === "rejected"; const previewed = !!openPreview[asset.id];
      const isImage = asset.asset_type === "profile_photo"; const isVideo = ["live_performance", "showreel", "event_clip"].includes(asset.asset_type); const isYoutube = asset.provider === "youtube_unlisted"; const isPdf = asset.mime_type === "application/pdf";
      return <div key={asset.id} className="border-t border-black/10 py-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div className="text-sm"><b>{assetLabel(asset.asset_type)}</b><p className="text-xs text-black/50">{asset.original_filename ?? "file"} · {reviewLabel(asset.review_status)}{asset.buyer_visible ? " · tampil ke klien" : ""}</p></div><div className="flex flex-wrap gap-2">
          {asset.preview_url ? <button onClick={() => setOpenPreview((v) => ({ ...v, [asset.id]: !v[asset.id] }))} className="border border-black/20 px-3 py-2 text-xs font-semibold">{previewed ? "Tutup pratinjau" : "Lihat dahulu"}</button> : <span className="px-3 py-2 text-xs text-red-700">Pratinjau tidak tersedia</span>}
          <button disabled={busy || asset.upload_status !== "uploaded" || isApproved || (!previewed && !isApproved)} onClick={() => act({ action: "review_asset", assetId: asset.id, decision: "approved" }, `${assetLabel(asset.asset_type)} disetujui.`)} className={`border px-3 py-2 text-xs font-semibold disabled:opacity-40 ${isApproved ? "border-green-700 bg-green-50 text-green-800" : "border-black"}`}>{isApproved ? "✓ Disetujui" : "Setujui"}</button>
          <button disabled={busy || asset.upload_status !== "uploaded" || isRejected} onClick={() => act({ action: "review_asset", assetId: asset.id, decision: "rejected" }, `${assetLabel(asset.asset_type)} ditolak.`)} className={`border px-3 py-2 text-xs font-semibold disabled:opacity-40 ${isRejected ? "border-red-700 bg-red-50 text-red-800" : "border-black/15"}`}>{isRejected ? "✓ Ditolak" : "Tolak"}</button>
        </div></div>
        {previewed && asset.preview_url ? <div className="mt-4 border border-black/10 bg-[#f5f3ee] p-3">{isImage ? <img src={asset.preview_url} alt={asset.original_filename ?? "Pratinjau foto"} className="max-h-[560px] w-full object-contain" /> : null}{isYoutube ? <div className="aspect-video w-full overflow-hidden bg-black"><iframe src={asset.preview_url} title={asset.original_filename ?? "Pratinjau YouTube"} loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowFullScreen className="h-full w-full" /></div> : isVideo ? <video src={asset.preview_url} controls preload="metadata" className="max-h-[560px] w-full bg-black" /> : null}{asset.asset_type === "rider_document" && isPdf ? <iframe src={asset.preview_url} title={asset.original_filename ?? "Pratinjau rider"} className="h-[620px] w-full bg-white" /> : null}{asset.asset_type === "rider_document" && !isPdf ? <a href={asset.preview_url} target="_blank" rel="noreferrer" className="text-sm font-semibold underline">Buka dokumen rider di tab baru</a> : null}<p className="mt-2 text-xs text-black/45">Pratinjau privat sementara. Setujui hanya setelah isinya benar-benar diperiksa.</p></div> : null}
      </div>;
    }) : <p className="mt-4 text-sm text-black/50">Belum ada media.</p>}</div>

    {!riderApproved && submitted ? <p className="mt-5 border border-amber-300 bg-amber-50 p-3 text-sm">Profil belum dapat dipublikasikan karena Rider Utama belum disetujui admin.</p> : null}
    <div className="mt-5 flex flex-col gap-3 border-t border-black/10 pt-5 md:flex-row md:items-end">
      {approved ? <div className="flex-1 border border-green-700/20 bg-green-50 p-3 text-sm font-semibold text-green-800">✓ Profil sudah disetujui dan dipublikasikan.</div> : <label className="flex-1 text-sm font-semibold">Catatan jika profil ditolak<input value={note} onChange={(e) => setNote(e.target.value)} className="mt-2 w-full border border-black/15 px-3 py-3 font-normal" /></label>}
      {!approved ? <><button disabled={busy || !submitted} onClick={() => act({ action: "reject_profile", rejectionNote: note }, "Profil dikembalikan untuk revisi.")} className="border border-black/15 px-4 py-3 text-sm font-semibold disabled:opacity-40">Tolak Profil</button><button disabled={busy || !submitted || !riderApproved} onClick={() => act({ action: "approve_profile" }, "Profil disetujui dan dipublikasikan.")} className="border border-black bg-black px-4 py-3 text-sm font-semibold text-white disabled:opacity-40">Setujui & Publikasikan</button></> : null}
    </div>
    {message ? <p className="mt-4 text-sm font-semibold text-green-700">{message}</p> : null}{error ? <p className="mt-4 text-sm font-semibold text-red-700">{error}</p> : null}
  </section>;
}
