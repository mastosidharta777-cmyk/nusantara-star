import { NextResponse } from "next/server";

import { createR2PresignedUrl } from "@/lib/r2-presign";

export const runtime = "nodejs";

export async function GET(request: Request) {
  if (process.env.VERCEL_ENV === "production") return NextResponse.json({ error: "Not found" }, { status: 404 });

  const stamp = Date.now();
  const key = `smoke/r2-${stamp}.txt`;
  const payload = `nusantara-star-r2-smoke-${stamp}`;

  try {
    const putUrl = createR2PresignedUrl("PUT", key, 120);
    const headUrl = createR2PresignedUrl("HEAD", key, 120);
    const deleteUrl = createR2PresignedUrl("DELETE", key, 120);

    const fallbackOrigin = new URL(request.url).origin;
    const branchHost = process.env.VERCEL_BRANCH_URL?.trim() || process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
    const origin = branchHost ? `https://${branchHost}` : fallbackOrigin;

    const preflight = await fetch(putUrl, {
      method: "OPTIONS",
      headers: {
        Origin: origin,
        "Access-Control-Request-Method": "PUT",
        "Access-Control-Request-Headers": "content-type",
      },
      cache: "no-store",
    });
    const corsOrigin = preflight.headers.get("access-control-allow-origin");
    const corsMethods = preflight.headers.get("access-control-allow-methods") ?? "";
    const corsReady = preflight.ok && (corsOrigin === origin || corsOrigin === "*") && corsMethods.toUpperCase().includes("PUT");

    const put = await fetch(putUrl, {
      method: "PUT",
      headers: { "content-type": "text/plain" },
      body: payload,
      cache: "no-store",
    });
    if (!put.ok) throw new Error(`R2 PUT failed: ${put.status}`);

    const head = await fetch(headUrl, { method: "HEAD", cache: "no-store" });
    const size = Number(head.headers.get("content-length") ?? 0);
    const objectVerified = head.ok && size === Buffer.byteLength(payload);

    const cleanup = await fetch(deleteUrl, { method: "DELETE", cache: "no-store" });

    return NextResponse.json({
      ok: corsReady && objectVerified && cleanup.ok,
      checks: {
        r2CredentialsWork: put.ok,
        r2ObjectVerified: objectVerified,
        corsAllowsDirectBrowserPut: corsReady,
        smokeObjectDeleted: cleanup.ok,
      },
      cors: {
        requestedOrigin: origin,
        returnedOrigin: corsOrigin,
        methods: corsMethods,
      },
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
