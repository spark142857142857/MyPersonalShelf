import { collectionIconOptions } from "../components/icons";
import type { CollectionIcon, CollectionSettings, ContentItem } from "../types";

const fallbackCollectionColor = "#263238";

export function normalizeCollectionSettings(settings: Record<string, CollectionSettings> = {}) {
  return Object.entries(settings).reduce<Record<string, CollectionSettings>>((normalized, [collection, setting]) => {
    const name = collection.trim();
    if (!name) {
      return normalized;
    }

    normalized[name] = {
      color: setting?.color || fallbackCollectionColor,
      icon: collectionIconOptions.includes(setting?.icon) ? setting.icon : "grid",
    };
    return normalized;
  }, {});
}

/** Guesses an icon from the collection name, in either supported language. */
export function defaultCollectionIcon(collection: string): CollectionIcon {
  const value = collection.toLowerCase();
  if (/novel|reading|read|소설|읽/.test(value)) return "book";
  if (/lecture|video|강의|영상/.test(value)) return "play";
  if (/music|audio|음악/.test(value)) return "music";
  if (/link|reference|링크|참고/.test(value)) return "link";
  if (/folder|폴더/.test(value)) return "folder";
  return "grid";
}

/**
 * Falls back to the first member item's accent so an unconfigured collection
 * still looks like its contents rather than defaulting to grey.
 */
export function getCollectionSettings(
  collection: string,
  settings: Record<string, CollectionSettings>,
  items: ContentItem[],
): CollectionSettings {
  return settings[collection] ?? {
    color: items.find((item) => item.collection === collection)?.accent ?? fallbackCollectionColor,
    icon: defaultCollectionIcon(collection),
  };
}
