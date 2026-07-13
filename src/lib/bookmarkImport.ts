import { getSafeExternalUrl } from "./urlSafety";

export interface ImportedBookmark {
  title: string;
  url: string;
  collection: string;
}

export interface BookmarkImportResult {
  bookmarks: ImportedBookmark[];
  skippedInvalid: number;
}

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&nbsp;/gi, " ")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => {
      const codePoint = Number.parseInt(hex, 16);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : _;
    })
    .replace(/&#(\d+);/g, (_, dec: string) => {
      const codePoint = Number.parseInt(dec, 10);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : _;
    });
}

function pushBookmark(
  bookmarks: ImportedBookmark[],
  skipped: { count: number },
  title: string,
  href: string,
  collection: string,
) {
  const url = getSafeExternalUrl(href);
  if (!url) {
    skipped.count += 1;
    return;
  }
  bookmarks.push({
    title: title.trim() || titleFromFallback(url),
    url,
    collection: collection.trim() || "Inbox",
  });
}

function titleFromFallback(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./i, "") || url;
  } catch {
    return url;
  }
}

export function parseNetscapeBookmarkHtml(html: string): BookmarkImportResult {
  const bookmarks: ImportedBookmark[] = [];
  const skipped = { count: 0 };
  const folderStack: string[] = [];
  const tokenPattern =
    /<H3\b[^>]*>([\s\S]*?)<\/H3>|<A\b([^>]*)>([\s\S]*?)<\/A>|<\/DL>/gi;

  let match: RegExpExecArray | null;
  while ((match = tokenPattern.exec(html))) {
    if (match[0].toUpperCase().startsWith("</DL")) {
      folderStack.pop();
      continue;
    }

    if (match[1] !== undefined) {
      const folderName = decodeHtmlEntities(match[1].replace(/<[^>]+>/g, "")).trim();
      if (folderName) {
        folderStack.push(folderName);
      }
      continue;
    }

    const attrs = match[2] ?? "";
    const hrefMatch = attrs.match(/\bHREF\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
    const href = decodeHtmlEntities(hrefMatch?.[1] ?? hrefMatch?.[2] ?? hrefMatch?.[3] ?? "");
    const title = decodeHtmlEntities((match[3] ?? "").replace(/<[^>]+>/g, "")).trim();
    const collection = folderStack[folderStack.length - 1] ?? "Inbox";
    pushBookmark(bookmarks, skipped, title, href, collection);
  }

  return { bookmarks, skippedInvalid: skipped.count };
}

interface ChromeBookmarkNode {
  type?: string;
  name?: string;
  url?: string;
  children?: ChromeBookmarkNode[];
}

function walkChromeNode(
  node: ChromeBookmarkNode,
  collection: string,
  bookmarks: ImportedBookmark[],
  skipped: { count: number },
) {
  if (node.type === "url" || (node.url && !node.children)) {
    pushBookmark(bookmarks, skipped, node.name ?? "", node.url ?? "", collection);
    return;
  }

  const nextCollection =
    node.name && node.name !== "Bookmarks bar" && node.name !== "Other bookmarks" && node.name !== "Mobile bookmarks"
      ? node.name
      : collection;

  for (const child of node.children ?? []) {
    const childCollection =
      child.type === "folder" || child.children
        ? child.name?.trim() || nextCollection
        : nextCollection;
    if (child.type === "folder" || child.children) {
      walkChromeNode(child, childCollection === "Bookmarks bar" ? "Inbox" : childCollection, bookmarks, skipped);
    } else {
      walkChromeNode(child, nextCollection === "Bookmarks bar" ? "Inbox" : nextCollection, bookmarks, skipped);
    }
  }
}

export function parseChromeBookmarksJson(raw: string): BookmarkImportResult {
  const bookmarks: ImportedBookmark[] = [];
  const skipped = { count: 0 };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Invalid bookmarks JSON.");
  }

  const roots = (parsed as { roots?: Record<string, ChromeBookmarkNode> }).roots;
  if (!roots || typeof roots !== "object") {
    throw new Error("Chrome/Edge bookmarks JSON must contain roots.");
  }

  for (const key of ["bookmark_bar", "other", "synced"]) {
    const root = roots[key];
    if (root) {
      walkChromeNode(root, "Inbox", bookmarks, skipped);
    }
  }

  return { bookmarks, skippedInvalid: skipped.count };
}

export function parseBookmarkFile(content: string, fileName: string): BookmarkImportResult {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".json")) {
    return parseChromeBookmarksJson(content);
  }
  return parseNetscapeBookmarkHtml(content);
}
