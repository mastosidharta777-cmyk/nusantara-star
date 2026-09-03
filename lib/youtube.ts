export type YouTubeVideo = {
  videoId: string;
  canonicalUrl: string;
  embedUrl: string;
};

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const YOUTUBE_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtube-nocookie.com",
  "www.youtube-nocookie.com",
]);

export function parseYouTubeVideoUrl(value: unknown): YouTubeVideo | null {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;

    let videoId = "";
    const host = url.hostname.toLowerCase();
    if (host === "youtu.be" || host === "www.youtu.be") {
      videoId = url.pathname.split("/").filter(Boolean)[0] ?? "";
    } else if (YOUTUBE_HOSTS.has(host)) {
      const parts = url.pathname.split("/").filter(Boolean);
      if (url.pathname === "/watch") videoId = url.searchParams.get("v") ?? "";
      else if (["embed", "shorts", "live"].includes(parts[0] ?? "")) videoId = parts[1] ?? "";
    }

    if (!VIDEO_ID.test(videoId)) return null;
    return {
      videoId,
      canonicalUrl: `https://www.youtube.com/watch?v=${videoId}`,
      embedUrl: `https://www.youtube-nocookie.com/embed/${videoId}?rel=0&playsinline=1`,
    };
  } catch {
    return null;
  }
}

export function youtubeVideoIdFromStorageKey(storageKey: unknown) {
  if (typeof storageKey !== "string") return null;
  const videoId = storageKey.split("/").filter(Boolean).at(-1) ?? "";
  return VIDEO_ID.test(videoId) ? videoId : null;
}

export function youtubeEmbedUrlFromStorageKey(storageKey: unknown) {
  const videoId = youtubeVideoIdFromStorageKey(storageKey);
  return videoId ? `https://www.youtube-nocookie.com/embed/${videoId}?rel=0&playsinline=1` : null;
}
