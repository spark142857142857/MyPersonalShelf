import { describe, expect, it } from "vitest";
import { parseChromeBookmarksJson, parseNetscapeBookmarkHtml } from "./bookmarkImport";

const sampleHtml = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<DL><p>
  <DT><H3>Reading</H3>
  <DL><p>
    <DT><A HREF="https://example.com/novel">Novel site</A>
  </DL><p>
  <DT><A HREF="https://example.com/root">Root link</A>
  <DT><A HREF="javascript:alert(1)">Bad</A>
</DL>`;

describe("parseNetscapeBookmarkHtml", () => {
  it("maps folders to collections and skips unsafe URLs", () => {
    const result = parseNetscapeBookmarkHtml(sampleHtml);
    expect(result.bookmarks).toEqual([
      { title: "Novel site", url: "https://example.com/novel", collection: "Reading" },
      { title: "Root link", url: "https://example.com/root", collection: "Inbox" },
    ]);
    expect(result.skippedInvalid).toBe(1);
  });

  it("decodes HTML entities in HREF query strings", () => {
    const result = parseNetscapeBookmarkHtml(`<!DOCTYPE NETSCAPE-Bookmark-file-1>
<DL><p>
  <DT><A HREF="https://example.com/watch?v=1&amp;list=abc">Encoded</A>
  <DT><A HREF="https://example.com/watch?v=2&#38;list=def">Numeric</A>
  <DT><A HREF="https://example.com/watch?v=3&#x26;list=ghi">Hex</A>
</DL>`);
    expect(result.bookmarks.map((bookmark) => bookmark.url)).toEqual([
      "https://example.com/watch?v=1&list=abc",
      "https://example.com/watch?v=2&list=def",
      "https://example.com/watch?v=3&list=ghi",
    ]);
  });

  it("keeps importing when numeric entities are out of range", () => {
    const result = parseNetscapeBookmarkHtml(`<!DOCTYPE NETSCAPE-Bookmark-file-1>
<DL><p>
  <DT><A HREF="https://example.com/ok">Title &#99999999; stays</A>
  <DT><A HREF="https://example.com/hex">Hex &#x110000; stays</A>
</DL>`);
    expect(result.bookmarks).toEqual([
      { title: "Title &#99999999; stays", url: "https://example.com/ok", collection: "Inbox" },
      { title: "Hex &#x110000; stays", url: "https://example.com/hex", collection: "Inbox" },
    ]);
  });
});

describe("parseChromeBookmarksJson", () => {
  it("walks bookmark_bar and other roots", () => {
    const result = parseChromeBookmarksJson(
      JSON.stringify({
        roots: {
          bookmark_bar: {
            children: [
              {
                type: "folder",
                name: "Media",
                children: [{ type: "url", name: "Video", url: "https://example.com/video" }],
              },
            ],
          },
          other: {
            children: [{ type: "url", name: "Loose", url: "https://example.com/loose" }],
          },
        },
      }),
    );

    expect(result.bookmarks).toEqual([
      { title: "Video", url: "https://example.com/video", collection: "Media" },
      { title: "Loose", url: "https://example.com/loose", collection: "Inbox" },
    ]);
  });

  it("skips non-array children without aborting the import", () => {
    const result = parseChromeBookmarksJson(
      JSON.stringify({
        roots: {
          bookmark_bar: {
            children: { unexpected: true },
          },
          other: {
            children: [{ type: "url", name: "Loose", url: "https://example.com/loose" }],
          },
        },
      }),
    );

    expect(result.bookmarks).toEqual([
      { title: "Loose", url: "https://example.com/loose", collection: "Inbox" },
    ]);
  });
});
