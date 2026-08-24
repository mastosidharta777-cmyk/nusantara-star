import { createHmac, timingSafeEqual } from "node:crypto";

export type SignedAccessScope = "buyer_proposal" | "talent_offer";

type Payload = {
  scope: SignedAccessScope;
  subjectId: string;
  exp: number;
};

function signingKey() {
  const root = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!root) throw new Error("Server signing secret is not configured");
  return createHmac("sha256", root).update("nusantara-star-signed-access-v1").digest();
}

function encode(value: string) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function decode(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}

export function signAccessToken(scope: SignedAccessScope, subjectId: string, expiresAt: Date) {
  const payload: Payload = { scope, subjectId, exp: Math.floor(expiresAt.getTime() / 1000) };
  const body = encode(JSON.stringify(payload));
  const signature = createHmac("sha256", signingKey()).update(body).digest("base64url");
  return `${body}.${signature}`;
}

export function verifyAccessToken(token: string | null | undefined, scope: SignedAccessScope, subjectId: string) {
  if (!token) return false;
  const [body, signature] = token.split(".");
  if (!body || !signature) return false;

  const expected = createHmac("sha256", signingKey()).update(body).digest();
  let received: Buffer;
  try {
    received = Buffer.from(signature, "base64url");
  } catch {
    return false;
  }
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) return false;

  try {
    const payload = JSON.parse(decode(body)) as Payload;
    return payload.scope === scope && payload.subjectId === subjectId && Number.isFinite(payload.exp) && payload.exp > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}
