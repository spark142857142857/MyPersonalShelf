import { describe, expect, it } from "vitest";
import { parseShelfExport, restoreShelfState } from "./shelfImport";
import type { AppSettings, ContentItem, ThemeSettings } from "../types";

const theme: ThemeSettings = {
  background: "#fff",
  surface: "#fff",
  text: "#000",
  muted: "#666",
  accent: "#123",
  readerWidth: 680,
  lineHeight: 1.8,
  readerFontSize: 15,
  readerOpenMode: "window",
  compactCards: false,
};

const appSettings: AppSettings = {
  resetSearchOnNavigation: true,
  searchEnterBehavior: "select",
  pinnedTypes: [],
  pinnedCollections: [],
  pinnedTags: [],
};

function item(id: string, title: string): ContentItem {
  return {
    id,
    title,
    type: "link",
    source: "url",
    location: `https://example.com/${id}`,
    collection: "Inbox",
    tags: [],
    accent: "#2563eb",
    isFavorite: true,
    openCount: 0,
    createdAt: "2020-01-01T00:00:00.000Z",
    updatedAt: "2020-01-01T00:00:00.000Z",
  };
}

describe("restoreShelfState", () => {
  it("merges by skipping existing ids", () => {
    const current = {
      items: [item("a", "A")],
      theme,
      language: "en" as const,
      dashboardLayouts: [],
      collectionSettings: {},
      appSettings,
    };
    const payload = parseShelfExport(
      JSON.stringify({ items: [item("a", "A"), item("b", "B")] }),
    );
    const result = restoreShelfState(current, payload, "merge");
    expect(result.addedCount).toBe(1);
    expect(result.skippedCount).toBe(1);
    expect(result.items.map((entry) => entry.id)).toEqual(["b", "a"]);
  });

  it("merges by skipping location duplicates with different ids", () => {
    const current = {
      items: [item("a", "A")],
      theme,
      language: "en" as const,
      dashboardLayouts: [],
      collectionSettings: {},
      appSettings,
    };
    const payload = parseShelfExport(
      JSON.stringify({
        items: [
          {
            ...item("b", "Same URL"),
            location: "https://example.com/a",
          },
        ],
      }),
    );
    const result = restoreShelfState(current, payload, "merge");
    expect(result.addedCount).toBe(0);
    expect(result.skippedCount).toBe(1);
    expect(result.items.map((entry) => entry.id)).toEqual(["a"]);
  });

  it("replaces shelf contents", () => {
    const current = {
      items: [item("a", "A")],
      theme,
      language: "en" as const,
      dashboardLayouts: [{ itemId: "a", order: 0, size: "standard" as const, hidden: false }],
      collectionSettings: { Inbox: { color: "#000", icon: "grid" as const } },
      appSettings,
    };
    const payload = parseShelfExport(JSON.stringify({ items: [item("c", "C")], language: "ko" }));
    const result = restoreShelfState(current, payload, "replace");
    expect(result.items.map((entry) => entry.id)).toEqual(["c"]);
    expect(result.language).toBe("ko");
    expect(result.dashboardLayouts).toEqual([]);
  });

  it("drops upload sources during restore persistence prep", () => {
    const payload = parseShelfExport(
      JSON.stringify({
        items: [
          { ...item("u", "Upload"), source: "upload", type: "image", location: "x.png" },
          item("ok", "Ok"),
        ],
      }),
    );
    const result = restoreShelfState(
      {
        items: [],
        theme,
        language: "en",
        dashboardLayouts: [],
        collectionSettings: {},
        appSettings,
      },
      payload,
      "replace",
    );
    expect(result.items.map((entry) => entry.id)).toEqual(["ok"]);
  });

  it("sanitizes malformed item fields instead of crashing later", () => {
    const payload = parseShelfExport(
      JSON.stringify({
        items: [
          {
            id: "bad-tags",
            title: "Broken",
            type: "link",
            source: "url",
            location: "https://example.com/broken",
            collection: "Inbox",
            tags: "imported,later",
            accent: "#2563eb",
            isFavorite: true,
            openCount: 0,
            createdAt: "2020-01-01T00:00:00.000Z",
            updatedAt: "2020-01-01T00:00:00.000Z",
          },
          {
            id: "invalid",
            title: "Nope",
            type: "spaceship",
            source: "url",
            location: "https://example.com/nope",
          },
          {
            id: "folder-bad",
            title: "Folder",
            type: "folder",
            source: "path",
            location: "C:/Books",
            collection: "Folders",
            tags: [],
            accent: "#059669",
            isFavorite: true,
            openCount: 0,
            createdAt: "2020-01-01T00:00:00.000Z",
            updatedAt: "2020-01-01T00:00:00.000Z",
            folderEntries: [null, { name: "ok.txt", path: "C:/Books/ok.txt", entryType: "file" }],
          },
          {
            id: "dup",
            title: "First",
            type: "link",
            source: "url",
            location: "https://example.com/dup-1",
            collection: "Inbox",
            tags: [],
            accent: "#2563eb",
            isFavorite: true,
            openCount: 0,
            createdAt: "2020-01-01T00:00:00.000Z",
            updatedAt: "2020-01-01T00:00:00.000Z",
          },
          {
            id: "dup",
            title: "Second",
            type: "link",
            source: "url",
            location: "https://example.com/dup-2",
            collection: "Inbox",
            tags: [],
            accent: "#2563eb",
            isFavorite: true,
            openCount: 0,
            createdAt: "2020-01-01T00:00:00.000Z",
            updatedAt: "2020-01-01T00:00:00.000Z",
          },
        ],
      }),
    );

    expect(payload.skippedInvalidItems).toBe(2);
    expect(payload.items.map((entry) => entry.id)).toEqual(["bad-tags", "folder-bad", "dup"]);
    expect(payload.items[0].tags).toEqual(["imported", "later"]);
    expect(payload.items[1].folderEntries).toEqual([
      { name: "ok.txt", path: "C:/Books/ok.txt", entryType: "file" },
    ]);
    expect(payload.items[2].title).toBe("First");

    const result = restoreShelfState(
      {
        items: [],
        theme,
        language: "en",
        dashboardLayouts: [],
        collectionSettings: {},
        appSettings,
      },
      payload,
      "replace",
    );
    expect(result.items[0].tags).toEqual(["imported", "later"]);
  });
});
