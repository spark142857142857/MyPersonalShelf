import { afterEach, describe, expect, it } from "vitest";
import type { ContentItem } from "../types";
import { browserItemStorageKey, prepareItemsForPersistence, saveBrowserItemProgress } from "./persistence";

afterEach(() => {
  Reflect.deleteProperty(globalThis, "window");
});

function item(overrides: Partial<ContentItem>): ContentItem {
  return {
    id: "item-1",
    title: "Title",
    type: "document",
    source: "path",
    location: "C:/Books/novel.txt",
    collection: "Reading",
    tags: [],
    accent: "#123456",
    isFavorite: true,
    openCount: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("prepareItemsForPersistence", () => {
  it("keeps path metadata without cached document contents", () => {
    const [persisted] = prepareItemsForPersistence([item({ textContent: "large cached text" })]);
    expect(persisted.location).toBe("C:/Books/novel.txt");
    expect(persisted.textContent).toBeUndefined();
  });

  it("keeps authored note text", () => {
    const [persisted] = prepareItemsForPersistence([item({ source: "note", textContent: "my note" })]);
    expect(persisted.textContent).toBe("my note");
  });

  it("drops session-only uploads", () => {
    expect(prepareItemsForPersistence([item({ source: "upload", objectUrl: "blob:test" })])).toEqual([]);
  });

  it("flushes progress directly to browser storage", () => {
    const values = new Map<string, string>();
    const localStorage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    };
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: { localStorage },
    });
    localStorage.setItem(browserItemStorageKey, JSON.stringify([item({})]));

    expect(saveBrowserItemProgress("item-1", { mediaPosition: 42 })).toBe(true);
    const [saved] = JSON.parse(localStorage.getItem(browserItemStorageKey) ?? "[]") as ContentItem[];
    expect(saved.mediaPosition).toBe(42);
  });
});
