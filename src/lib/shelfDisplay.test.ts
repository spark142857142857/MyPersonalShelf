import { afterEach, describe, expect, it } from "vitest";
import { setRemoteLinkMetadataAllowed } from "./linkMeta";
import { getItemFileName, getItemImageSrc } from "./shelfDisplay";
import type { ContentItem } from "../types";

afterEach(() => setRemoteLinkMetadataAllowed(true));

function item(overrides: Partial<ContentItem> = {}): ContentItem {
  return {
    id: "item-1",
    title: "Saved link",
    type: "link",
    source: "url",
    location: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    collection: "Inbox",
    tags: [],
    accent: "#2563eb",
    isFavorite: false,
    openCount: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("getItemImageSrc", () => {
  it("prefers the preview saved with the item", () => {
    expect(getItemImageSrc(item({ previewImage: "https://example.com/cover.jpg" }))).toBe(
      "https://example.com/cover.jpg",
    );
  });

  it("derives a thumbnail for a link saved before previews existed", () => {
    expect(getItemImageSrc(item())).toBe("https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg");
  });

  it("falls back to a favicon for a link with no thumbnail of its own", () => {
    const src = getItemImageSrc(item({ location: "https://example.com/article" }));
    expect(src).toContain("example.com");
  });

  it("withholds every remote image while link lookups are off", () => {
    setRemoteLinkMetadataAllowed(false);
    expect(getItemImageSrc(item())).toBeNull();
    expect(getItemImageSrc(item({ previewImage: "https://example.com/cover.jpg" }))).toBeNull();
    expect(getItemImageSrc(item({ location: "https://example.com/article" }))).toBeNull();
  });

  it("keeps locally produced images even while lookups are off", () => {
    setRemoteLinkMetadataAllowed(false);
    expect(getItemImageSrc(item({ type: "image", previewImage: "blob:local-preview" }))).toBe(
      "blob:local-preview",
    );
  });

  it("does not invent a thumbnail for items that are not links", () => {
    expect(getItemImageSrc(item({ type: "document", location: "C:/shelf/notes.txt" }))).toBeNull();
  });
});

describe("getItemFileName", () => {
  const t = (key: string) => (key === "noLocation" ? "저장된 위치 없음" : key);

  it("prefers the name saved with the item", () => {
    expect(
      getItemFileName(item({ fileName: "notes.md", location: "C:/shelf/renamed.md" }), t),
    ).toBe("notes.md");
  });

  it("takes the tail of a Windows path", () => {
    expect(getItemFileName(item({ location: "C:\\Users\\me\\shelf\\notes.md" }), t)).toBe("notes.md");
  });

  it("takes the tail of a forward-slash path", () => {
    expect(getItemFileName(item({ location: "C:/Users/me/shelf/notes.md" }), t)).toBe("notes.md");
  });

  it("names the folder when the path ends in a separator", () => {
    expect(getItemFileName(item({ type: "folder", location: "C:/Users/me/shelf/" }), t)).toBe("shelf");
  });

  it("leaves a location that is not a path alone", () => {
    expect(getItemFileName(item({ location: "No location yet" }), t)).toBe("저장된 위치 없음");
  });

  it("does not chop a bare name that has no separator", () => {
    expect(getItemFileName(item({ location: "notes.md" }), t)).toBe("notes.md");
  });

  it("keeps a root path rather than reducing it to nothing", () => {
    expect(getItemFileName(item({ location: "C:/" }), t)).toBe("C:/");
  });
});
