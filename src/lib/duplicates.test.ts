import { describe, expect, it } from "vitest";
import {
  buildShelfItem,
  findDuplicate,
  findDuplicateByTitle,
  findDuplicateGroups,
  mergeShelfItems,
  normalizeLocationKey,
} from "./duplicates";

describe("normalizeLocationKey", () => {
  it("normalizes web links through safe URL parsing", () => {
    expect(normalizeLocationKey({ type: "link", source: "url", location: "example.com/a" })).toBe(
      "url:https://example.com/a",
    );
    expect(normalizeLocationKey({ type: "link", source: "url", location: "https://EXAMPLE.com/a" })).toBe(
      "url:https://example.com/a",
    );
  });

  it("normalizes local paths case-insensitively", () => {
    expect(
      normalizeLocationKey({ type: "document", source: "path", location: String.raw`C:\Media\Novel.TXT` }),
    ).toBe("path:c:/media/novel.txt");
  });

  it("ignores notes and uploads for location keys", () => {
    expect(normalizeLocationKey({ type: "document", source: "note", location: "note" })).toBeNull();
    expect(normalizeLocationKey({ type: "image", source: "upload", location: "a.png" })).toBeNull();
  });
});

describe("findDuplicate", () => {
  const items = [
    buildShelfItem({
      title: "Docs",
      type: "link",
      source: "url",
      location: "https://example.com/docs",
    }),
    buildShelfItem({
      title: "Novel",
      type: "document",
      source: "path",
      location: String.raw`C:\Books\novel.txt`,
    }),
  ];

  it("finds matching URLs and paths", () => {
    expect(findDuplicate(items, { type: "link", source: "url", location: "example.com/docs" })?.title).toBe(
      "Docs",
    );
    expect(
      findDuplicate(items, {
        type: "document",
        source: "path",
        location: String.raw`c:/books/novel.txt`,
      })?.title,
    ).toBe("Novel");
  });
});

describe("findDuplicateGroups", () => {
  it("groups items that share a location key", () => {
    const items = [
      buildShelfItem({
        id: "a",
        title: "One",
        type: "link",
        source: "url",
        location: "https://example.com/same",
      }),
      buildShelfItem({
        id: "b",
        title: "Two",
        type: "link",
        source: "url",
        location: "https://example.com/same",
      }),
      buildShelfItem({
        id: "c",
        title: "Unique",
        type: "link",
        source: "url",
        location: "https://example.com/other",
      }),
    ];
    const groups = findDuplicateGroups(items);
    expect(groups).toHaveLength(1);
    expect(groups[0].items.map((item) => item.id).sort()).toEqual(["a", "b"]);
  });
});

describe("mergeShelfItems", () => {
  it("skips location duplicates and keeps title-only as warning", () => {
    const existing = [
      buildShelfItem({
        title: "Same Title",
        type: "link",
        source: "url",
        location: "https://example.com/one",
      }),
    ];
    const result = mergeShelfItems(existing, [
      buildShelfItem({
        title: "Duplicate URL",
        type: "link",
        source: "url",
        location: "https://example.com/one",
      }),
      buildShelfItem({
        title: "Same Title",
        type: "link",
        source: "url",
        location: "https://example.com/two",
      }),
    ]);

    expect(result.added).toHaveLength(1);
    expect(result.skippedDuplicates).toHaveLength(1);
    expect(result.titleWarnings).toHaveLength(1);
    expect(result.nextItems).toHaveLength(2);
    expect(result.nextItems[0].location).toBe("https://example.com/two");
  });

  it("detects same title and type without blocking", () => {
    const existing = [
      buildShelfItem({
        title: "Notes",
        type: "document",
        source: "note",
        location: "note",
      }),
    ];
    expect(findDuplicateByTitle(existing, "notes", "document")?.title).toBe("Notes");
  });
});
