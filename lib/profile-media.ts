export type ExternalProfileMedia = {
  canonicalUrl: string;
  embedUrl?: string;
};

function parseUrl(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" || url.protocol === "http:" ? url : null;
  } catch {
    return null;
  }
}

export function parseSoundCloudUrl(value: unknown): ExternalProfileMedia | null {
  const url = parseUrl(value);
  if (!url) return null;
  const host = url.hostname.toLowerCase();
  if (!(["soundcloud.com", "www.soundcloud.com", "m.soundcloud.com", "on.soundcloud.com"].includes(host))) return null;
  if (!url.pathname.split("/").filter(Boolean).length) return null;
  const canonicalUrl = url.toString();
  return { canonicalUrl, embedUrl: `https://w.soundcloud.com/player/?url=${encodeURIComponent(canonicalUrl)}&visual=false&show_artwork=true` };
}

export function parseInstagramMediaUrl(value: unknown): ExternalProfileMedia | null {
  const url = parseUrl(value);
  if (!url) return null;
  const host = url.hostname.toLowerCase();
  if (!(["instagram.com", "www.instagram.com", "m.instagram.com"].includes(host))) return null;
  const [kind, id] = url.pathname.split("/").filter(Boolean);
  if (!(["p", "reel", "tv"].includes(kind ?? "") && id)) return null;
  return { canonicalUrl: `https://www.instagram.com/${kind}/${id}/` };
}
