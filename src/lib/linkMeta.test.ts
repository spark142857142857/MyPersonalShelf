import { describe, expect, it } from "vitest";
import {
  buildLinkTags,
  detectLinkPlatform,
  faviconUrlFor,
  isPlaceholderLinkTitle,
  linkPlatformTags,
} from "./linkMeta";

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
