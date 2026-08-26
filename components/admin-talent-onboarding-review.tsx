"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Asset = { id: string; asset_type: string; original_filename: string | null; upload_status: string; review_status: string; buyer_visible: boolean };
type ReviewData = { talent: { onboarding_status: string; public_visible: boolean; status?: string }; submission: any; assets: Asset[] };

function assetLabel(type: string) {
  if (type === "profile_photo") return "Foto profil";
  if (type === "live_performance") return "Video live utama";
  if (type === "showreel") return "Showreel";
  if (type === "event_clip") return "Cuplikan acara";
  if (type === "rider_document") return "Dokumen rider";
  return type;
}

function reviewLabel(status: string) {
  if (status === "approved") return "Disetujui";
  if (status === "rejected") return "Ditolak";
  return "Menunggu review";
}

export function AdminTalentOnboardingReview({ talentId }: { talentId: string }) {
  const router = useRouter();
  const [data, setData] = useState<ReviewData | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [note, setNote] = useState("");

  async function refresh() {
    const res = await fetch(`/api/internal-demo/admin/talent-onboarding-review?talentId=${encodeURIComponent(talentId)}`, { cache: "no-store" });
    const body = await res.json().catch(() => null);
    if (!res.ok) throw new Error(body?.detail ?? body?.error ?? "Gagal memuat review");
    setData(body);
  }

  useEffect(() => { refresh().catch((e) => setError(e.message)); }, []);

  async function act(payload: Record<string, unknown>, successText = "Review berhasil disimpan.") {
    setBusy(true); setError(""); setMessage("");
    try {
      const res = await fetch("/api/internal-demo/admin/talent-onboarding-review", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ talentId, ...payload }) });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.detail ?? body?.error ?? "Review gagal");
      setMessage(successText);
      await refresh();
      router.refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "Review gagal"); }
    finally { setBusy(false); }
  }

  const submitted = data?.submission?.status === "submitted";
  const approved = data?.talent.onboarding_status === "approved";

  return <section className="mb-7 border border-black/10 bg-white p-5 md:p-6">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><p className="text-xs font-semibold uppercase tracking-[0.12em] text-black/40">Profil & Media</p><p className="mt-2 text-sm text-black/55">Review data onboarding dan media yang akan dipakai Nusantara Star.</p></div>
      <span className="border border-black/10 px-3 py-2 text-xs font-semibold uppercase">{data?.talent.onboarding_status ?? "loading"}</span>
    </div>

    {data?.submission ? <div className="mt-5 grid gap-3 text-sm md:grid-cols-2">
      <div><b>Nama</b><p>{data.submission.name}</p></div><div><b>Kategori</b><p>{data.submission.category}</p></div>
      <div className="md:col-span-2"><b>Bio</b><p className="mt-1 whitespace-pre-wrap text-black/60">{data.submission.bio || "—"}</p></div>
      <div><b>Manager/PIC</b><p>{data.submission.manager_name || "—"}</p></div><div><b>Kontak internal</b><p>{data.submission.manager_whatsapp || data.submission.manager_email || "—"}</p></div>
    </div> : <p className="mt-5 text-sm text-black/50">Belum ada profil onboarding yang disimpan.</p>}

    <div className="mt-5 space-y-2">{data?.assets?.length ? data.assets.map((asset) => {
      const isApproved = asset.review_status === "approved";
      const isRejected = asset.review_status === "rejected";
      return <div key={asset.id} className="flex flex-col gap-3 border-t border-black/10 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm"><b>{assetLabel(asset.asset_type)}</b><p className="text-xs text-black/50">{asset.original_filename ?? "file"} · {reviewLabel(asset.review_status)}{asset.buyer_visible ? " · tampil ke buyer" : ""}</p></div>
        <div className="flex gap-2">
          <button disabled={busy || asset.upload_status !== "uploaded" || isApproved} onClick={() => act({ action: "review_asset", assetId: asset.id, decision: "approved" }, `${assetLabel(asset.asset_type)} disetujui.`)} className={`border px-3 py-2 text-xs font-semibold disabled:opacity-50 ${isApproved ? "border-green-700 bg-green-50 text-green-800" : "border-black"}`}>{isApproved ? "✓ Disetujui" : "Setujui"}</button>
          <button disabled={busy || asset.upload_status !== "uploaded" || isRejected} onClick={() => act({ action: "review_asset", assetId: asset.id, decision: "rejected" }, `${assetLabel(asset.asset_type)} ditolak.`)} className={`border px-3 py-2 text-xs font-semibold disabled:opacity-50 ${isRejected ? "border-red-700 bg-red-50 text-red-800" : "border-black/15"}`}>{isRejected ? "✓ Ditolak" : "Tolak"}</button>
        </div>
      </div>;
    }) : <p className="mt-4 text-sm text-black/50">Belum ada media.</p>}</div>

    <div className="mt-5 flex flex-col gap-3 border-t border-black/10 pt-5 md:flex-row md:items-end">
      {approved ? <div className="flex-1 border border-green-700/20 bg-green-50 p-3 text-sm font-semibold text-green-800">✓ Profil sudah disetujui dan dipublikasikan.</div> : <label className="flex-1 text-sm font-semibold">Catatan jika profil ditolak<input value={note} onChange={(e) => setNote(e.target.value)} className="mt-2 w-full border border-black/15 px-3 py-3 font-normal" /></label>}
      {!approved ? <><button disabled={busy || !submitted} onClick={() => act({ action: "reject_profile", rejectionNote: note }, "Profil dikembalikan untuk revisi.")} className="border border-black/15 px-4 py-3 text-sm font-semibold disabled:opacity-40">Tolak Profil</button><button disabled={busy || !submitted} onClick={() => act({ action: "approve_profile" }, "Profil disetujui dan dipublikasikan.")} className="border border-black bg-black px-4 py-3 text-sm font-semibold text-white disabled:opacity-40">Approve & Publish</button></> : null}
    </div>
    {message ? <p className="mt-4 text-sm font-semibold text-green-700">{message}</p> : null}{error ? <p className="mt-4 text-sm font-semibold text-red-700">{error}</p> : null}
  </section>;
}
