"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

const CATEGORIES = ["Solo", "Duo/Trio", "Band", "DJ", "MC/Host", "Speaker", "Traditional/Ethnic", "Specialty Performer"];

type InviteResult = { talentId: string; url: string; message: string; expiresAt: string };

export function AdminTalentInvite() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [contactName, setContactName] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<InviteResult | null>(null);

  async function createInvite() {
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const response = await fetch("/api/internal-demo/admin/talent-invite", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, category, contactName, whatsapp, email }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        if (body?.existingTalentId) throw new Error(`${body.error} ID: ${body.existingTalentId}`);
        throw new Error(body?.error ?? "Gagal membuat undangan");
      }
      setResult(body);
      await navigator.clipboard?.writeText(body.message).catch(() => undefined);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal membuat undangan");
    } finally {
      setBusy(false);
    }
  }

  async function copyMessage() {
    if (!result) return;
    await navigator.clipboard?.writeText(result.message).catch(() => undefined);
  }

  return (
    <section className="mb-7 border border-black/10 bg-white p-5 md:p-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-semibold">Tambah & undang talent</p>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-black/50">Buat profil awal dan link pengisian profil yang berlaku 7 hari. Talent/manajer tidak perlu membuat akun pada tahap ini.</p>
        </div>
        <span className="w-fit border border-black/10 px-3 py-2 text-xs font-semibold text-black/50">Belum tampil ke publik</span>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <label className="text-sm font-semibold">Nama talent *<input value={name} onChange={(e) => setName(e.target.value)} placeholder="Contoh: Nama Artis / Band" className="mt-2 w-full border border-black/15 px-3 py-3 font-normal" /></label>
        <label className="text-sm font-semibold">Kategori *<select value={category} onChange={(e) => setCategory(e.target.value)} className="mt-2 w-full border border-black/15 bg-white px-3 py-3 font-normal"><option value="">Pilih kategori</option>{CATEGORIES.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
        <label className="text-sm font-semibold">Nama PIC <span className="font-normal text-black/45">(talent/manajer)</span><input value={contactName} onChange={(e) => setContactName(e.target.value)} placeholder="Nama orang yang akan menerima undangan" className="mt-2 w-full border border-black/15 px-3 py-3 font-normal" /></label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-semibold">WhatsApp<input value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} placeholder="08... / +62..." className="mt-2 w-full border border-black/15 px-3 py-3 font-normal" /></label>
          <label className="text-sm font-semibold">Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nama@email.com" className="mt-2 w-full border border-black/15 px-3 py-3 font-normal" /></label>
        </div>
      </div>
      <p className="mt-3 text-xs text-black/45">Isi minimal salah satu: WhatsApp atau email.</p>

      <button type="button" disabled={busy || !name.trim() || !category || (!whatsapp.trim() && !email.trim())} onClick={createInvite} className="mt-5 border border-black bg-black px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40">{busy ? "Membuat undangan…" : "Tambah Talent & Buat Undangan"}</button>

      {result ? <div className="mt-5 border border-emerald-200 bg-emerald-50 p-4 text-sm">
        <p className="font-semibold text-emerald-800">Talent berhasil ditambahkan. Pesan undangan sudah disalin.</p>
        <p className="mt-2 text-xs leading-5 text-emerald-900/70">Kirim pesan melalui WhatsApp atau email kepada PIC. Link pengisian profil berlaku 7 hari.</p>
        <div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={copyMessage} className="border border-black/15 bg-white px-3 py-2 text-xs font-semibold">Salin Pesan Undangan</button><Link href={`/admin/talents/${result.talentId}`} className="border border-black bg-black px-3 py-2 text-xs font-semibold text-white">Buka Profil Talent</Link></div>
      </div> : null}
      {error ? <p className="mt-4 text-sm font-semibold text-red-700">{error}</p> : null}
    </section>
  );
}
