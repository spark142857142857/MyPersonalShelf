import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildLinkTags,
  detectLinkPlatform,
  displayableImageSrc,
  faviconUrlFor,
  fetchLinkPreview,
  isPlaceholderLinkTitle,
  isRemoteLinkMetadataAllowed,
  linkPlatformTags,
  localLinkThumbnail,
  setRemoteLinkMetadataAllowed,
} from "./linkMeta";

afterEach(() => {
  setRemoteLinkMetadataAllowed(true);
  vi.restoreAllMocks();
});

describe("detectLinkPlatform", () => {
  it("detects youtube and youtube music hosts", () => {
    expect(detectLinkPlatform("https://www.youtube.com/watch?v=abc")).toBe("youtube");
    expect(detectLinkPlatform("https://youtu.be/abc")).toBe("youtube");
    expect(detectLinkPlatform("https://music.youtube.com/watch?v=abc")).toBe("youtube-music");
    expect(detectLinkPlatform("https://example.com")).toBe("web");
  });
});

describe("link helpers", () => {
  it("builds platform tags and favicon urls", () => {
    expect(linkPlatformTags("youtube")).toEqual(["youtube"]);
    expect(linkPlatformTags("youtube-music")).toEqual(["yt-music", "youtube"]);
    expect(buildLinkTags(["imported"], "https://youtu.be/abc")).toEqual(["imported", "youtube"]);
    expect(faviconUrlFor("https://www.youtube.com/watch?v=1")).toContain("google.com/s2/favicons");
  });

  it("detects placeholder titles", () => {
    expect(isPlaceholderLinkTitle("youtube.com", "https://www.youtube.com/watch?v=1")).toBe(true);
    expect(isPlaceholderLinkTitle("My favorite video", "https://www.youtube.com/watch?v=1")).toBe(false);
  });
});

describe("YouTube link enrichment", () => {
  const videoId = "dQw4w9WgXcZ";
  const albumPlaylistId = "OLAK5uy_abcdefghijklmnopqrstuvwxyz01";

  it("adds a kind tag alongside the platform tags", () => {
    expect(buildLinkTags([], `https://music.youtube.com/watch?v=${videoId}`)).toEqual([
      "yt-music",
      "youtube",
      "yt-track",
    ]);
    expect(buildLinkTags([], `https://music.youtube.com/playlist?list=${albumPlaylistId}`)).toEqual([
      "yt-music",
      "youtube",
      "yt-album",
    ]);
  });

  it("leaves non-YouTube links with no kind tag", () => {
    expect(buildLinkTags(["imported"], "https://example.com/article")).toEqual(["imported"]);
  });

  it("derives a thumbnail from the address without a lookup", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    expect(localLinkThumbnail(`https://music.youtube.com/watch?v=${videoId}`)).toBe(
      `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("withholds the thumbnail when lookups are disabled", () => {
    setRemoteLinkMetadataAllowed(false);
    expect(localLinkThumbnail(`https://music.youtube.com/watch?v=${videoId}`)).toBeNull();
  });

  it("withholds preview images saved while lookups were still allowed", () => {
    const saved = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
    expect(displayableImageSrc(saved)).toBe(saved);

    setRemoteLinkMetadataAllowed(false);
    // Rendering a stored remote image would still reach the host, so an
    // existing shelf must go quiet too, not just newly added links.
    expect(displayableImageSrc(saved)).toBeNull();
    expect(displayableImageSrc("https://www.google.com/s2/favicons?domain=example.com")).toBeNull();
  });

  it("keeps locally produced images regardless of the setting", () => {
    setRemoteLinkMetadataAllowed(false);
    expect(displayableImageSrc("blob:http://localhost/abc")).toBe("blob:http://localhost/abc");
    expect(displayableImageSrc("data:image/png;base64,AAA")).toBe("data:image/png;base64,AAA");
    expect(displayableImageSrc(undefined)).toBeNull();
  });

  it("falls back to the derived thumbnail when the oEmbed lookup fails", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("nope", { status: 404 }),
    );

    const preview = await fetchLinkPreview(`https://music.youtube.com/watch?v=${videoId}`);

    expect(preview.platform).toBe("youtube-music");
    expect(preview.youtubeKind).toBe("track");
    expect(preview.previewImage).toBe(`https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`);
  });

  it("still reports the kind when lookups are disabled", async () => {
    setRemoteLinkMetadataAllowed(false);
    const preview = await fetchLinkPreview(`https://music.youtube.com/playlist?list=${albumPlaylistId}`);
    expect(preview).toEqual({ platform: "youtube-music", youtubeKind: "album" });
  });
});

describe("remote metadata switch", () => {
  it("defaults to allowing lookups", () => {
    expect(isRemoteLinkMetadataAllowed()).toBe(true);
  });

  it("withholds favicon urls when lookups are disabled", () => {
    setRemoteLinkMetadataAllowed(false);
    expect(faviconUrlFor("https://www.youtube.com/watch?v=1")).toBeNull();
  });

  it("resolves previews locally without any request when disabled", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    setRemoteLinkMetadataAllowed(false);

    const preview = await fetchLinkPreview("https://music.youtube.com/watch?v=dQw4w9WgXcZ");

    // The kind comes from the address, so it survives with lookups off; the
    // thumbnail does not, because fetching it would reach Google.
    expect(preview).toEqual({ platform: "youtube-music", youtubeKind: "track" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("still resolves the platform for unsupported urls when disabled", async () => {
    setRemoteLinkMetadataAllowed(false);
    await expect(fetchLinkPreview("not a url at all ::")).resolves.toEqual({ platform: "web" });
  });
});
