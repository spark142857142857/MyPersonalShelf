import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildLinkTags,
  detectLinkPlatform,
  faviconUrlFor,
  fetchLinkPreview,
  isPlaceholderLinkTitle,
  isRemoteLinkMetadataAllowed,
  linkPlatformTags,
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

    const preview = await fetchLinkPreview("https://music.youtube.com/watch?v=abc");

    expect(preview).toEqual({ platform: "youtube-music" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("still resolves the platform for unsupported urls when disabled", async () => {
    setRemoteLinkMetadataAllowed(false);
    await expect(fetchLinkPreview("not a url at all ::")).resolves.toEqual({ platform: "web" });
  });
});
