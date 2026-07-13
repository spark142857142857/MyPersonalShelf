import type {
  AppSettings,
  CollectionSettings,
  ContentItem,
  ContentSource,
  ContentType,
  DashboardLayoutItem,
  ThemeSettings,
} from "../types";
import { normalizeAppSettings } from "./appSettings";
import { normalizeLocationKey } from "./duplicates";
import type { Language } from "./i18n";
import { prepareItemsForPersistence } from "./persistence";
import { normalizeThemeSettings } from "./theme";

export interface ShelfExportPayload {
  items: ContentItem[];
  theme?: ThemeSettings;
  language?: Language;
  dashboardLayouts?: DashboardLayoutItem[];
  collectionSettings?: Record<string, CollectionSettings>;
  appSettings?: AppSettings;
  skippedInvalidItems?: number;
}

export type ShelfRestoreMode = "merge" | "replace";

export interface ShelfRestoreResult {
  items: ContentItem[];
  theme?: ThemeSettings;
  language?: Language;
  dashboardLayouts?: DashboardLayoutItem[];
  collectionSettings?: Record<string, CollectionSettings>;
  appSettings?: AppSettings;
  addedCount: number;
  skippedCount: number;
}

const contentTypes = new Set<ContentType>(["document", "video", "audio", "image", "link", "folder"]);
const contentSources = new Set<ContentSource>(["path", "url", "note", "upload"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function asBoolean(value: unknown, fallback = false): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((entry): entry is string => typeof entry === "string").map((entry) => entry.trim()).filter(Boolean);
  }
  if (typeof value === "string") {
    return value
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);
  }
  return [];
}

function sanitizeFolderEntries(value: unknown): ContentItem["folderEntries"] | undefined {
  if (!Array.isArray(value)) return undefined;
  const entries: NonNullable<ContentItem["folderEntries"]> = [];
  for (const entry of value) {
    if (!isRecord(entry)) continue;
    const name = asString(entry.name).trim();
    const path = asString(entry.path).trim();
    const entryType = entry.entryType === "folder" || entry.entryType === "file" ? entry.entryType : null;
    if (!name || !path || !entryType) continue;
    entries.push({
      name,
      path,
      entryType,
      sizeBytes: typeof entry.sizeBytes === "number" && Number.isFinite(entry.sizeBytes) ? entry.sizeBytes : undefined,
    });
  }
  return entries.length > 0 ? entries : undefined;
}

export function sanitizeShelfItem(value: unknown): ContentItem | null {
  if (!isRecord(value)) return null;

  const id = asString(value.id).trim();
  const title = asString(value.title).trim() || "Untitled";
  const type = asString(value.type) as ContentType;
  const source = asString(value.source) as ContentSource;
  const location = asString(value.location).trim();

  if (!id || !contentTypes.has(type) || !contentSources.has(source)) {
    return null;
  }
  if (source !== "note" && !location) {
    return null;
  }

  const now = new Date().toISOString();
  return {
    id,
    title,
    type,
    source,
    location: location || "No location yet",
    fileName: typeof value.fileName === "string" ? value.fileName : undefined,
    sizeBytes: typeof value.sizeBytes === "number" ? value.sizeBytes : undefined,
    modifiedAt: typeof value.modifiedAt === "string" ? value.modifiedAt : undefined,
    collection: asString(value.collection).trim() || "Inbox",
    tags: asStringArray(value.tags),
    accent: asString(value.accent).trim() || "#2563eb",
    summary: typeof value.summary === "string" ? value.summary : undefined,
    textContent: typeof value.textContent === "string" ? value.textContent : undefined,
    textEncoding:
      value.textEncoding === "auto" ||
      value.textEncoding === "utf-8" ||
      value.textEncoding === "cp949" ||
      value.textEncoding === "utf-16le" ||
      value.textEncoding === "utf-16be"
        ? value.textEncoding
        : undefined,
    previewImage: typeof value.previewImage === "string" ? value.previewImage : undefined,
    folderEntries: sanitizeFolderEntries(value.folderEntries),
    isFavorite: asBoolean(value.isFavorite, true),
    openCount: asNumber(value.openCount, 0),
    lastOpenedAt: typeof value.lastOpenedAt === "string" ? value.lastOpenedAt : undefined,
    readerProgress: asNumber(value.readerProgress, 0),
    readerScrollTop: asNumber(value.readerScrollTop, 0),
    mediaPosition: asNumber(value.mediaPosition, 0),
    createdAt: asString(value.createdAt).trim() || now,
    updatedAt: asString(value.updatedAt).trim() || now,
  };
}

export function sanitizeShelfItems(values: unknown[]): { items: ContentItem[]; skippedInvalidItems: number } {
  const items: ContentItem[] = [];
  const seenIds = new Set<string>();
  let skippedInvalidItems = 0;
  for (const value of values) {
    const item = sanitizeShelfItem(value);
    if (!item) {
      skippedInvalidItems += 1;
      continue;
    }
    if (seenIds.has(item.id)) {
      skippedInvalidItems += 1;
      continue;
    }
    seenIds.add(item.id);
    items.push(item);
  }
  return { items, skippedInvalidItems };
}

export function parseShelfExport(raw: string): ShelfExportPayload {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Invalid shelf export JSON.");
  }

  if (!isRecord(parsed) || !Array.isArray(parsed.items)) {
    throw new Error("Shelf export must include an items array.");
  }

  const sanitized = sanitizeShelfItems(parsed.items);
  if (sanitized.items.length === 0 && parsed.items.length > 0) {
    throw new Error("Shelf export did not contain any valid items.");
  }

  return {
    items: sanitized.items,
    skippedInvalidItems: sanitized.skippedInvalidItems,
    theme: isRecord(parsed.theme)
      ? normalizeThemeSettings(parsed.theme as Partial<ThemeSettings> & { compactCards?: boolean })
      : undefined,
    language: parsed.language === "ko" || parsed.language === "en" ? parsed.language : undefined,
    dashboardLayouts: Array.isArray(parsed.dashboardLayouts)
      ? (parsed.dashboardLayouts as DashboardLayoutItem[])
      : undefined,
    collectionSettings: isRecord(parsed.collectionSettings)
      ? (parsed.collectionSettings as Record<string, CollectionSettings>)
      : undefined,
    appSettings: isRecord(parsed.appSettings)
      ? normalizeAppSettings(parsed.appSettings as Partial<AppSettings>)
      : undefined,
  };
}

export function restoreShelfState(
  current: {
    items: ContentItem[];
    theme: ThemeSettings;
    language: Language;
    dashboardLayouts: DashboardLayoutItem[];
    collectionSettings: Record<string, CollectionSettings>;
    appSettings: AppSettings;
  },
  payload: ShelfExportPayload,
  mode: ShelfRestoreMode,
): ShelfRestoreResult {
  const incomingItems = prepareItemsForPersistence(payload.items);

  if (mode === "replace") {
    return {
      items: incomingItems,
      theme: payload.theme ?? current.theme,
      language: payload.language ?? current.language,
      dashboardLayouts: payload.dashboardLayouts ?? [],
      collectionSettings: payload.collectionSettings ?? {},
      appSettings: payload.appSettings
        ? normalizeAppSettings(payload.appSettings)
        : current.appSettings,
      addedCount: incomingItems.length,
      skippedCount: payload.skippedInvalidItems ?? 0,
    };
  }

  const existingIds = new Set(current.items.map((item) => item.id));
  const seenLocationKeys = new Set(
    current.items
      .map((item) => normalizeLocationKey(item))
      .filter((key): key is string => Boolean(key)),
  );
  const toAdd: ContentItem[] = [];
  let skippedCount = payload.skippedInvalidItems ?? 0;

  for (const item of incomingItems) {
    if (existingIds.has(item.id)) {
      skippedCount += 1;
      continue;
    }
    const locationKey = normalizeLocationKey(item);
    if (locationKey && seenLocationKeys.has(locationKey)) {
      skippedCount += 1;
      continue;
    }
    if (locationKey) {
      seenLocationKeys.add(locationKey);
    }
    existingIds.add(item.id);
    toAdd.push(item);
  }

  return {
    items: [...toAdd, ...current.items],
    addedCount: toAdd.length,
    skippedCount,
  };
}
