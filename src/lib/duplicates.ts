import type { ContentItem, ContentSource, ContentType } from "../types";
import { getSafeExternalUrl } from "./urlSafety";

export type LocationKeyInput = Pick<ContentItem, "type" | "source" | "location">;

export function normalizeLocationKey(item: LocationKeyInput): string | null {
  if (item.type === "link" || item.source === "url") {
    const url = getSafeExternalUrl(item.location);
    return url ? `url:${url}` : null;
  }

  if (item.source === "path" && item.location.trim()) {
    const normalized = item.location
      .trim()
      .replace(/\\/g, "/")
      .replace(/\/+$/, "")
      .toLowerCase();
    return normalized ? `path:${normalized}` : null;
  }

  return null;
}

export function findDuplicate(
  items: ContentItem[],
  candidate: LocationKeyInput,
): ContentItem | undefined {
  const key = normalizeLocationKey(candidate);
  if (!key) return undefined;
  return items.find((item) => normalizeLocationKey(item) === key);
}

export function findDuplicateGroups(items: ContentItem[]): Array<{ key: string; items: ContentItem[] }> {
  const groups = new Map<string, ContentItem[]>();
  for (const item of items) {
    const key = normalizeLocationKey(item);
    if (!key) continue;
    const list = groups.get(key) ?? [];
    list.push(item);
    groups.set(key, list);
  }
  return [...groups.entries()]
    .filter(([, groupItems]) => groupItems.length > 1)
    .map(([key, groupItems]) => ({
      key,
      items: [...groupItems].sort((left, right) => left.createdAt.localeCompare(right.createdAt)),
    }))
    .sort((left, right) => right.items.length - left.items.length || left.key.localeCompare(right.key));
}

export function findDuplicateByTitle(
  items: ContentItem[],
  title: string,
  type: ContentType,
): ContentItem | undefined {
  const normalized = title.trim().toLowerCase();
  if (!normalized) return undefined;
  return items.find(
    (item) => item.type === type && item.title.trim().toLowerCase() === normalized,
  );
}

export interface MergeShelfItemsResult {
  nextItems: ContentItem[];
  added: ContentItem[];
  skippedDuplicates: Array<{ candidate: ContentItem; existing: ContentItem }>;
  titleWarnings: Array<{ candidate: ContentItem; existing: ContentItem }>;
}

export function mergeShelfItems(
  existing: ContentItem[],
  candidates: ContentItem[],
): MergeShelfItemsResult {
  const working = [...existing];
  const added: ContentItem[] = [];
  const skippedDuplicates: MergeShelfItemsResult["skippedDuplicates"] = [];
  const titleWarnings: MergeShelfItemsResult["titleWarnings"] = [];
  const seenKeys = new Set(
    existing.map(normalizeLocationKey).filter((key): key is string => Boolean(key)),
  );

  for (const candidate of candidates) {
    const key = normalizeLocationKey(candidate);
    if (key && seenKeys.has(key)) {
      const existingMatch = findDuplicate(working, candidate);
      if (existingMatch) {
        skippedDuplicates.push({ candidate, existing: existingMatch });
      }
      continue;
    }

    const titleMatch = findDuplicateByTitle(working, candidate.title, candidate.type);
    if (titleMatch) {
      titleWarnings.push({ candidate, existing: titleMatch });
    }

    if (key) {
      seenKeys.add(key);
    }
    added.push(candidate);
    working.push(candidate);
  }

  return {
    nextItems: [...added, ...existing],
    added,
    skippedDuplicates,
    titleWarnings,
  };
}

let shelfItemIdCounter = 0;

export function createShelfItemId() {
  shelfItemIdCounter += 1;
  return `item-${Date.now()}-${shelfItemIdCounter.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function buildShelfItem(input: {
  title: string;
  type: ContentType;
  source: ContentSource;
  location: string;
  collection?: string;
  tags?: string[];
  accent?: string;
  summary?: string;
  textContent?: string;
  fileName?: string;
  sizeBytes?: number;
  modifiedAt?: string;
  folderEntries?: ContentItem["folderEntries"];
  objectUrl?: string;
  previewImage?: string;
  id?: string;
  isFavorite?: boolean;
}): ContentItem {
  const now = new Date().toISOString();
  return {
    id: input.id ?? createShelfItemId(),
    title: input.title.trim() || "Untitled",
    type: input.type,
    source: input.source,
    location: input.location,
    fileName: input.fileName,
    sizeBytes: input.sizeBytes,
    modifiedAt: input.modifiedAt,
    collection: input.collection?.trim() || "Inbox",
    tags: input.tags ?? [],
    accent: input.accent || "#2563eb",
    summary: input.summary,
    textContent: input.textContent,
    objectUrl: input.objectUrl,
    previewImage: input.previewImage,
    folderEntries: input.folderEntries,
    isFavorite: input.isFavorite ?? true,
    openCount: 0,
    createdAt: now,
    updatedAt: now,
  };
}
