import { getSafeExternalUrl } from "./urlSafety";
import { titleFromUrl } from "./quickCapture";
import {
  parseYoutubeLink,
  youtubeLinkTags,
  youtubeLinkThumbnail,
  type YoutubeLinkKind,
} from "./youtubeLinks";

export type LinkPlatform = "youtube" | "youtube-music" | "web";

export interface LinkPreview {
  platform: LinkPlatform;
  title?: string;
  previewImage?: string;
  /** What the address points at, when it is a YouTube address. */
  youtubeKind?: YoutubeLinkKind;
}

const YOUTUBE_HOSTS = new Set(["youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be", "www.youtu.be"]);
const YOUTUBE_MUSIC_HOSTS = new Set(["music.youtube.com"]);

/**
 * Every outbound lookup in this module goes through this switch, so the
 * "fetch link previews" setting is enforced in one place instead of at each of
 * the call sites that ask for a favicon or a title. A missed call site would
 * leak a URL, which is exactly what the setting exists to prevent.
 */
let remoteLinkMetadataAllowed = true;

export function setRemoteLinkMetadataAllowed(allowed: boolean) {
  remoteLinkMetadataAllowed = allowed;
}

export function isRemoteLinkMetadataAllowed() {
  return remoteLinkMetadataAllowed;
}

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

/**
 * The thumbnail a YouTube address implies. The URL is built locally, but
 * fetching it tells Google which video is on the shelf, so it stays behind the
 * same switch as every other outbound lookup.
 */
export function localLinkThumbnail(rawUrl: string): string | null {
  if (!remoteLinkMetadataAllowed) return null;
  const info = parseYoutubeLink(rawUrl);
  return info ? youtubeLinkThumbnail(info) : null;
}

/** What a YouTube address points at, or null for anything else. */
export function linkYoutubeKind(rawUrl: string): YoutubeLinkKind | null {
  return parseYoutubeLink(rawUrl)?.kind ?? null;
}

/**
 * The image a card is allowed to load. Preview images saved earlier are remote
 * addresses, and loading one still tells that host what sits on the shelf — so
 * they are withheld while lookups are off, not just skipped for new items.
 * Locally produced `blob:` and `data:` images are unaffected.
 */
export function displayableImageSrc(src: string | null | undefined): string | null {
  if (!src) return null;
  if (remoteLinkMetadataAllowed) return src;
  return /^https?:/i.test(src) ? null : src;
}

export function linkPlatformAccent(platform: LinkPlatform): string {
  if (platform === "youtube-music") return "#e11d48";
  if (platform === "youtube") return "#dc2626";
  return "#2563eb";
}

export function faviconUrlFor(rawUrl: string): string | null {
  if (!remoteLinkMetadataAllowed) return null;
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

  const youtubeInfo = parseYoutubeLink(url);
  const youtubeKind = youtubeInfo?.kind;

  if (!remoteLinkMetadataAllowed) {
    return { platform: detectLinkPlatform(url), youtubeKind };
  }

  const platform = detectLinkPlatform(url);
  const favicon = faviconUrlFor(url) ?? undefined;
  // A YouTube address carries its own still image, so a card can show artwork
  // even when the oEmbed lookup fails or the link is not embeddable.
  const youtubeThumbnail = youtubeInfo ? youtubeLinkThumbnail(youtubeInfo) ?? undefined : undefined;

  try {
    if (platform === "youtube" || platform === "youtube-music") {
      const youtube = await fetchYoutubeOEmbed(url, signal);
      if (youtube) {
        return {
          ...youtube,
          platform,
          youtubeKind,
          previewImage: youtube.previewImage ?? youtubeThumbnail ?? favicon,
        };
      }
    } else {
      const embedded = await fetchNoEmbed(url, signal);
      if (embedded) return embedded;
    }
  } catch {
    // Offline or blocked — fall through to the locally derived preview.
  }

  if (youtubeThumbnail) {
    return { platform, previewImage: youtubeThumbnail, youtubeKind };
  }

  return {
    platform,
    previewImage: favicon,
    youtubeKind,
  };
}

export function buildLinkTags(existing: string[] | undefined, url: string): string[] {
  const platformTags = linkPlatformTags(detectLinkPlatform(url));
  const info = parseYoutubeLink(url);
  const kindTags = info ? youtubeLinkTags(info) : [];
  return [...new Set([...(existing ?? []), ...platformTags, ...kindTags])];
}
