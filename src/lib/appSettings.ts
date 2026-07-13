import type { AppSettings, ContentType, SearchEnterBehavior } from "../types";

export const CONTENT_TYPES: ContentType[] = [
  "document",
  "video",
  "audio",
  "image",
  "link",
  "folder",
];

const contentTypeSet = new Set<string>(CONTENT_TYPES);

export const defaultAppSettings: AppSettings = {
  resetSearchOnNavigation: true,
  searchEnterBehavior: "select",
  pinnedTypes: [],
  pinnedCollections: [],
  pinnedTags: [],
};

function normalizeSearchEnterBehavior(value: unknown): SearchEnterBehavior {
  return value === "open" ? "open" : "select";
}

function normalizePinnedTypes(value: unknown): ContentType[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<ContentType>();
  const result: ContentType[] = [];
  for (const entry of value) {
    if (typeof entry !== "string" || !contentTypeSet.has(entry)) continue;
    const type = entry as ContentType;
    if (seen.has(type)) continue;
    seen.add(type);
    result.push(type);
  }
  return result;
}

function normalizePinnedCollections(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const entry of value) {
    if (typeof entry !== "string") continue;
    const name = entry.trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    result.push(name);
  }
  return result;
}

function normalizePinnedTags(value: unknown): string[] {
  return normalizePinnedCollections(value);
}

export function normalizeAppSettings(settings: Partial<AppSettings> = {}): AppSettings {
  return {
    resetSearchOnNavigation: settings.resetSearchOnNavigation ?? defaultAppSettings.resetSearchOnNavigation,
    searchEnterBehavior: normalizeSearchEnterBehavior(settings.searchEnterBehavior),
    pinnedTypes: normalizePinnedTypes(settings.pinnedTypes),
    pinnedCollections: normalizePinnedCollections(settings.pinnedCollections),
    pinnedTags: normalizePinnedTags(settings.pinnedTags),
  };
}

export function togglePinnedType(settings: AppSettings, type: ContentType): AppSettings {
  const pinnedTypes = settings.pinnedTypes.includes(type)
    ? settings.pinnedTypes.filter((entry) => entry !== type)
    : [...settings.pinnedTypes, type];
  return { ...settings, pinnedTypes };
}

export function togglePinnedCollection(settings: AppSettings, collection: string): AppSettings {
  const name = collection.trim();
  if (!name) return settings;
  const pinnedCollections = settings.pinnedCollections.includes(name)
    ? settings.pinnedCollections.filter((entry) => entry !== name)
    : [...settings.pinnedCollections, name];
  return { ...settings, pinnedCollections };
}

export function togglePinnedTag(settings: AppSettings, tag: string): AppSettings {
  const name = tag.trim();
  if (!name) return settings;
  const pinnedTags = settings.pinnedTags.includes(name)
    ? settings.pinnedTags.filter((entry) => entry !== name)
    : [...settings.pinnedTags, name];
  return { ...settings, pinnedTags };
}

export function renamePinnedCollection(
  settings: AppSettings,
  previousName: string,
  nextName: string,
): AppSettings {
  const normalizedNext = nextName.trim();
  if (!normalizedNext || previousName === normalizedNext) return settings;
  const pinnedCollections = settings.pinnedCollections.map((entry) =>
    entry === previousName ? normalizedNext : entry,
  );
  return {
    ...settings,
    pinnedCollections: normalizePinnedCollections(pinnedCollections),
  };
}
