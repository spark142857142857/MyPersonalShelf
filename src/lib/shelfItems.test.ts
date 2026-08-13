import { describe, expect, it } from "vitest";
import {
  canOpenSeparateViewerWindow,
  getTypeFromFile,
  isViewerContent,
  normalizeDashboardLayouts,
  parseTagInput,
} from "./shelfItems";
import type { ContentItem, DashboardLayoutItem } from "../types";

function item(overrides: Partial<ContentItem> = {}): ContentItem {
  return {
    id: "id",
    title: "Title",
    type: "document",
    source: "path",
    location: "C:/shelf/notes.txt",
    collection: "Inbox",
    tags: [],
    accent: "#123456",
    isFavorite: false,
    openCount: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("parseTagInput", () => {
  it("splits, trims, strips leading hashes, and dedupes", () => {
    expect(parseTagInput(" reading, #reading , , later ")).toEqual(["reading", "later"]);
  });

  it("returns nothing for an empty field", () => {
    expect(parseTagInput("   ")).toEqual([]);
  });
});

describe("isViewerContent", () => {
  it("covers the types the app renders itself", () => {
    expect(isViewerContent(item({ type: "document" }))).toBe(true);
    expect(isViewerContent(item({ type: "image" }))).toBe(true);
    expect(isViewerContent(item({ type: "link", source: "url" }))).toBe(false);
    expect(isViewerContent(item({ type: "folder" }))).toBe(false);
  });
});

describe("canOpenSeparateViewerWindow", () => {
  it("allows local documents and local media", () => {
    expect(canOpenSeparateViewerWindow(item({ type: "document" }))).toBe(true);
    expect(canOpenSeparateViewerWindow(item({ type: "video", location: "C:/a.mp4" }))).toBe(true);
  });

  it("refuses uploads, external documents, and non-viewer types", () => {
    expect(canOpenSeparateViewerWindow(item({ source: "upload" }))).toBe(false);
    expect(canOpenSeparateViewerWindow(item({ location: "C:/report.pdf" }))).toBe(false);
    expect(canOpenSeparateViewerWindow(item({ type: "folder" }))).toBe(false);
  });

  it("refuses media that is not stored as a local path", () => {
    expect(canOpenSeparateViewerWindow(item({ type: "video", source: "url" }))).toBe(false);
  });
});

describe("getTypeFromFile", () => {
  it("maps MIME prefixes, falling back to document", () => {
    expect(getTypeFromFile(new File([], "a.mp4", { type: "video/mp4" }))).toBe("video");
    expect(getTypeFromFile(new File([], "a.mp3", { type: "audio/mpeg" }))).toBe("audio");
    expect(getTypeFromFile(new File([], "a.png", { type: "image/png" }))).toBe("image");
    expect(getTypeFromFile(new File([], "a.bin", { type: "" }))).toBe("document");
  });
});

describe("normalizeDashboardLayouts", () => {
  const layouts: DashboardLayoutItem[] = [
    { itemId: "b", order: 0, size: "wide", hidden: true },
    { itemId: "a", order: 1, size: "standard", hidden: false },
  ];

  it("keeps saved order, size, and visibility while compacting order values", () => {
    const result = normalizeDashboardLayouts([item({ id: "a" }), item({ id: "b" })], layouts);
    expect(result).toEqual([
      { itemId: "b", order: 0, size: "wide", hidden: true },
      { itemId: "a", order: 1, size: "standard", hidden: false },
    ]);
  });

  it("drops layouts for removed items and appends new ones", () => {
    const result = normalizeDashboardLayouts([item({ id: "a" }), item({ id: "c" })], layouts);
    expect(result.map((layout) => layout.itemId)).toEqual(["a", "c"]);
    expect(result[1]).toEqual({ itemId: "c", order: 1, size: "standard", hidden: false });
  });

  it("returns nothing when the shelf is empty", () => {
    expect(normalizeDashboardLayouts([], layouts)).toEqual([]);
  });
});
