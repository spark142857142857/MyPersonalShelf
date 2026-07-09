export type ContentType = "document" | "video" | "audio" | "image" | "link" | "folder";
export type ContentSource = "path" | "url" | "note" | "upload";
export type DashboardCardSize = "standard" | "wide" | "tall";
export type ReaderOpenMode = "embedded" | "window";

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
  objectUrl?: string;
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

export interface ThemeSettings {
  background: string;
  surface: string;
  text: string;
  muted: string;
  accent: string;
  readerWidth: number;
  lineHeight: number;
  readerFontSize: number;
  readerOpenMode: ReaderOpenMode;
  compactCards: boolean;
}
