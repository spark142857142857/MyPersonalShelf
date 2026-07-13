import type {
  AppSettings,
  CollectionSettings,
  ContentItem,
  DashboardLayoutItem,
  ThemeSettings,
} from "../types";
import { normalizeAppSettings } from "./appSettings";
import type { Language } from "./i18n";
import { prepareItemsForPersistence } from "./persistence";

export interface ShelfExportPayload {
  items: ContentItem[];
  theme?: ThemeSettings;
  language?: Language;
  dashboardLayouts?: DashboardLayoutItem[];
  collectionSettings?: Record<string, CollectionSettings>;
  appSettings?: AppSettings;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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

  return {
    items: parsed.items as ContentItem[],
    theme: parsed.theme as ThemeSettings | undefined,
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
  const incomingItems = prepareItemsForPersistence(
    payload.items.map((item) => ({
      ...item,
      tags: item.tags ?? [],
      collection: item.collection || "Inbox",
      isFavorite: Boolean(item.isFavorite),
      openCount: item.openCount ?? 0,
      createdAt: item.createdAt ?? new Date().toISOString(),
      updatedAt: item.updatedAt ?? new Date().toISOString(),
    })),
  );

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
      skippedCount: 0,
    };
  }

  const existingIds = new Set(current.items.map((item) => item.id));
  const toAdd = incomingItems.filter((item) => !existingIds.has(item.id));
  const skippedCount = incomingItems.length - toAdd.length;

  return {
    items: [...toAdd, ...current.items],
    addedCount: toAdd.length,
    skippedCount,
  };
}
