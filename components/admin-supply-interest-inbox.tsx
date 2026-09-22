"use client";

import { useState } from "react";

import type { AdminSupplyInterest } from "@/lib/admin-supply-interest";
import { SUPPLY_CATEGORIES, supplyTypeLabel } from "@/lib/supply-onboarding";

type Props = {
  ready: boolean;
  items: AdminSupplyInterest[];
};

type InviteResult = { text: string; interestId: string } | null;

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(date)
    : "—";
}

function inviteText(email: string, url: string) {
  return `Halo ${email}, terima kasih atas minat bergabung dengan Nusantara Star. Silakan lengkapi profil melalui link aman ini: ${url}\n\nLink berlaku 7 hari. Setelah profil masuk, tim akan meninjau sebelum ada publikasi atau penawaran pekerjaan.`;
}

export function AdminSupplyInterestInbox({ ready, items }: Props) {
  const [categories, setCategories] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<InviteResult>(null);
  const [localStatus, setLocalStatus] = useState<Record<string, AdminSupplyInterest["status"]>>({});

  async function runAction(item: AdminSupplyInterest, action: "create_invite" | "copy_invite" | "archive") {
    setBusyId(item.id);
    setError(null);
    setResult(null);
    try {
      const response = await fetch("/api/internal-demo/admin/supply-interest", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          interestId: item.id,
          action,
          category: item.supply_type === "talent" ? (categories[item.id] ?? SUPPLY_CATEGORIES.talent[0]) : undefined,
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.detail ?? data?.error ?? "Aksi belum dapat diproses");

      if (action === "archive") {
        setLocalStatus((current) => ({ ...current, [item.id]: "archived" }));
        return;
      }

      const text = inviteText(item.email, data.url);
      setResult({ interestId: item.id, text });
      setLocalStatus((current) => ({ ...current, [item.id]: "invited" }));
      await navigator.clipboard?.writeText(text).catch(() => undefined);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Aksi belum dapat diproses");
    } finally {
      setBusyId(null);
    }
  }

  if (!ready) {
    return <section className="mb-7 border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-900">Inbox minat sudah tersedia di aplikasi, tetapi migrasi database belum diterapkan. Tidak ada data yang diubah.</section>;
  }

  return (
    <section className="mb-7 border border-black/10 bg-white">
      <div className="flex flex-col gap-2 border-b border-black/10 px-5 py-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm font-semibold">Inbox Minat Supply</p>
          <p className="mt-1 text-xs leading-5 text-black/45">Pendaftaran dari landing. Cek kecocokan dahulu, lalu buat satu undangan onboarding; profil tetap internal sampai ditinjau dan disiapkan untuk publik.</p>
        </div>
        <span className="text-xs font-semibold text-black/45">{items.filter((item) => (localStatus[item.id] ?? item.status) === "new").length} baru</span>
      </div>
      {items.length === 0 ? <div className="px-5 py-8 text-sm text-black/50">Belum ada minat Talent, Professional, atau Production Partner dari landing.</div> : <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-black/10 bg-black/[0.025] text-xs uppercase tracking-[0.12em] text-black/45"><tr>{["Email", "Jenis", "Masuk", "Status", "Aksi"].map((label) => <th key={label} className="px-5 py-3 font-semibold">{label}</th>)}</tr></thead>
          <tbody>{items.map((item) => {
            const status = localStatus[item.id] ?? item.status;
            const selectedCategory = categories[item.id] ?? SUPPLY_CATEGORIES.talent[0];
            const busy = busyId === item.id;
            return <tr key={item.id} className="border-b border-black/5 align-top last:border-0">
              <td className="px-5 py-4 font-medium">{item.email}</td>
              <td className="px-5 py-4 text-black/65">{supplyTypeLabel(item.supply_type)}</td>
              <td className="whitespace-nowrap px-5 py-4 text-black/65">{formatDate(item.created_at)}</td>
              <td className="px-5 py-4"><span className="border border-black/10 px-2 py-1 text-xs font-semibold uppercase tracking-[0.08em]">{status === "new" ? "Baru" : status === "invited" ? "Diundang" : "Diarsipkan"}</span></td>
              <td className="min-w-[280px] px-5 py-4">
                {status === "new" ? <div className="flex flex-col gap-2">
                  {item.supply_type === "talent" ? <select value={selectedCategory} onChange={(event) => setCategories((current) => ({ ...current, [item.id]: event.target.value }))} className="border border-black/15 bg-white px-3 py-2 text-xs font-medium">
                    {SUPPLY_CATEGORIES.talent.map((category) => <option key={category} value={category}>{category}</option>)}
                  </select> : <p className="text-xs leading-5 text-black/50">Layanan utama dipilih registrant saat onboarding.</p>}
                  <div className="flex flex-wrap gap-2"><button type="button" disabled={busy} onClick={() => runAction(item, "create_invite")} className="border border-black bg-black px-3 py-2 text-xs font-semibold text-white disabled:opacity-40">{busy ? "Memproses…" : "Buat undangan & salin"}</button><button type="button" disabled={busy} onClick={() => runAction(item, "archive")} className="border border-black/15 px-3 py-2 text-xs font-semibold disabled:opacity-40">Arsipkan</button></div>
                </div> : status === "invited" ? <button type="button" disabled={busy} onClick={() => runAction(item, "copy_invite")} className="border border-black px-3 py-2 text-xs font-semibold disabled:opacity-40">{busy ? "Membuat…" : "Buat ulang & salin link"}</button> : <span className="text-xs text-black/45">Tidak ada aksi.</span>}
                {result?.interestId === item.id ? <textarea readOnly value={result.text} className="mt-3 min-h-28 w-full border border-emerald-200 bg-emerald-50 p-2 text-xs leading-5 text-black/70" aria-label="Teks undangan yang sudah disalin" /> : null}
              </td>
            </tr>;
          })}</tbody>
        </table>
      </div>}
      {error ? <p className="border-t border-red-100 bg-red-50 px-5 py-3 text-xs font-semibold text-red-700">{error}</p> : null}
    </section>
  );
}
