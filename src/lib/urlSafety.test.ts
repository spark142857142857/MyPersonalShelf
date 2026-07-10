import { describe, expect, it } from "vitest";
import { getSafeExternalUrl, getSafeMarkdownUrl } from "./urlSafety";

describe("getSafeExternalUrl", () => {
  it("normalizes explicit and schemeless web URLs", () => {
    expect(getSafeExternalUrl("https://example.com/docs")).toBe("https://example.com/docs");
    expect(getSafeExternalUrl("example.com/docs")).toBe("https://example.com/docs");
  });

  it.each(["javascript:alert(1)", "file:///C:/secret.txt", "data:text/plain,test", "https://", "bad\nurl"])(
    "rejects %s",
    (value) => expect(getSafeExternalUrl(value)).toBeNull(),
  );
});

describe("getSafeMarkdownUrl", () => {
  it("allows same-document anchors", () => {
    expect(getSafeMarkdownUrl("#chapter-2")).toBe("#chapter-2");
  });

  it("rejects relative file paths", () => {
    expect(getSafeMarkdownUrl("../private.txt")).toBeNull();
  });
});
