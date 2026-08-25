"use client";

import { useEffect, useState } from "react";

type Asset = { id: string; asset_type: string; original_filename: string | null; upload_status: string; review_status: string; buyer_visible: boolean };

type ReviewData = { talent: { onboarding_status: string; public_visible: boolean }; submission: any; assets: Asset[] };

export function AdminTalentOnboardingReview({ talentId }: { talentId: string }) {
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

  async function act(payload: Record<string, unknown>) {
    setBusy(true); setError(""); setMessage("");
    try {
      const res = await fetch("/api/internal-demo/admin/talent-onboarding-review", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ talentId, ...payload }) });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.detail ?? body?.error ?? "Review gagal");
      setMessage("Review berhasil disimpan."); await refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "Review gagal"); } finally { setBusy(false); }
  }

  return <section className="mb-7 border border-black/10 bg-white p-5 md:p-6">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[0.12em] text-black/40">Onboarding & Media Review</p><p className="mt-2 text-sm text-black/55">Flow utama. Profil lama di bawah hanya untuk data komersial internal.</p></div><span className="border border-black/10 px-3 py-2 text-xs font-semibold uppercase">{data?.talent.onboarding_status ?? "loading"}</span></div>
    {data?.submission ? <div className="mt-5 grid gap-3 text-sm md:grid-cols-2"><div><b>Nama</b><p>{data.submission.name}</p></div><div><b>Kategori</b><p>{data.submission.category}</p></div><div className="md:col-span-2"><b>Bio</b><p className="mt-1 whitespace-pre-wrap text-black/60">{data.submission.bio || "—"}</p></div><div><b>Manager/PIC</b><p>{data.submission.manager_name || "—"}</p></div><div><b>Kontak internal</b><p>{data.submission.manager_whatsapp || data.submission.manager_email || "—"}</p></div></div> : <p className="mt-5 text-sm text-black/50">Belum ada profil onboarding yang disimpan.</p>}
    <div className="mt-5 space-y-2">{data?.assets?.length ? data.assets.map((asset) => <div key={asset.id} className="flex flex-col gap-3 border-t border-black/10 py-3 sm:flex-row sm:items-center sm:justify-between"><div className="text-sm"><b>{asset.asset_type}</b><p className="text-xs text-black/50">{asset.original_filename ?? "file"} · {asset.upload_status} · {asset.review_status}</p></div><div className="flex gap-2"><button disabled={busy || asset.upload_status !== "uploaded"} onClick={() => act({ action: "review_asset", assetId: asset.id, decision: "approved" })} className="border border-black px-3 py-2 text-xs font-semibold disabled:opacity-40">Approve</button><button disabled={busy || asset.upload_status !== "uploaded"} onClick={() => act({ action: "review_asset", assetId: asset.id, decision: "rejected" })} className="border border-black/15 px-3 py-2 text-xs font-semibold disabled:opacity-40">Reject</button></div></div>) : <p className="mt-4 text-sm text-black/50">Belum ada media.</p>}</div>
    <div className="mt-5 flex flex-col gap-3 border-t border-black/10 pt-5 md:flex-row md:items-end"><label className="flex-1 text-sm font-semibold">Catatan jika ditolak<input value={note} onChange={(e) => setNote(e.target.value)} className="mt-2 w-full border border-black/15 px-3 py-3 font-normal" /></label><button disabled={busy || data?.submission?.status !== "submitted"} onClick={() => act({ action: "reject_profile", rejectionNote: note })} className="border border-black/15 px-4 py-3 text-sm font-semibold disabled:opacity-40">Tolak Profil</button><button disabled={busy || data?.submission?.status !== "submitted"} onClick={() => act({ action: "approve_profile" })} className="border border-black bg-black px-4 py-3 text-sm font-semibold text-white disabled:opacity-40">Approve & Publish</button></div>
    {message ? <p className="mt-4 text-sm font-semibold text-green-700">{message}</p> : null}{error ? <p className="mt-4 text-sm font-semibold text-red-700">{error}</p> : null}
  </section>;
}
