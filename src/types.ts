export type ContentType = "document" | "video" | "audio" | "image" | "link" | "folder";
export type ContentSource = "path" | "url" | "note" | "upload";
export type DashboardCardSize = "standard" | "wide" | "tall";
export type ReaderOpenMode = "embedded" | "window";
export type CollectionIcon = "book" | "play" | "music" | "link" | "folder" | "tag" | "grid";
export type SearchEnterBehavior = "select" | "open";
export type TextEncoding = "auto" | "utf-8" | "cp949" | "utf-16le" | "utf-16be";
export type DashboardCardDensity = "large" | "normal" | "small";
export type ThemePresetName = "paper" | "linen" | "sepia" | "mist" | "night" | "ink" | "custom";

export interface ContentItem {
  id: string;
  title: string;
  type: ContentType;
  source: ContentSource;
  location: string;
  fileName?: string;
  sizeBytes?: number;
  modifiedAt?: string;
  collection: string;
  tags: string[];
  accent: string;
  summary?: string;
  textContent?: string;
  textEncoding?: TextEncoding;
  objectUrl?: string;
  previewImage?: string;
  folderEntries?: FolderEntry[];
  isFavorite: boolean;
  openCount: number;
  lastOpenedAt?: string;
  readerProgress?: number;
  readerScrollTop?: number;
  mediaPosition?: number;
  createdAt: string;
  updatedAt: string;
}

export interface FolderEntry {
  name: string;
  path: string;
  entryType: "file" | "folder";
  sizeBytes?: number;
}

export interface DashboardCard {
  id: string;
  title: string;
  description: string;
  variant: DashboardCardSize;
  itemId: string;
}

export interface DashboardLayoutItem {
  itemId: string;
  order: number;
  size: DashboardCardSize;
  hidden: boolean;
}

export interface CollectionSettings {
  color: string;
  icon: CollectionIcon;
}

export interface AppSettings {
  resetSearchOnNavigation: boolean;
  searchEnterBehavior: SearchEnterBehavior;
  /**
   * When false, no link metadata leaves the machine: titles and thumbnails are
   * derived from the URL alone instead of being fetched from YouTube, noembed,
   * or the favicon service.
   */
  fetchLinkPreviews: boolean;
  pinnedTypes: ContentType[];
  pinnedCollections: string[];
  pinnedTags: string[];
}

export interface ThemeSettings {
  /**
   * Which curated palette the four colours below came from, or "custom" for a
   * set saved before presets existed.
   *
   * The colours are deliberately still stored alongside it rather than being
   * looked up from the preset at read time. That keeps the saved theme readable
   * by any version of the app — and by an export taken from one — instead of
   * turning into a name that older code would not recognise.
   */
  themePreset: ThemePresetName;
  background: string;
  surface: string;
  text: string;
  muted: string;
  accent: string;
  readerWidth: number;
  lineHeight: number;
  readerFontSize: number;
  readerOpenMode: ReaderOpenMode;
  dashboardCardDensity: DashboardCardDensity;
}
