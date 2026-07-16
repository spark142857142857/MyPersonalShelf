import type { ContentItem } from "../types";

/** Keep in sync with `is_supported_text_path` in src-tauri/src/lib.rs */
const TEXT_DOCUMENT_EXTENSIONS = new Set(["txt", "md", "markdown", "log", "csv"]);

export function getPathExtension(path: string): string {
  const base = path.split(/[/\\]/).pop() ?? "";
  const dot = base.lastIndexOf(".");
  if (dot <= 0 || dot === base.length - 1) return "";
  return base.slice(dot + 1).toLowerCase();
}

export function isSupportedTextDocumentPath(path: string): boolean {
  return TEXT_DOCUMENT_EXTENSIONS.has(getPathExtension(path));
}

/** Local documents that open in the OS default app instead of the in-app reader. */
export function isExternalDocumentItem(item: ContentItem): boolean {
  return item.type === "document" && item.source === "path" && !isSupportedTextDocumentPath(item.location);
}
