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
</DL>`);
    expect(result.bookmarks).toEqual([
      {
        title: "Encoded",
        url: "https://example.com/watch?v=1&list=abc",
        collection: "Inbox",
      },
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
});
