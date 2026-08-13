import { isExternalDocumentItem } from "./documentOpen";
import type { ContentItem, ContentType, DashboardCardSize, DashboardLayoutItem } from "../types";

/** Splits a comma-separated tag field into unique, "#"-free tags. */
export function parseTagInput(value: string) {
  return Array.from(
    new Set(
      value
        .split(",")
        .map((tag) => tag.trim().replace(/^#/, ""))
        .filter(Boolean),
    ),
  );
}

/** Items the app can display itself, as opposed to handing to the OS. */
export function isViewerContent(item: ContentItem) {
  return item.type === "document" || item.type === "video" || item.type === "audio" || item.type === "image";
}

/**
 * Uploads live only in the current browser session and external documents open
 * in their own app, so neither can be handed to a separate viewer window.
 */
export function canOpenSeparateViewerWindow(item: ContentItem) {
  if (item.source === "upload") return false;
  if (isExternalDocumentItem(item)) return false;
  return item.type === "document" || ((item.type === "video" || item.type === "audio" || item.type === "image") && item.source === "path");
}

export function getTypeFromFile(file: File): ContentType {
  if (file.type.startsWith("video/")) return "video";
  if (file.type.startsWith("audio/")) return "audio";
  if (file.type.startsWith("image/")) return "image";
  return "document";
}

/**
 * Rebuilds the dashboard layout list so it matches the current items: entries
 * for removed items drop out, new items get appended, and order is compacted.
 */
export function normalizeDashboardLayouts(items: ContentItem[], layouts: DashboardLayoutItem[]) {
  const existingLayouts = new Map(layouts.map((layout) => [layout.itemId, layout]));
  const normalized = items.map((item, index) => ({
    itemId: item.id,
    order: existingLayouts.get(item.id)?.order ?? index,
    size: existingLayouts.get(item.id)?.size ?? ("standard" as DashboardCardSize),
    hidden: existingLayouts.get(item.id)?.hidden ?? false,
  }));

  return normalized.sort((left, right) => left.order - right.order).map((layout, index) => ({ ...layout, order: index }));
}
