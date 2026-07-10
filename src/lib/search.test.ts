import { describe, expect, it } from "vitest";
import { isSearchFocusShortcut, parseSearchQuery } from "./search";

describe("parseSearchQuery", () => {
  it("treats plain text as a case-insensitive text search", () => {
    expect(parseSearchQuery("  My Novel  ")).toEqual({ command: "text", value: "my novel" });
  });

  it.each(["C:\\Users\\user\\Books\\novel.txt", "https://example.com/reference"])(
    "treats an unknown colon prefix as plain text: %s",
    (query) => {
      expect(parseSearchQuery(query)).toEqual({ command: "text", value: query.toLowerCase() });
    },
  );

  it.each([
    ["tag:reading", "tag", "reading"],
    ["태그:읽기", "tag", "읽기"],
    ["타입:영상", "type", "영상"],
    ["컬렉션:미디어", "collection", "미디어"],
    ["열기:소설", "open", "소설"],
    ["재생:focus", "play", "focus"],
  ])("parses %s", (query, command, value) => {
    expect(parseSearchQuery(query)).toEqual({ command, value });
  });
});

describe("isSearchFocusShortcut", () => {
  const ctrlK = { ctrlKey: true, metaKey: false, key: "k" };

  it("handles Ctrl+K when no dialog is open", () => {
    expect(isSearchFocusShortcut(ctrlK, false)).toBe(true);
  });

  it("leaves focus inside an open dialog", () => {
    expect(isSearchFocusShortcut(ctrlK, true)).toBe(false);
  });
});
