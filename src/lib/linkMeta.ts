import { getSafeExternalUrl } from "./urlSafety";
import { titleFromUrl } from "./quickCapture";

export type LinkPlatform = "youtube" | "youtube-music" | "web";

export interface LinkPreview {
  platform: LinkPlatform;
  title?: string;
  previewImage?: string;
}

const YOUTUBE_HOSTS = new Set(["youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be", "www.youtu.be"]);
const YOUTUBE_MUSIC_HOSTS = new Set(["music.youtube.com"]);

function hostnameOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

export function detectLinkPlatform(rawUrl: string): LinkPlatform {
  const url = getSafeExternalUrl(rawUrl) ?? rawUrl.trim();
  const host = hostnameOf(url);
  if (!host) return "web";
  if (YOUTUBE_MUSIC_HOSTS.has(host)) return "youtube-music";
  if (YOUTUBE_HOSTS.has(host) || host.endsWith(".youtube.com")) return "youtube";
  return "web";
}

export function linkPlatformTags(platform: LinkPlatform): string[] {
  if (platform === "youtube-music") return ["yt-music", "youtube"];
  if (platform === "youtube") return ["youtube"];
  return [];
}

export function linkPlatformAccent(platform: LinkPlatform): string {
  if (platform === "youtube-music") return "#e11d48";
  if (platform === "youtube") return "#dc2626";
  return "#2563eb";
}

export function faviconUrlFor(rawUrl: string): string | null {
  const safe = getSafeExternalUrl(rawUrl);
  if (!safe) return null;
  const host = hostnameOf(safe);
  if (!host) return null;
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64`;
}

export function isPlaceholderLinkTitle(title: string, url: string): boolean {
  const trimmed = title.trim();
  if (!trimmed || trimmed === "Untitled") return true;
  const host = titleFromUrl(url);
  return trimmed.toLowerCase() === host.toLowerCase() || trimmed === url;
}

async function fetchYoutubeOEmbed(url: string, signal?: AbortSignal): Promise<LinkPreview | null> {
  const endpoint = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;
  const response = await fetch(endpoint, { signal });
  if (!response.ok) return null;
  const data = (await response.json()) as { title?: string; thumbnail_url?: string };
  return {
    platform: detectLinkPlatform(url),
    title: data.title?.trim() || undefined,
    previewImage: data.thumbnail_url || faviconUrlFor(url) || undefined,
  };
}

async function fetchNoEmbed(url: string, signal?: AbortSignal): Promise<LinkPreview | null> {
  const endpoint = `https://noembed.com/embed?url=${encodeURIComponent(url)}`;
  const response = await fetch(endpoint, { signal });
  if (!response.ok) return null;
  const data = (await response.json()) as { title?: string; thumbnail_url?: string; error?: string };
  if (data.error) return null;
  return {
    platform: detectLinkPlatform(url),
    title: data.title?.trim() || undefined,
    previewImage: data.thumbnail_url || faviconUrlFor(url) || undefined,
  };
}

export async function fetchLinkPreview(rawUrl: string, signal?: AbortSignal): Promise<LinkPreview> {
  const url = getSafeExternalUrl(rawUrl);
  if (!url) {
    return { platform: "web" };
  }

  const platform = detectLinkPlatform(url);
  const favicon = faviconUrlFor(url) ?? undefined;

  try {
    if (platform === "youtube" || platform === "youtube-music") {
      const youtube = await fetchYoutubeOEmbed(url, signal);
      if (youtube) return { ...youtube, platform };
    } else {
      const embedded = await fetchNoEmbed(url, signal);
      if (embedded) return embedded;
    }
  } catch {
    // Offline or blocked — fall through to favicon-only preview.
  }

  return {
    platform,
    previewImage: favicon,
  };
}

export function buildLinkTags(existing: string[] | undefined, url: string): string[] {
  const platformTags = linkPlatformTags(detectLinkPlatform(url));
  return [...new Set([...(existing ?? []), ...platformTags])];
}
