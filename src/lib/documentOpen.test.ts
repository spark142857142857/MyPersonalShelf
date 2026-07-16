import { describe, expect, it } from "vitest";
import {
  getPathExtension,
  isExternalDocumentItem,
  isSupportedTextDocumentPath,
} from "./documentOpen";
import type { ContentItem } from "../types";

function doc(partial: Partial<ContentItem> & Pick<ContentItem, "location" | "source">): ContentItem {
  return {
    id: "item-1",
    title: "Doc",
    type: "document",
    collection: "Inbox",
    tags: [],
    accent: "#b7791f",
    isFavorite: false,
    summary: "",
    openCount: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...partial,
  };
}

describe("documentOpen", () => {
  it("reads extensions case-insensitively from Windows and POSIX paths", () => {
    expect(getPathExtension(String.raw`C:\Books\Manual.PDF`)).toBe("pdf");
    expect(getPathExtension("/home/user/notes.MD")).toBe("md");
    expect(getPathExtension("no-extension")).toBe("");
  });

  it("treats txt/md/log/csv as in-app readable text", () => {
    expect(isSupportedTextDocumentPath("a.txt")).toBe(true);
    expect(isSupportedTextDocumentPath("a.markdown")).toBe(true);
    expect(isSupportedTextDocumentPath("a.pdf")).toBe(false);
    expect(isSupportedTextDocumentPath("a.docx")).toBe(false);
  });

  it("marks non-text path documents as external", () => {
    expect(isExternalDocumentItem(doc({ source: "path", location: "C:/a.pdf" }))).toBe(true);
    expect(isExternalDocumentItem(doc({ source: "path", location: "C:/a.docx" }))).toBe(true);
    expect(isExternalDocumentItem(doc({ source: "path", location: "C:/a.txt" }))).toBe(false);
    expect(isExternalDocumentItem(doc({ source: "note", location: "note" }))).toBe(false);
  });
});
