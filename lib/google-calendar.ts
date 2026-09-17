import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const GOOGLE_CALENDAR_SCOPES = [
  "https://www.googleapis.com/auth/calendar.freebusy",
  "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
] as const;

export const GOOGLE_AVAILABILITY_NOTE_PREFIX = "Google Calendar busy • sync:v1";

export type GoogleCalendarListItem = {
  id: string;
  summary?: string;
  primary?: boolean;
  selected?: boolean;
  timeZone?: string;
  accessRole?: string;
};

export type GoogleBusyInterval = { start: string; end: string };

type OAuthStatePayload = {
  talentId: string;
  nonce: string;
  exp: number;
};

function requiredServerSecret() {
  const value = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!value) throw new Error("Server signing secret is not configured");
  return value;
}

function encryptionKey() {
  const source = process.env.GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY || requiredServerSecret();
  return createHash("sha256").update("nusantara-star-google-calendar-token-v1\0").update(source).digest();
}

function stateSigningKey() {
  return createHash("sha256").update("nusantara-star-google-calendar-oauth-state-v1\0").update(requiredServerSecret()).digest();
}

function b64url(value: Buffer | string) {
  return Buffer.from(value).toString("base64url");
}

export function googleCalendarConfigured() {
  return Boolean(process.env.GOOGLE_CALENDAR_CLIENT_ID && process.env.GOOGLE_CALENDAR_CLIENT_SECRET);
}

export function googleCalendarRedirectUri(origin: string) {
  return process.env.GOOGLE_CALENDAR_REDIRECT_URI || `${origin.replace(/\/$/, "")}/api/talent-onboarding/google-calendar/callback`;
}

export function createGoogleOAuthState(talentId: string) {
  const nonce = randomBytes(24).toString("base64url");
  const payload: OAuthStatePayload = {
    talentId,
    nonce,
    exp: Math.floor(Date.now() / 1000) + 10 * 60,
  };
  const body = b64url(JSON.stringify(payload));
  const signature = createHmac("sha256", stateSigningKey()).update(body).digest("base64url");
  return { state: `${body}.${signature}`, nonce };
}

export function verifyGoogleOAuthState(value: string | null | undefined): OAuthStatePayload | null {
  if (!value) return null;
  const [body, signature] = value.split(".");
  if (!body || !signature) return null;

  const expected = createHmac("sha256", stateSigningKey()).update(body).digest();
  let received: Buffer;
  try {
    received = Buffer.from(signature, "base64url");
  } catch {
    return null;
  }
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) return null;

  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as OAuthStatePayload;
    if (!payload.talentId || !payload.nonce || !Number.isFinite(payload.exp)) return null;
    if (payload.exp <= Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

export function encryptGoogleRefreshToken(token: string) {
  if (!token) throw new Error("Google refresh token is empty");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString("base64url")}.${tag.toString("base64url")}.${encrypted.toString("base64url")}`;
}

export function decryptGoogleRefreshToken(value: string) {
  const [version, ivEncoded, tagEncoded, encryptedEncoded] = value.split(".");
  if (version !== "v1" || !ivEncoded || !tagEncoded || !encryptedEncoded) throw new Error("Stored Google token format is invalid");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivEncoded, "base64url"));
  decipher.setAuthTag(Buffer.from(tagEncoded, "base64url"));
  const decrypted = Buffer.concat([decipher.update(Buffer.from(encryptedEncoded, "base64url")), decipher.final()]);
  return decrypted.toString("utf8");
}

export function buildGoogleAuthorizationUrl(args: { origin: string; talentId: string; state: string }) {
  const clientId = process.env.GOOGLE_CALENDAR_CLIENT_ID;
  if (!clientId) throw new Error("Google Calendar client ID is not configured");
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", googleCalendarRedirectUri(args.origin));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", GOOGLE_CALENDAR_SCOPES.join(" "));
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("include_granted_scopes", "true");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("state", args.state);
  return url;
}

type TokenResponse = {
  access_token?: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
  error?: string;
  error_description?: string;
};

async function tokenRequest(params: URLSearchParams) {
  const clientId = process.env.GOOGLE_CALENDAR_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CALENDAR_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("Google Calendar OAuth is not configured");
  params.set("client_id", clientId);
  params.set("client_secret", clientSecret);

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: params,
    cache: "no-store",
  });
  const body = await response.json().catch(() => null) as TokenResponse | null;
  if (!response.ok || !body?.access_token) {
    throw new Error(body?.error_description || body?.error || "Google OAuth token request failed");
  }
  return body;
}

export async function exchangeGoogleAuthorizationCode(code: string, origin: string) {
  return tokenRequest(new URLSearchParams({
    code,
    redirect_uri: googleCalendarRedirectUri(origin),
    grant_type: "authorization_code",
  }));
}

export async function refreshGoogleAccessToken(refreshToken: string) {
  return tokenRequest(new URLSearchParams({
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  }));
}

async function googleJson<T>(url: string, accessToken: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    cache: "no-store",
    headers: {
      ...(init?.headers ?? {}),
      authorization: `Bearer ${accessToken}`,
      accept: "application/json",
    },
  });
  const body = await response.json().catch(() => null) as T | { error?: { message?: string } } | null;
  if (!response.ok) {
    const message = body && typeof body === "object" && "error" in body ? body.error?.message : null;
    throw new Error(message || "Google Calendar API request failed");
  }
  return body as T;
}

export async function listGoogleCalendars(accessToken: string) {
  const url = new URL("https://www.googleapis.com/calendar/v3/users/me/calendarList");
  url.searchParams.set("maxResults", "250");
  url.searchParams.set("minAccessRole", "reader");
  url.searchParams.set("showHidden", "false");
  const body = await googleJson<{ items?: GoogleCalendarListItem[] }>(url.toString(), accessToken);
  return (body.items ?? []).filter((item) => Boolean(item.id));
}

export async function getGoogleFreeBusy(args: { accessToken: string; calendarId: string; timeMin: string; timeMax: string; timeZone?: string | null }) {
  const body = await googleJson<{
    calendars?: Record<string, { busy?: GoogleBusyInterval[]; errors?: Array<{ reason?: string; domain?: string }> }>;
  }>("https://www.googleapis.com/calendar/v3/freeBusy", args.accessToken, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      timeMin: args.timeMin,
      timeMax: args.timeMax,
      timeZone: args.timeZone || "UTC",
      items: [{ id: args.calendarId }],
    }),
  });
  const calendar = body.calendars?.[args.calendarId];
  if (!calendar) throw new Error("Google Calendar tidak mengembalikan data free/busy untuk kalender yang dipilih");
  if (calendar.errors?.length) throw new Error(`Google Calendar free/busy gagal: ${calendar.errors.map((item) => item.reason || item.domain || "unknown").join(", ")}`);
  return calendar.busy ?? [];
}

function localDateInTimeZone(value: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  if (!year || !month || !day) throw new Error("Calendar timezone could not be converted to a local date");
  return `${year}-${month}-${day}`;
}

function addDateOnly(value: string, days: number) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function busyIntervalsToDates(intervals: GoogleBusyInterval[], timeZone: string) {
  const result = new Set<string>();
  for (const interval of intervals) {
    const start = new Date(interval.start);
    const end = new Date(interval.end);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) continue;
    const first = localDateInTimeZone(start, timeZone);
    const last = localDateInTimeZone(new Date(end.getTime() - 1), timeZone);
    for (let date = first; date <= last; date = addDateOnly(date, 1)) result.add(date);
  }
  return [...result].sort();
}

export function defaultGoogleSyncWindow() {
  const now = new Date();
  const timeMin = now.toISOString();
  const end = new Date(now);
  end.setUTCDate(end.getUTCDate() + 181);
  return {
    timeMin,
    timeMax: end.toISOString(),
    fromDate: now.toISOString().slice(0, 10),
    toDate: end.toISOString().slice(0, 10),
  };
}
