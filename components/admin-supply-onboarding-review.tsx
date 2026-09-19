"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { supplyDetailFields, supplyServiceSummary, supplyTypeLabel, type SupplyType } from "@/lib/supply-onboarding";

type ReviewData = {
  supply: {
    id: string;
    supply_type: Exclude<SupplyType, "talent">;
    onboarding_status: string;
    public_visible: boolean;
    status: string;
  };
  submission: any;
  assets: Array<{ id:string; asset_type:string; original_filename:string|null; upload_status:string; review_status:string; buyer_visible:boolean; preview_url?:string|null }>;
};

function statusLabel(value?: string) {
  if (value === "not_started") return "Belum dimulai";
  if (value === "in_progress") return "Sedang dilengkapi";
  if (value === "submitted") return "Sudah dikirim";
  if (value === "approved") return "Disetujui";
  if (value === "rejected") return "Perlu revisi";
  return value ?? "Memuat…";
}
function redirectToAdminLogin() {
  const next = window.location.pathname + window.location.search;
  window.location.assign(`/admin/login?next=${encodeURIComponent(next)}`);
}
function list(value: unknown) {
  return Array.isArray(value) && value.length ? value.join(", ") : "—";
}
function detailValue(value: unknown, key: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "—";
  const raw = (value as Record<string, unknown>)[key];
  return typeof raw === "string" && raw.trim() ? raw : "—";
}

export function AdminSupplyOnboardingReview({ supplyId }: { supplyId: string }) {
  const router = useRouter();
  const [data, setData] = useState<ReviewData | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [note, setNote] = useState("");

  async function refresh() {
    const response = await fetch(`/api/internal-demo/admin/supply-onboarding-review?supplyId=${encodeURIComponent(supplyId)}`, { cache: "no-store" });
    const body = await response.json().catch(() => null);
    if (response.status === 401) {
      redirectToAdminLogin();
      throw new Error("Sesi admin berakhir.");
    }
    if (!response.ok) throw new Error(body?.error ?? "Gagal memuat peninjauan");
    setData(body);
  }

  useEffect(() => {
    refresh().catch((err) => setError(err instanceof Error ? err.message : "Gagal memuat peninjauan"));
  }, []);

  async function act(action: "approve_profile" | "reject_profile", successText: string) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/internal-demo/admin/supply-onboarding-review", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ supplyId, action, rejectionNote: note }),
      });
      const body = await response.json().catch(() => null);
      if (response.status === 401) {
        redirectToAdminLogin();
        return;
      }
      if (!response.ok) throw new Error(body?.error ?? "Peninjauan gagal");
      setMessage(successText);
      setNote("");
      await refresh();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Peninjauan gagal");
    } finally {
      setBusy(false);
    }
  }

  async function reviewPhoto(assetId: string, decision: "approved" | "rejected") {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/internal-demo/admin/supply-onboarding-review", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ supplyId, action: "review_asset", assetId, decision }) });
      const body = await response.json().catch(() => null);
      if (response.status === 401) { redirectToAdminLogin(); return; }
      if (!response.ok) throw new Error(body?.error ?? "Peninjauan foto gagal");
      setMessage(decision === "approved" ? "Foto disetujui." : "Foto dikembalikan untuk diganti.");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Peninjauan foto gagal");
    } finally { setBusy(false); }
  }

  const submitted = data?.submission?.status === "submitted";
  const approved = data?.supply.onboarding_status === "approved";
  const label = supplyTypeLabel(data?.supply.supply_type);
  const services = data?.supply ? supplyServiceSummary(data.supply.supply_type, data?.submission?.supply_service_ids, data?.submission?.primary_supply_service_id, data?.submission?.supply_other_service) : null;
  const detailFields = data?.supply ? supplyDetailFields(data.supply.supply_type, data?.submission?.primary_supply_service_id) : [];

  return (
    <section className="mt-5 border border-black/10 bg-white p-5 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-black/40">Review {label}</p>
          <p className="mt-2 text-sm text-black/55">Verifikasi profil operasional, detail kategori, dan portofolio sebelum status internal disetujui.</p>
        </div>
        <span className="border border-black/10 px-3 py-2 text-xs font-semibold uppercase">{statusLabel(data?.supply.onboarding_status)}</span>
      </div>

      {data?.submission ? (
        <div className="mt-5 grid gap-4 text-sm md:grid-cols-2">
          <div><b>Nama</b><p>{data.submission.name || "—"}</p></div>
          <div><b>Layanan Utama</b><p>{services?.primary || "—"}</p></div>
          <div><b>Layanan tambahan</b><p>{services?.additional.join(", ") || "—"}</p></div>
          <div><b>Kota basis</b><p>{data.submission.base_city || "—"}</p></div>
          <div><b>Kota layanan</b><p>{list(data.submission.service_cities)}</p></div>
          <div><b>Layanan / format</b><p>{list(data.submission.performance_formats)}</p></div>
          <div><b>Kapabilitas</b><p>{list(data.submission.capability_tags)}</p></div>
          <div className="md:col-span-2"><b>Jenis proyek / acara</b><p>{list(data.submission.event_types)}</p></div>

          {detailFields.length ? <div className="md:col-span-2 border-y border-black/10 py-4"><p className="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-black/40">Detail layanan utama: {services?.primary}</p><div className="grid gap-4 md:grid-cols-2">{detailFields.map((item) => <div key={item.key} className={item.kind === "textarea" ? "md:col-span-2" : ""}><b>{item.label}</b><p className="mt-1 whitespace-pre-wrap text-black/60">{detailValue(data.submission.supply_details, item.key)}</p></div>)}</div></div> : null}

          {data.submission.bio_source && data.submission.bio_source !== data.submission.bio ? <>
            <div className="md:col-span-2 border-y border-black/10 py-4"><b>Bahan profil asli</b><p className="mt-1 whitespace-pre-wrap text-black/60">{data.submission.bio_source}</p></div>
            <div className="md:col-span-2"><b>Draft profil publik yang akan dipakai</b><p className="mt-1 whitespace-pre-wrap text-black/60">{data.submission.bio || "—"}</p></div>
          </> : <div className="md:col-span-2"><b>Profil singkat</b><p className="mt-1 whitespace-pre-wrap text-black/60">{data.submission.bio || data.submission.bio_source || "—"}</p></div>}
          <div className="md:col-span-2 border-y border-black/10 py-4"><b>Foto / logo</b>{data?.assets?.filter((asset) => asset.asset_type === "profile_photo").length ? <div className="mt-3 space-y-3">{data.assets.filter((asset) => asset.asset_type === "profile_photo").map((asset) => <div key={asset.id} className="border border-black/10 p-3"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-semibold">{asset.original_filename || "Foto"}</p><p className="mt-1 text-xs text-black/50">{asset.upload_status !== "uploaded" ? "Sedang diunggah" : asset.review_status === "approved" ? "Disetujui" : asset.review_status === "rejected" ? "Perlu diganti" : "Menunggu peninjauan"}</p></div>{asset.upload_status === "uploaded" && asset.review_status !== "approved" ? <div className="flex gap-2"><button disabled={busy} onClick={() => reviewPhoto(asset.id, "approved")} className="border border-black bg-black px-3 py-2 text-xs font-semibold text-white disabled:opacity-40">Setujui</button><button disabled={busy || asset.review_status === "rejected"} onClick={() => reviewPhoto(asset.id, "rejected")} className="border border-black/15 px-3 py-2 text-xs font-semibold disabled:opacity-40">Tolak</button></div> : null}</div>{asset.preview_url ? <img src={asset.preview_url} alt={asset.original_filename || "Foto profil"} className="mt-3 max-h-[420px] w-full object-contain" /> : <p className="mt-3 text-xs text-red-700">Pratinjau foto belum tersedia.</p>}</div>)}</div> : <p className="mt-1 text-black/60">Belum diunggah.</p>}</div>
          <div><b>PIC utama</b><p>{data.submission.manager_name || "—"}</p></div>
          <div><b>Kontak PIC</b><p>{data.submission.manager_whatsapp || data.submission.manager_email || "—"}</p></div>
          <div className="md:col-span-2"><b>Portofolio</b><p>{data.submission.portfolio_url ? <a href={data.submission.portfolio_url} target="_blank" rel="noreferrer" className="break-all underline">{data.submission.portfolio_url}</a> : "—"}</p></div>
          <div className="md:col-span-2"><b>Batasan booking / operasional</b><p className="mt-1 whitespace-pre-wrap text-black/60">{data.submission.booking_limitations || "Tidak ada batasan yang dicantumkan."}</p></div>
        </div>
      ) : <p className="mt-5 text-sm text-black/50">Belum ada profil onboarding yang disimpan.</p>}

      {data?.supply.onboarding_status === "in_progress" && data?.submission ? <p className="mt-5 border border-blue-200 bg-blue-50 p-3 text-sm">PIC sedang memperbarui profil. Tunggu sampai status kembali <b>Sudah dikirim</b> sebelum meninjau.</p> : null}
      {approved ? <p className="mt-5 border border-green-700/20 bg-green-50 p-3 text-sm font-semibold text-green-800">✓ Profil sudah diverifikasi untuk database internal. `public_visible` tetap nonaktif sampai kanal {label} memang diluncurkan dan admin mengaktifkannya secara terpisah.</p> : null}

      {!approved ? (
        <div className="mt-5 border-t border-black/10 pt-5">
          <label className="block text-sm font-semibold">Catatan revisi untuk PIC
            <input value={note} onChange={(event) => setNote(event.target.value)} disabled={busy || !submitted} className="mt-2 w-full border border-black/15 px-3 py-3 font-normal disabled:bg-black/5" />
          </label>
          <div className="mt-3 flex flex-wrap gap-3">
            <button disabled={busy || !submitted} onClick={() => act("reject_profile", "Profil dikembalikan untuk revisi.")} className="border border-black/20 px-4 py-2.5 text-sm font-semibold disabled:opacity-40">Tolak Profil</button>
            <button disabled={busy || !submitted} onClick={() => act("approve_profile", "Profil berhasil diverifikasi.")} className="border border-black bg-black px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40">Setujui Profil</button>
          </div>
        </div>
      ) : null}
      {message ? <p className="mt-4 text-sm font-semibold text-green-800">{message}</p> : null}
      {error ? <p className="mt-4 text-sm font-semibold text-red-700">{error}</p> : null}
    </section>
  );
}
