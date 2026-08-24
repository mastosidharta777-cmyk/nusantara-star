"use client";

import { FormEvent, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function AdminLoginPage() {
  const router = useRouter();
  const search = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/admin-login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error ?? "Login gagal");
      const next = search.get("next");
      router.replace(next && next.startsWith("/admin") ? next : "/admin");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login gagal");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#f5f3ee] px-5 py-16 text-[#171713]">
      <form onSubmit={submit} className="mx-auto max-w-md border border-black/10 bg-white p-6 md:p-8">
        <p className="eyebrow mb-3">Nusantara Star Internal</p>
        <h1 className="text-3xl font-semibold tracking-[-0.03em]">Admin Login</h1>
        <p className="mt-3 text-sm leading-6 text-black/55">Akses hanya untuk akun internal aktif.</p>

        <label className="mt-6 block text-sm font-semibold">Email</label>
        <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoComplete="email" required className="mt-2 w-full border border-black/20 px-3 py-3 outline-none" />

        <label className="mt-4 block text-sm font-semibold">Password</label>
        <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" autoComplete="current-password" required className="mt-2 w-full border border-black/20 px-3 py-3 outline-none" />

        <button disabled={busy} className="mt-6 w-full border border-black bg-black px-4 py-3 text-sm font-semibold text-white disabled:opacity-50">
          {busy ? "Memeriksa…" : "Masuk"}
        </button>
        {error ? <p className="mt-3 text-sm font-semibold text-red-700">{error}</p> : null}
      </form>
    </main>
  );
}
