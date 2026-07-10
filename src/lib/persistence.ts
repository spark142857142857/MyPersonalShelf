import type { ContentItem } from "../types";

export const browserItemStorageKey = "mypersonalshelf.items.v1";

export function prepareItemsForPersistence(items: ContentItem[]): ContentItem[] {
  return items
    .filter((item) => item.source !== "upload")
    .map((item) => {
      const persistedItem = { ...item };
      delete persistedItem.objectUrl;
      if (persistedItem.source === "path") {
        delete persistedItem.textContent;
      }
      return persistedItem;
    });
}

export function saveBrowserItemProgress(itemId: string, patch: Partial<ContentItem>): boolean {
  if (typeof window === "undefined" || "__TAURI_INTERNALS__" in window) return false;

  try {
    const raw = window.localStorage.getItem(browserItemStorageKey);
    if (!raw) return false;
    const items = JSON.parse(raw) as ContentItem[];
    const nextItems = items.map((item) => (item.id === itemId ? { ...item, ...patch } : item));
    window.localStorage.setItem(browserItemStorageKey, JSON.stringify(nextItems));
    return true;
  } catch {
    return false;
  }
}
