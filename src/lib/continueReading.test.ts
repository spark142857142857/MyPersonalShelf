import { describe, expect, it } from "vitest";
import { findUnfinishedItems } from "./continueReading";
import type { ContentItem } from "../types";

function item(overrides: Partial<ContentItem> = {}): ContentItem {
  return {
    id: "item-1",
    title: "Novel",
    type: "document",
    source: "path",
    location: "C:/shelf/novel.txt",
    collection: "Reading",
    tags: [],
    accent: "#2563eb",
    isFavorite: false,
    openCount: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("findUnfinishedItems", () => {
  it("keeps a document that was started and not finished", () => {
    const found = findUnfinishedItems([item({ readerProgress: 43 })]);

    expect(found).toHaveLength(1);
  });

  it("leaves out documents that were never opened", () => {
    expect(findUnfinishedItems([item({ readerProgress: 0 })])).toHaveLength(0);
    expect(findUnfinishedItems([item({ readerProgress: undefined })])).toHaveLength(0);
  });

  it("leaves out documents that were read to the end", () => {
    expect(findUnfinishedItems([item({ readerProgress: 100 })])).toHaveLength(0);
    expect(findUnfinishedItems([item({ readerProgress: 95 })])).toHaveLength(0);
    expect(findUnfinishedItems([item({ readerProgress: 94 })])).toHaveLength(1);
  });

  it("leaves out a document too short to scroll", () => {
    // The reader divides scroll position by scrollable height, which is zero
    // for a document that fits the window; a naive check reads NaN as started.
    expect(findUnfinishedItems([item({ readerProgress: Number.NaN })])).toHaveLength(0);
  });

  it("leaves out media, which has no end-of-playback marker", () => {
    const media = [
      item({ id: "v", type: "video", readerProgress: 40, mediaPosition: 120 }),
      item({ id: "a", type: "audio", readerProgress: 40, mediaPosition: 120 }),
    ];

    expect(findUnfinishedItems(media)).toHaveLength(0);
  });

  it("puts the most recently opened first", () => {
    const found = findUnfinishedItems([
      item({ id: "old", readerProgress: 10, lastOpenedAt: "2026-01-01T00:00:00.000Z" }),
      item({ id: "new", readerProgress: 10, lastOpenedAt: "2026-08-01T00:00:00.000Z" }),
      item({ id: "middle", readerProgress: 10, lastOpenedAt: "2026-04-01T00:00:00.000Z" }),
    ]);

    expect(found.map((entry) => entry.id)).toEqual(["new", "middle", "old"]);
  });

  it("sorts a document never opened in this session last rather than dropping it", () => {
    const found = findUnfinishedItems([
      item({ id: "no-date", readerProgress: 10 }),
      item({ id: "dated", readerProgress: 10, lastOpenedAt: "2026-04-01T00:00:00.000Z" }),
    ]);

    expect(found.map((entry) => entry.id)).toEqual(["dated", "no-date"]);
  });

  it("stops at the limit", () => {
    const many = Array.from({ length: 10 }, (_, index) =>
      item({ id: `item-${index}`, readerProgress: 50 }),
    );

    expect(findUnfinishedItems(many)).toHaveLength(4);
    expect(findUnfinishedItems(many, 2)).toHaveLength(2);
  });

  it("returns nothing for an empty shelf", () => {
    expect(findUnfinishedItems([])).toEqual([]);
  });
});
