import { describe, expect, it } from "vitest";
import {
  defaultCollectionIcon,
  getCollectionSettings,
  normalizeCollectionSettings,
} from "./collections";
import type { ContentItem } from "../types";

function item(collection: string, accent: string): ContentItem {
  return {
    id: `id-${collection}`,
    title: collection,
    type: "document",
    source: "path",
    location: "C:/shelf/notes.txt",
    collection,
    tags: [],
    accent,
    isFavorite: false,
    openCount: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

describe("normalizeCollectionSettings", () => {
  it("trims names, drops blank ones, and repairs invalid icons", () => {
    expect(
      normalizeCollectionSettings({
        " Reading ": { color: "#111111", icon: "book" },
        "   ": { color: "#222222", icon: "grid" },
        Media: { color: "", icon: "bogus" as never },
      }),
    ).toEqual({
      Reading: { color: "#111111", icon: "book" },
      Media: { color: "#263238", icon: "grid" },
    });
  });

  it("accepts a missing settings object", () => {
    expect(normalizeCollectionSettings()).toEqual({});
  });
});

describe("defaultCollectionIcon", () => {
  it("guesses from English and Korean names", () => {
    expect(defaultCollectionIcon("Reading list")).toBe("book");
    expect(defaultCollectionIcon("소설")).toBe("book");
    expect(defaultCollectionIcon("강의")).toBe("play");
    expect(defaultCollectionIcon("음악")).toBe("music");
    expect(defaultCollectionIcon("참고 링크")).toBe("link");
    expect(defaultCollectionIcon("Inbox")).toBe("grid");
  });
});

describe("getCollectionSettings", () => {
  const items = [item("Media", "#e11d48")];

  it("prefers explicitly saved settings", () => {
    const saved = { Media: { color: "#000000", icon: "tag" as const } };
    expect(getCollectionSettings("Media", saved, items)).toEqual(saved.Media);
  });

  it("falls back to the first member item's accent", () => {
    expect(getCollectionSettings("Media", {}, items)).toEqual({ color: "#e11d48", icon: "grid" });
  });

  it("falls back to the neutral colour for an empty collection", () => {
    expect(getCollectionSettings("Empty", {}, items)).toEqual({ color: "#263238", icon: "grid" });
  });
});
