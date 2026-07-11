import {
  ArrowDown,
  ArrowUp,
  BookOpen,
  Download,
  Eye,
  EyeOff,
  FilePlus2,
  FolderOpen,
  Grid3X3,
  HelpCircle,
  Library,
  Link,
  Music2,
  Paintbrush,
  Play,
  Search,
  Settings2,
  Star,
  Tags,
  Trash2,
} from "lucide-react";
import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { appConfig } from "./lib/appConfig";
import { getMessage, languageOptions, type Language, type MessageKey } from "./lib/i18n";
import { AddContentModal, type AddMode, type DraftItem } from "./components/AddContentModal";
import { DocumentTextView } from "./components/DocumentTextView";
import {
  closeCurrentNativeWindow,
  destroyCurrentNativeWindow,
  isNativeRuntime,
  loadNativeMediaProgress,
  loadNativeReaderProgress,
  loadNativeAppState,
  nativeAssetUrl,
  onNativeCloseRequested,
  onNativeTextEncodingChanged,
  openNativeFolder,
  openNativeReaderWindow,
  openNativeUrl,
  readNativeTextFile,
  registerNativeContentPath,
  saveNativeAppState,
  saveNativeMediaProgress,
  saveNativeReaderProgress,
  saveNativeTextEncoding,
  selectNativeFile,
  selectNativeFolder,
} from "./lib/native";
import { getSafeExternalUrl } from "./lib/urlSafety";
import { isSearchFocusShortcut, parseSearchQuery } from "./lib/search";
import { browserItemStorageKey, prepareItemsForPersistence, saveBrowserItemProgress } from "./lib/persistence";
import { contentItems as seedItems } from "./lib/sampleData";
import type {
  AppSettings,
  ContentItem,
  CollectionIcon,
  CollectionSettings,
  ContentSource,
  ContentType,
  DashboardCardSize,
  DashboardLayoutItem,
  ReaderOpenMode,
  SearchEnterBehavior,
  TextEncoding,
  ThemeSettings,
} from "./types";

type View = "dashboard" | "library" | "collections" | "customize" | "settings" | "guide" | "reader";
const themeStorageKey = "mypersonalshelf.theme.v1";
const languageStorageKey = "mypersonalshelf.language.v1";
const dashboardStorageKey = "mypersonalshelf.dashboard.v1";
const collectionSettingsStorageKey = "mypersonalshelf.collectionSettings.v1";
const appSettingsStorageKey = "mypersonalshelf.appSettings.v1";
const maxUploadDocumentBytes = 10 * 1024 * 1024;
const maxManualTextBytes = 1024 * 1024;
const collectionIconOptions: CollectionIcon[] = ["grid", "book", "play", "music", "link", "folder", "tag"];

const defaultAppSettings: AppSettings = {
  resetSearchOnNavigation: true,
  searchEnterBehavior: "select",
};

const defaultTheme: ThemeSettings = {
  background: "#f3f6f4",
  surface: "#ffffff",
  text: "#202622",
  muted: "#68736c",
  accent: "#2d6f62",
  readerWidth: 680,
  lineHeight: 1.8,
  readerFontSize: 15,
  readerOpenMode: "window",
  compactCards: false,
};

const initialDraft: DraftItem = {
  title: "",
  type: "document",
  source: "path",
  location: "",
  collection: "Inbox",
  tags: "",
  accent: "#2563eb",
  summary: "",
  textContent: "",
};

const typeIcons: Record<ContentType, React.ReactNode> = {
  document: <BookOpen size={18} />,
  video: <Play size={18} />,
  audio: <Music2 size={18} />,
  image: <Library size={18} />,
  link: <Link size={18} />,
  folder: <FolderOpen size={18} />,
};

const collectionIcons: Record<CollectionIcon, React.ReactNode> = {
  book: <BookOpen size={18} />,
  play: <Play size={18} />,
  music: <Music2 size={18} />,
  link: <Link size={18} />,
  folder: <FolderOpen size={18} />,
  tag: <Tags size={18} />,
  grid: <Grid3X3 size={18} />,
};

const navItems: Array<{ id: View; label: MessageKey; icon: React.ReactNode }> = [
  { id: "dashboard", label: "navDashboard", icon: <Grid3X3 size={18} /> },
  { id: "library", label: "navLibrary", icon: <Library size={18} /> },
  { id: "collections", label: "navCollections", icon: <Tags size={18} /> },
  { id: "customize", label: "navCustomize", icon: <Paintbrush size={18} /> },
  { id: "settings", label: "navSettings", icon: <Settings2 size={18} /> },
  { id: "guide", label: "navGuide", icon: <HelpCircle size={18} /> },
];

const contentTypes: ContentType[] = ["document", "video", "audio", "image", "link", "folder"];
const dashboardSizes: DashboardCardSize[] = ["standard", "wide", "tall"];
const textEncodingOptions: Array<{ value: TextEncoding; label: MessageKey }> = [
  { value: "auto", label: "encodingAuto" },
  { value: "utf-8", label: "encodingUtf8" },
  { value: "cp949", label: "encodingCp949" },
  { value: "utf-16le", label: "encodingUtf16Le" },
  { value: "utf-16be", label: "encodingUtf16Be" },
];

const typeLabelKeys: Record<ContentType, MessageKey> = {
  document: "typeDocument",
  video: "typeVideo",
  audio: "typeAudio",
  image: "typeImage",
  link: "typeLink",
  folder: "typeFolder",
};

const sourceLabelKeys: Record<ContentSource, MessageKey> = {
  path: "sourcePath",
  url: "sourceUrl",
  note: "sourceNote",
  upload: "sourceUpload",
};

const sizeLabelKeys: Record<DashboardCardSize, MessageKey> = {
  standard: "sizeStandard",
  wide: "sizeWide",
  tall: "sizeTall",
};

const entryTypeLabelKeys: Record<"file" | "folder", MessageKey> = {
  file: "entryFile",
  folder: "entryFolder",
};

const collectionLabelKeys: Record<string, MessageKey> = {
  Inbox: "collectionInbox",
  Reading: "collectionReading",
  Media: "collectionMedia",
  Folders: "collectionFolders",
  Novels: "collectionNovels",
  Lectures: "collectionLectures",
  Music: "collectionMusic",
  Links: "collectionLinks",
};

const tagLabelKeys: Record<string, MessageKey> = {
  archive: "tagArchive",
  audio: "typeAudio",
  document: "typeDocument",
  focus: "tagFocus",
  folder: "typeFolder",
  frontend: "tagFrontend",
  image: "typeImage",
  later: "tagLater",
  lecture: "tagLecture",
  link: "typeLink",
  local: "tagLocal",
  playlist: "tagPlaylist",
  reading: "tagReading",
  reference: "tagReference",
  uploaded: "tagUploaded",
  video: "typeVideo",
};

const seedTitleLabelKeys: Record<string, MessageKey> = {
  "Untitled shelf item": "untitledItem",
  "Novel reading archive": "seedNovelTitle",
  "React lecture materials": "seedLectureTitle",
  "Focus music folder": "seedMusicTitle",
  "Saved reference links": "seedLinksTitle",
};

const locationLabelKeys: Record<string, MessageKey> = {
  "No location yet": "noLocation",
};

const seedSummaryLabelKeys: Record<string, MessageKey> = {
  "A long-form reading shelf for novels and text files.": "seedNovelSummary",
  "Stable lecture videos and notes.": "seedLectureSummary",
  "Local audio for focus sessions.": "seedMusicSummary",
  "Links saved outside the browser bookmark bar.": "seedLinksSummary",
};

const seedTextContentLabelKeys: Record<string, MessageKey> = {
  "This is a sample reading page. Later, local txt/md/epub files can be opened here with custom width, theme, and line height.":
    "seedNovelText",
};

function translateKnown(value: string, labels: Record<string, MessageKey>, t: (key: MessageKey) => string) {
  const key = labels[value];
  return key ? t(key) : value;
}

function getTypeLabel(type: ContentType, t: (key: MessageKey) => string) {
  return t(typeLabelKeys[type]);
}

function getSourceLabel(source: ContentSource, t: (key: MessageKey) => string) {
  return t(sourceLabelKeys[source]);
}

function getSizeLabel(size: DashboardCardSize, t: (key: MessageKey) => string) {
  return t(sizeLabelKeys[size]);
}

function getEntryTypeLabel(entryType: "file" | "folder", t: (key: MessageKey) => string) {
  return t(entryTypeLabelKeys[entryType]);
}

function getCollectionLabel(collection: string, t: (key: MessageKey) => string) {
  return translateKnown(collection, collectionLabelKeys, t);
}

function getTagLabel(tag: string, t: (key: MessageKey) => string) {
  return translateKnown(tag, tagLabelKeys, t);
}

function getItemTitle(item: ContentItem, t: (key: MessageKey) => string) {
  return translateKnown(item.title, seedTitleLabelKeys, t);
}

function getItemSummary(item: ContentItem, t: (key: MessageKey) => string) {
  return item.summary ? translateKnown(item.summary, seedSummaryLabelKeys, t) : t("noSummary");
}

function getItemLocation(item: ContentItem, t: (key: MessageKey) => string) {
  return translateKnown(item.location, locationLabelKeys, t);
}

function getItemTextContent(item: ContentItem, t: (key: MessageKey) => string) {
  return item.textContent ? translateKnown(item.textContent, seedTextContentLabelKeys, t) : "";
}

function loadItems(): ContentItem[] {
  const raw = window.localStorage.getItem(browserItemStorageKey);
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as ContentItem[];
    return parsed.map(normalizeItem);
  } catch {
    return [];
  }
}

function normalizeItem(item: ContentItem): ContentItem {
  const now = new Date().toISOString();
  return {
    ...item,
    source: item.source ?? (item.type === "link" ? "url" : "path"),
    collection: item.collection || "Inbox",
    tags: item.tags ?? [],
    accent: item.accent || "#2563eb",
    isFavorite: Boolean(item.isFavorite),
    openCount: item.openCount ?? 0,
    readerProgress: item.readerProgress ?? 0,
    readerScrollTop: item.readerScrollTop ?? 0,
    mediaPosition: item.mediaPosition ?? 0,
    createdAt: item.createdAt ?? now,
    updatedAt: item.updatedAt ?? now,
  };
}

function loadTheme(): ThemeSettings {
  const raw = window.localStorage.getItem(themeStorageKey);
  if (!raw) {
    return defaultTheme;
  }

  try {
    return { ...defaultTheme, ...(JSON.parse(raw) as Partial<ThemeSettings>) };
  } catch {
    return defaultTheme;
  }
}

function loadLanguage(): Language {
  const raw = window.localStorage.getItem(languageStorageKey);
  return raw === "ko" ? "ko" : "en";
}

function loadDashboardLayouts(): DashboardLayoutItem[] {
  const raw = window.localStorage.getItem(dashboardStorageKey);
  if (!raw) {
    return [];
  }

  try {
    return JSON.parse(raw) as DashboardLayoutItem[];
  } catch {
    return [];
  }
}

function loadAppSettings(): AppSettings {
  const raw = window.localStorage.getItem(appSettingsStorageKey);
  if (!raw) {
    return defaultAppSettings;
  }

  try {
    return normalizeAppSettings(JSON.parse(raw) as Partial<AppSettings>);
  } catch {
    return defaultAppSettings;
  }
}

function normalizeAppSettings(settings: Partial<AppSettings> = {}): AppSettings {
  return {
    ...defaultAppSettings,
    ...settings,
    searchEnterBehavior: settings.searchEnterBehavior === "open" ? "open" : "select",
    resetSearchOnNavigation: settings.resetSearchOnNavigation ?? defaultAppSettings.resetSearchOnNavigation,
  };
}

function loadCollectionSettings(): Record<string, CollectionSettings> {
  const raw = window.localStorage.getItem(collectionSettingsStorageKey);
  if (!raw) {
    return {};
  }

  try {
    return normalizeCollectionSettings(JSON.parse(raw) as Record<string, CollectionSettings>);
  } catch {
    return {};
  }
}

function normalizeCollectionSettings(settings: Record<string, CollectionSettings> = {}) {
  return Object.entries(settings).reduce<Record<string, CollectionSettings>>((normalized, [collection, setting]) => {
    const name = collection.trim();
    if (!name) {
      return normalized;
    }

    normalized[name] = {
      color: setting?.color || "#263238",
      icon: collectionIconOptions.includes(setting?.icon) ? setting.icon : "grid",
    };
    return normalized;
  }, {});
}

function defaultCollectionIcon(collection: string): CollectionIcon {
  const value = collection.toLowerCase();
  if (/novel|reading|read|소설|읽/.test(value)) return "book";
  if (/lecture|video|강의|영상/.test(value)) return "play";
  if (/music|audio|음악/.test(value)) return "music";
  if (/link|reference|링크|참고/.test(value)) return "link";
  if (/folder|폴더/.test(value)) return "folder";
  return "grid";
}

function getCollectionSettings(
  collection: string,
  settings: Record<string, CollectionSettings>,
  items: ContentItem[],
): CollectionSettings {
  return settings[collection] ?? {
    color: items.find((item) => item.collection === collection)?.accent ?? "#263238",
    icon: defaultCollectionIcon(collection),
  };
}

function parseTagInput(value: string) {
  return Array.from(
    new Set(
      value
        .split(",")
        .map((tag) => tag.trim().replace(/^#/, ""))
        .filter(Boolean),
    ),
  );
}

function normalizeDashboardLayouts(items: ContentItem[], layouts: DashboardLayoutItem[]) {
  const existingLayouts = new Map(layouts.map((layout) => [layout.itemId, layout]));
  const normalized = items.map((item, index) => ({
    itemId: item.id,
    order: existingLayouts.get(item.id)?.order ?? index,
    size: existingLayouts.get(item.id)?.size ?? ("standard" as DashboardCardSize),
    hidden: existingLayouts.get(item.id)?.hidden ?? false,
  }));

  return normalized.sort((left, right) => left.order - right.order).map((layout, index) => ({ ...layout, order: index }));
}

function getTypeFromFile(file: File): ContentType {
  if (file.type.startsWith("video/")) return "video";
  if (file.type.startsWith("audio/")) return "audio";
  if (file.type.startsWith("image/")) return "image";
  return "document";
}

function canPreviewMediaItem(item: ContentItem, kind: "video" | "audio") {
  if (item.source === "upload") {
    return true;
  }

  const target = `${item.fileName ?? ""} ${item.location}`.toLowerCase();
  const extensions = kind === "video" ? ["mp4", "webm", "m4v"] : ["mp3", "wav", "ogg", "m4a"];
  return extensions.some((extension) => new RegExp(`\\.${extension}(?:$|[?#])`).test(target));
}

function isViewerContent(item: ContentItem) {
  return item.type === "document" || item.type === "video" || item.type === "audio" || item.type === "image";
}

function canOpenSeparateViewerWindow(item: ContentItem) {
  if (item.source === "upload") return false;
  return item.type === "document" || ((item.type === "video" || item.type === "audio" || item.type === "image") && item.source === "path");
}

function createId() {
  return `item-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function itemSearchText(item: ContentItem, t: (key: MessageKey) => string) {
  return [
    item.title,
    getItemTitle(item, t),
    item.type,
    getTypeLabel(item.type, t),
    item.source,
    getSourceLabel(item.source, t),
    item.collection,
    getCollectionLabel(item.collection, t),
    item.location,
    getItemLocation(item, t),
    item.summary ?? "",
    getItemSummary(item, t),
    ...item.tags,
    ...item.tags.map((tag) => getTagLabel(tag, t)),
  ].join(" ").toLowerCase();
}

function matchesLocalizedText(values: string[], value: string) {
  return values.join(" ").toLowerCase().includes(value);
}

function matchesContentType(item: ContentItem, value: string, t: (key: MessageKey) => string) {
  return matchesLocalizedText([item.type, getTypeLabel(item.type, t)], value);
}

function getReaderItemIdFromUrl() {
  return new URLSearchParams(window.location.search).get("reader");
}

function App() {
  const readerItemIdFromUrl = getReaderItemIdFromUrl();
  const nativeRuntime = isNativeRuntime();
  const [items, setItems] = useState<ContentItem[]>(() => (nativeRuntime ? [] : loadItems()));
  const [theme, setTheme] = useState<ThemeSettings>(() => (nativeRuntime ? defaultTheme : loadTheme()));
  const [language, setLanguage] = useState<Language>(() => (nativeRuntime ? "en" : loadLanguage()));
  const [appSettings, setAppSettings] = useState<AppSettings>(() => (nativeRuntime ? defaultAppSettings : loadAppSettings()));
  const [collectionSettings, setCollectionSettings] = useState<Record<string, CollectionSettings>>(() =>
    nativeRuntime ? {} : loadCollectionSettings(),
  );
  const [dashboardLayouts, setDashboardLayouts] = useState<DashboardLayoutItem[]>(() =>
    nativeRuntime ? [] : normalizeDashboardLayouts(loadItems(), loadDashboardLayouts()),
  );
  const [activeView, setActiveView] = useState<View>(readerItemIdFromUrl ? "reader" : "dashboard");
  const [selectedItemId, setSelectedItemId] = useState(readerItemIdFromUrl ?? items[0]?.id ?? "");
  const [query, setQuery] = useState("");
  const [activeType, setActiveType] = useState<ContentType | "all">("all");
  const [notice, setNotice] = useState("");
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [addMode, setAddMode] = useState<AddMode>("manual");
  const [draft, setDraft] = useState<DraftItem>(initialDraft);
  const [storageReady, setStorageReady] = useState(false);
  const [storageLoadFailed, setStorageLoadFailed] = useState(false);
  const [closeError, setCloseError] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [registeredPathIds, setRegisteredPathIds] = useState<Set<string>>(() => new Set());
  const objectUrlsRef = useRef<Set<string>>(new Set());
  const searchInputRef = useRef<HTMLInputElement>(null);
  const nativeSaveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const addInFlightRef = useRef(false);
  const pathRegistrationInFlightRef = useRef<Map<string, Promise<ContentItem>>>(new Map());
  const encodingReadGenerationRef = useRef<Map<string, number>>(new Map());
  const readerCloseFlushRef = useRef<() => Promise<void>>(async () => undefined);
  const activeViewRef = useRef(activeView);
  activeViewRef.current = activeView;
  const latestAppStateRef = useRef({ items, theme, language, appSettings, dashboardLayouts, collectionSettings });
  latestAppStateRef.current = { items, theme, language, appSettings, dashboardLayouts, collectionSettings };

  const t = useCallback((key: MessageKey) => getMessage(language, key), [language]);
  const tRef = useRef(t);
  tRef.current = t;
  const registerReaderCloseFlush = useCallback((handler: (() => Promise<void>) | null) => {
    readerCloseFlushRef.current = handler ?? (async () => undefined);
  }, []);

  const navigateToView = useCallback((nextView: View, itemId = selectedItemId) => {
    const currentState = window.history.state as { view?: View; selectedItemId?: string } | null;
    if (currentState?.view !== nextView || currentState?.selectedItemId !== itemId) {
      window.history.pushState({ view: nextView, selectedItemId: itemId }, "");
    }
    setSelectedItemId(itemId);
    setActiveView(nextView);
  }, [selectedItemId]);

  useEffect(() => {
    window.history.replaceState({ view: activeView, selectedItemId }, "");
  }, []);

  useEffect(() => {
    function handlePopState(event: PopStateEvent) {
      const state = event.state as { view?: View; selectedItemId?: string } | null;
      if (state?.view) {
        setActiveView(state.view);
      }
      if (state?.selectedItemId) {
        setSelectedItemId(state.selectedItemId);
      }
    }

    function handleMouseNavigation(event: MouseEvent) {
      if (event.button === 3) {
        event.preventDefault();
        window.history.back();
      }
      if (event.button === 4) {
        event.preventDefault();
        window.history.forward();
      }
    }

    window.addEventListener("popstate", handlePopState);
    window.addEventListener("mouseup", handleMouseNavigation);
    return () => {
      window.removeEventListener("popstate", handlePopState);
      window.removeEventListener("mouseup", handleMouseNavigation);
    };
  }, []);

  useEffect(() => {
    if (!notice) {
      setNotice(t("readyNotice"));
    }
  }, [notice, t]);

  useEffect(() => {
    if (!nativeRuntime) {
      setStorageReady(true);
      return;
    }

    let isMounted = true;
    loadNativeAppState()
      .then((state) => {
        if (!isMounted || !state) {
          return;
        }

        const nextItems = state.items.map((item) => normalizeItem(item as ContentItem));
        setItems(nextItems);
        setTheme({ ...defaultTheme, ...state.theme });
        setLanguage(state.language === "ko" ? "ko" : "en");
        setAppSettings(normalizeAppSettings(state.appSettings));
        setDashboardLayouts(normalizeDashboardLayouts(nextItems, state.dashboardLayouts ?? []));
        setCollectionSettings(normalizeCollectionSettings(state.collectionSettings ?? {}));
        setSelectedItemId(readerItemIdFromUrl && nextItems.some((item) => item.id === readerItemIdFromUrl) ? readerItemIdFromUrl : nextItems[0]?.id ?? "");
        if (readerItemIdFromUrl) {
          setActiveView("reader");
        }
      })
      .catch(() => {
        if (isMounted) {
          setStorageLoadFailed(true);
        }
      })
      .finally(() => {
        if (isMounted) {
          setStorageReady(true);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [nativeRuntime, readerItemIdFromUrl]);

  useEffect(() => {
    setNotice(t("readyNotice"));
  }, [language, t]);

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  useEffect(() => {
    if (!nativeRuntime || readerItemIdFromUrl) return;

    let unlisten: (() => void) | undefined;
    let disposed = false;
    void onNativeTextEncodingChanged(({ itemId, encoding }) => {
      if (!textEncodingOptions.some((option) => option.value === encoding)) return;
      const item = latestAppStateRef.current.items.find((candidate) => candidate.id === itemId);
      if (!item || item.type !== "document" || item.source !== "path") return;

      const generation = (encodingReadGenerationRef.current.get(itemId) ?? 0) + 1;
      encodingReadGenerationRef.current.set(itemId, generation);

      setItems((current) =>
        current.map((candidate) => candidate.id === itemId ? { ...candidate, textEncoding: encoding } : candidate),
      );
      void readNativeTextFile(item.location, itemId, encoding)
        .then((textContent) => {
          if (encodingReadGenerationRef.current.get(itemId) === generation) {
            updateItem(setItems, itemId, { textContent, textEncoding: encoding });
          }
        })
        .catch(() => undefined);
    })
      .then((dispose) => {
        if (disposed) dispose();
        else unlisten = dispose;
      })
      .catch(() => undefined);

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [nativeRuntime, readerItemIdFromUrl]);

  useEffect(() => {
    setDashboardLayouts((current) => normalizeDashboardLayouts(items, current));
  }, [items]);

  useEffect(() => {
    if (!storageReady || storageLoadFailed || readerItemIdFromUrl) {
      return;
    }

    const serializableItems = prepareItemsForPersistence(items);
    const normalizedLayouts = normalizeDashboardLayouts(items, dashboardLayouts);
    const state = {
      items: serializableItems,
      theme,
      language,
      appSettings,
      dashboardLayouts: normalizedLayouts,
      collectionSettings,
    };

    if (!nativeRuntime) {
      try {
        window.localStorage.setItem(browserItemStorageKey, JSON.stringify(serializableItems));
        window.localStorage.setItem(themeStorageKey, JSON.stringify(theme));
        window.localStorage.setItem(languageStorageKey, language);
        window.localStorage.setItem(appSettingsStorageKey, JSON.stringify(appSettings));
        window.localStorage.setItem(dashboardStorageKey, JSON.stringify(normalizedLayouts));
        window.localStorage.setItem(collectionSettingsStorageKey, JSON.stringify(collectionSettings));
      } catch {
        setNotice(t("browserStorageFailed"));
      }
      return;
    }

    nativeSaveQueueRef.current = nativeSaveQueueRef.current
      .catch(() => undefined)
      .then(() => saveNativeAppState(state))
      .catch(() => {
        setNotice(t("nativeStorageFailed"));
      });
  }, [appSettings, collectionSettings, dashboardLayouts, items, language, nativeRuntime, readerItemIdFromUrl, storageLoadFailed, storageReady, t, theme]);

  useEffect(() => {
    if (!nativeRuntime || !storageReady || storageLoadFailed) {
      return;
    }

    let unlisten: (() => void) | undefined;
    let disposed = false;
    let closing = false;

    void onNativeCloseRequested(async (event) => {
      event.preventDefault();
      if (closing) return;
      closing = true;
      setCloseError("");

      try {
        if (readerItemIdFromUrl) {
          await readerCloseFlushRef.current();
        } else {
          if (activeViewRef.current === "reader") {
            await readerCloseFlushRef.current();
          }
          const latest = latestAppStateRef.current;
          const state = {
            items: prepareItemsForPersistence(latest.items),
            theme: latest.theme,
            language: latest.language,
            appSettings: latest.appSettings,
            dashboardLayouts: normalizeDashboardLayouts(latest.items, latest.dashboardLayouts),
            collectionSettings: latest.collectionSettings,
          };
          nativeSaveQueueRef.current = nativeSaveQueueRef.current
            .catch(() => undefined)
            .then(() => saveNativeAppState(state));
          await nativeSaveQueueRef.current;
        }
        await destroyCurrentNativeWindow();
      } catch {
        closing = false;
        setCloseError(tRef.current("nativeStorageFailed"));
        if (!readerItemIdFromUrl) {
          setNotice(tRef.current("nativeStorageFailed"));
        }
      }
    })
      .then((dispose) => {
        if (disposed) {
          dispose();
        } else {
          unlisten = dispose;
        }
      })
      .catch(() => {
        if (!disposed) {
          setCloseError(tRef.current("nativeStorageFailed"));
          setNotice(tRef.current("nativeStorageFailed"));
        }
      });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [nativeRuntime, readerItemIdFromUrl, storageLoadFailed, storageReady]);

  useEffect(() => {
    const activeUrls = new Set(items.map((item) => item.objectUrl).filter((url): url is string => Boolean(url)));
    objectUrlsRef.current.forEach((url) => {
      if (!activeUrls.has(url)) {
        URL.revokeObjectURL(url);
      }
    });
    objectUrlsRef.current = activeUrls;
  }, [items]);

  useEffect(() => {
    return () => {
      objectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);

  useEffect(() => {
    function handleShortcut(event: KeyboardEvent) {
      if (isSearchFocusShortcut(event, isAddOpen)) {
        event.preventDefault();
        searchInputRef.current?.focus();
        navigateToView("library");
      }
    }

    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [isAddOpen, navigateToView]);

  const selectedItem = items.find((item) => item.id === selectedItemId) ?? items[0];
  const ensureItemPathRegistered = useCallback(async (item: ContentItem): Promise<ContentItem> => {
    if (!nativeRuntime || item.source !== "path") {
      return item;
    }

    const key = `${item.id}\u0000${item.type}\u0000${item.location}`;
    const pending = pathRegistrationInFlightRef.current.get(key);
    if (pending) {
      return pending;
    }

    const operation = registerNativeContentPath(item.location, item.type)
      .then((normalizedLocation) => {
        if (normalizedLocation !== item.location) {
          updateItem(setItems, item.id, { location: normalizedLocation });
        }
        setRegisteredPathIds((current) => new Set(current).add(item.id));
        return normalizedLocation === item.location ? item : { ...item, location: normalizedLocation };
      })
      .catch((error) => {
        setRegisteredPathIds((current) => {
          const next = new Set(current);
          next.delete(item.id);
          return next;
        });
        throw error;
      })
      .finally(() => {
        pathRegistrationInFlightRef.current.delete(key);
      });

    pathRegistrationInFlightRef.current.set(key, operation);
    return operation;
  }, [nativeRuntime]);

  useEffect(() => {
    if (
      !nativeRuntime ||
      readerItemIdFromUrl ||
      activeView !== "library" ||
      !selectedItem ||
      selectedItem.source !== "path"
    ) {
      return;
    }

    const registerSelectedPath = () => {
      void ensureItemPathRegistered(selectedItem).catch(() => {
        setNotice(t("pathUnavailable"));
      });
    };

    registerSelectedPath();
    window.addEventListener("focus", registerSelectedPath);
    return () => window.removeEventListener("focus", registerSelectedPath);
  }, [activeView, ensureItemPathRegistered, nativeRuntime, readerItemIdFromUrl, selectedItem?.id, selectedItem?.location, selectedItem?.source, selectedItem?.type, t]);

  const favoriteItems = items.filter((item) => item.isFavorite);
  const normalizedDashboardLayouts = useMemo(
    () => normalizeDashboardLayouts(items, dashboardLayouts),
    [dashboardLayouts, items],
  );
  const visibleDashboardCards = normalizedDashboardLayouts
    .filter((layout) => !layout.hidden)
    .map((layout) => ({ layout, item: items.find((item) => item.id === layout.itemId) }))
    .filter((entry): entry is { layout: DashboardLayoutItem; item: ContentItem } => Boolean(entry.item))
    .filter((entry) => entry.item.isFavorite || favoriteItems.length === 0)
    .slice(0, 8);
  const frequentItems = [...items]
    .filter((item) => item.openCount > 0 || item.lastOpenedAt)
    .sort((left, right) => {
      const openDifference = right.openCount - left.openCount;
      if (openDifference !== 0) return openDifference;
      return (right.lastOpenedAt ?? "").localeCompare(left.lastOpenedAt ?? "");
    })
    .slice(0, 5);
  const recentItems = [...items]
    .filter((item) => item.lastOpenedAt)
    .sort((left, right) => (right.lastOpenedAt ?? "").localeCompare(left.lastOpenedAt ?? ""))
    .slice(0, 5);

  const filteredItems = useMemo(() => {
    const parsedQuery = parseSearchQuery(query);
    return [...items].filter((item) => {
      const searchable = itemSearchText(item, t);
      const matchesQuery =
        !parsedQuery.value ||
        (parsedQuery.command === "tag" &&
          item.tags.some((tag) => matchesLocalizedText([tag, getTagLabel(tag, t)], parsedQuery.value))) ||
        (parsedQuery.command === "type" && matchesContentType(item, parsedQuery.value, t)) ||
        (parsedQuery.command === "collection" &&
          matchesLocalizedText([item.collection, getCollectionLabel(item.collection, t)], parsedQuery.value)) ||
        (parsedQuery.command === "open" && searchable.includes(parsedQuery.value)) ||
        (parsedQuery.command === "play" &&
          (item.type === "audio" || item.type === "video") &&
          searchable.includes(parsedQuery.value)) ||
        (parsedQuery.command === "text" && searchable.includes(parsedQuery.value));
      const matchesType = activeType === "all" || item.type === activeType;
      return matchesQuery && matchesType;
    }).sort((left, right) => {
      const leftRecent = left.lastOpenedAt ?? "";
      const rightRecent = right.lastOpenedAt ?? "";
      return rightRecent.localeCompare(leftRecent) || left.title.localeCompare(right.title);
    });
  }, [activeType, items, query, t]);

  const groupedCollections = useMemo(() => {
    return items.reduce<Record<string, ContentItem[]>>((groups, item) => {
      groups[item.collection] = [...(groups[item.collection] ?? []), item];
      return groups;
    }, {});
  }, [items]);
  const groupedTags = useMemo(() => {
    return items.reduce<Record<string, ContentItem[]>>((groups, item) => {
      item.tags.forEach((tag) => {
        groups[tag] = [...(groups[tag] ?? []), item];
      });
      return groups;
    }, {});
  }, [items]);
  const collectionNames = useMemo(() => Object.keys(groupedCollections).sort((left, right) => left.localeCompare(right)), [groupedCollections]);

  const shellStyle = {
    "--app-bg": theme.background,
    "--app-surface": theme.surface,
    "--app-text": theme.text,
    "--app-muted": theme.muted,
    "--app-accent": theme.accent,
    "--reader-width": `${theme.readerWidth}px`,
    "--reader-line-height": theme.lineHeight,
    "--reader-font-size": `${theme.readerFontSize}px`,
  } as React.CSSProperties;

  useEffect(() => {
    if (activeView !== "reader" || !selectedItem || selectedItem.type !== "document" || selectedItem.source !== "path" || selectedItem.textContent) {
      return;
    }

    readNativeTextFile(selectedItem.location, selectedItem.id, selectedItem.textEncoding ?? "auto")
      .then((textContent) => updateItem(setItems, selectedItem.id, { textContent }))
      .catch((error) => setNotice(`${t("documentReadFailed")} ${String(error)}`));
  }, [activeView, selectedItem, t]);

  async function selectItem(item: ContentItem, nextView?: View) {
    navigateToView(nextView ?? "library", item.id);
    setNotice(`${getItemTitle(item, t)} ${t("selected")}`);
  }

  function markItemOpened(item: ContentItem) {
    const openedAt = new Date().toISOString();
    setItems((current) =>
      current.map((currentItem) =>
        currentItem.id === item.id
          ? {
              ...currentItem,
              lastOpenedAt: openedAt,
              openCount: currentItem.openCount + 1,
              updatedAt: openedAt,
            }
          : currentItem,
      ),
    );
  }

  async function persistItemBeforeOpeningWindow(item: ContentItem) {
    if (!nativeRuntime || readerItemIdFromUrl) return;

    const latest = latestAppStateRef.current;
    const itemExists = latest.items.some((candidate) => candidate.id === item.id);
    const nextItems = itemExists
      ? latest.items.map((candidate) => candidate.id === item.id ? { ...candidate, ...item } : candidate)
      : [item, ...latest.items];
    const state = {
      items: prepareItemsForPersistence(nextItems),
      theme: latest.theme,
      language: latest.language,
      appSettings: latest.appSettings,
      dashboardLayouts: normalizeDashboardLayouts(nextItems, latest.dashboardLayouts),
      collectionSettings: latest.collectionSettings,
    };

    nativeSaveQueueRef.current = nativeSaveQueueRef.current
      .catch(() => undefined)
      .then(() => saveNativeAppState(state));
    await nativeSaveQueueRef.current;
  }

  async function openItem(item: ContentItem) {
    if (item.type === "link") {
      const safeExternalUrl = getSafeExternalUrl(item.location);
      if (!safeExternalUrl) {
        navigateToView("library", item.id);
        setNotice(t("invalidLink"));
        return;
      }

      setSelectedItemId(item.id);
      markItemOpened(item);
      openNativeUrl(safeExternalUrl).catch(() => {
        window.open(safeExternalUrl, "_blank", "noopener,noreferrer");
      });
      setNotice(`${getItemTitle(item, t)} ${t("selected")}`);
      return;
    }

    let targetItem = item;
    if (item.source === "path" && nativeRuntime) {
      try {
        targetItem = await ensureItemPathRegistered(item);
      } catch {
        navigateToView("library", item.id);
        setNotice(t("pathUnavailable"));
        return;
      }
    }

    if (targetItem.type === "folder" && targetItem.source === "path") {
      setSelectedItemId(targetItem.id);
      markItemOpened(targetItem);
      openNativeFolder(targetItem.location).catch(() => {
        setNotice(t("nativeUnavailable"));
      });
      setNotice(`${getItemTitle(targetItem, t)} ${t("selected")}`);
      return;
    }

    if (!isViewerContent(targetItem)) {
      selectItem(targetItem);
      return;
    }

    markItemOpened(targetItem);
    if (canOpenSeparateViewerWindow(targetItem) && theme.readerOpenMode === "window" && !readerItemIdFromUrl) {
      setSelectedItemId(targetItem.id);
      try {
        await persistItemBeforeOpeningWindow(targetItem);
        await openNativeReaderWindow(targetItem.id, getItemTitle(targetItem, t));
        setNotice(`${getItemTitle(targetItem, t)} ${t("readerWindowOpened")}`);
        return;
      } catch (error) {
        setNotice(`${t("readerWindowFailed")} ${String(error)}`);
      }
    }

    navigateToView("reader", targetItem.id);
    setNotice(`${getItemTitle(targetItem, t)} ${t("selected")}`);

    if (targetItem.type === "document" && targetItem.source === "path" && !targetItem.textContent) {
      try {
        const textContent = await readNativeTextFile(targetItem.location, targetItem.id, targetItem.textEncoding ?? "auto");
        updateItem(setItems, targetItem.id, { textContent });
      } catch (error) {
        setNotice(`${t("documentReadFailed")} ${String(error)}`);
      }
    }
  }

  useEffect(() => {
    function handleOpenShortcut(event: KeyboardEvent) {
      if (!(event.ctrlKey || event.metaKey) || event.key !== "Enter" || !selectedItem || isAddOpen) {
        return;
      }

      const target = event.target;
      if (
        target instanceof HTMLElement &&
        target !== searchInputRef.current &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable)
      ) {
        return;
      }

      event.preventDefault();
      void openItem(selectedItem);
    }

    window.addEventListener("keydown", handleOpenShortcut);
    return () => window.removeEventListener("keydown", handleOpenShortcut);
  }, [isAddOpen, selectedItem, theme.readerOpenMode, t]);

  function filterByCollection(collection: string) {
    setQuery(`collection:${collection}`);
    setActiveType("all");
    navigateToView("library");
    setNotice(`${getCollectionLabel(collection, t)} ${t("collectionFiltered")}`);
  }

  function filterByTag(tag: string) {
    setQuery(`tag:${tag}`);
    setActiveType("all");
    navigateToView("library");
    setNotice(`#${getTagLabel(tag, t)} ${t("tagFiltered")}`);
  }

  function updateCollectionSettings(collection: string, patch: Partial<CollectionSettings>) {
    setCollectionSettings((current) => ({
      ...current,
      [collection]: {
        ...getCollectionSettings(collection, current, items),
        ...patch,
      },
    }));
  }

  function renameCollection(previousName: string, nextName: string) {
    const normalizedName = nextName.trim();
    if (!normalizedName) return false;
    if (normalizedName === previousName) return true;
    if (items.some((item) => item.collection === normalizedName)) {
      setNotice(t("collectionNameExists"));
      return false;
    }

    setItems((current) =>
      current.map((item) =>
        item.collection === previousName ? { ...item, collection: normalizedName, updatedAt: new Date().toISOString() } : item,
      ),
    );
    setCollectionSettings((current) => {
      const next = { ...current };
      const previousSettings = getCollectionSettings(previousName, current, items);
      delete next[previousName];
      next[normalizedName] = previousSettings;
      return next;
    });
    setNotice(`${getCollectionLabel(previousName, t)} -> ${normalizedName}`);
    return true;
  }

  function navigatePrimaryView(nextView: View) {
    if (appSettings.resetSearchOnNavigation) {
      setQuery("");
      setActiveType("all");
    }
    navigateToView(nextView);
  }

  async function addManualItem(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft.title.trim()) {
      setNotice(t("titleRequired"));
      return;
    }
    if (draft.source !== "note" && !draft.location.trim()) {
      setNotice(t("locationRequired"));
      return;
    }
    if (new Blob([draft.textContent]).size > maxManualTextBytes) {
      setNotice(t("manualTextTooLarge"));
      return;
    }
    if (addInFlightRef.current) return;

    addInFlightRef.current = true;
    setIsAdding(true);
    try {
      let location = draft.location.trim() || "No location yet";
      if (nativeRuntime && draft.source === "path") {
        location = await registerNativeContentPath(location, draft.type);
      }

      const now = new Date().toISOString();
      const nextItem: ContentItem = {
        id: createId(),
        title: draft.title.trim(),
        type: draft.type,
        source: draft.source,
        location,
        collection: draft.collection.trim() || "Inbox",
        tags: draft.tags
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean),
        accent: draft.accent,
        summary: draft.summary.trim(),
        textContent: draft.textContent.trim(),
        isFavorite: true,
        openCount: 0,
        createdAt: now,
        updatedAt: now,
      };

      setItems((current) => [nextItem, ...current]);
      if (nextItem.source === "path") {
        setRegisteredPathIds((current) => new Set(current).add(nextItem.id));
      }
      setDraft(initialDraft);
      setIsAddOpen(false);
      navigateToView("library", nextItem.id);
      setNotice(`${nextItem.title} ${t("addedToShelf")}`);
    } catch {
      setNotice(t("invalidLocalPath"));
    } finally {
      addInFlightRef.current = false;
      setIsAdding(false);
    }
  }

  function importFile(file: File) {
    if (getTypeFromFile(file) === "document" && file.size > maxUploadDocumentBytes) {
      setNotice(t("uploadDocumentTooLarge"));
      return;
    }

    const now = new Date().toISOString();
    const type = getTypeFromFile(file);
    const baseItem: ContentItem = {
      id: createId(),
      title: file.name.replace(/\.[^/.]+$/, ""),
      type,
      source: "upload",
      location: file.name,
      collection: type === "document" ? "Reading" : "Media",
      tags: [type, "uploaded"],
      accent: type === "document" ? "#b7791f" : "#2563eb",
      summary: t("uploadPreviewSummary"),
      fileName: file.name,
      isFavorite: true,
      openCount: 0,
      createdAt: now,
      updatedAt: now,
    };

    if (type === "document") {
      const reader = new FileReader();
      reader.onload = () => {
        const textContent = typeof reader.result === "string" ? reader.result : "";
        const nextItem = { ...baseItem, textContent };
        setItems((current) => [nextItem, ...current]);
        navigateToView("library", nextItem.id);
        setIsAddOpen(false);
        setNotice(`${nextItem.title} ${t("importedReadable")}`);
      };
      reader.readAsText(file);
      return;
    }

    const nextItem = { ...baseItem, objectUrl: URL.createObjectURL(file) };
    setItems((current) => [nextItem, ...current]);
    navigateToView("library", nextItem.id);
    setIsAddOpen(false);
    setNotice(`${nextItem.title} ${t("importedPreview")}`);
  }

  async function addNativeFile() {
    try {
      const selection = await selectNativeFile();
      if (!selection) {
        return;
      }

      const now = new Date().toISOString();
      const nextItem: ContentItem = {
        id: createId(),
        title: selection.title,
        type: selection.contentType,
        source: "path",
        location: selection.path,
        fileName: selection.fileName,
        sizeBytes: selection.sizeBytes,
        modifiedAt: selection.modifiedAt,
        collection: selection.contentType === "document" ? "Reading" : "Media",
        tags: [selection.contentType, "local"],
        accent: selection.contentType === "document" ? "#b7791f" : "#2563eb",
        summary: selection.fileName ? t("localFileSummary") : t("localFilePathSummary"),
        textContent: selection.textContent,
        isFavorite: true,
        openCount: 0,
        createdAt: now,
        updatedAt: now,
      };

      setItems((current) => [nextItem, ...current]);
      setRegisteredPathIds((current) => new Set(current).add(nextItem.id));
      navigateToView("library", nextItem.id);
      setIsAddOpen(false);
      setNotice(`${nextItem.title} ${t("nativeFileAdded")}`);
    } catch {
      setNotice(t("nativeUnavailable"));
    }
  }

  async function addNativeFolder() {
    try {
      const selection = await selectNativeFolder();
      if (!selection) {
        return;
      }

      const now = new Date().toISOString();
      const nextItem: ContentItem = {
        id: createId(),
        title: selection.title,
        type: "folder",
        source: "path",
        location: selection.path,
        collection: "Folders",
        tags: ["folder", "local"],
        accent: "#059669",
        summary: `${selection.entries.length} ${t("localFolderSummary")}`,
        folderEntries: selection.entries,
        isFavorite: true,
        openCount: 0,
        createdAt: now,
        updatedAt: now,
      };

      setItems((current) => [nextItem, ...current]);
      setRegisteredPathIds((current) => new Set(current).add(nextItem.id));
      navigateToView("library", nextItem.id);
      setIsAddOpen(false);
      setNotice(`${nextItem.title} ${t("nativeFolderAdded")}`);
    } catch {
      setNotice(t("nativeUnavailable"));
    }
  }

  function updateSelectedItem(patch: Partial<ContentItem>) {
    if (!selectedItem) return;
    setItems((current) =>
      current.map((item) =>
        item.id === selectedItem.id ? { ...item, ...patch, updatedAt: new Date().toISOString() } : item,
      ),
    );
  }

  function moveDashboardCard(itemId: string, direction: -1 | 1) {
    setDashboardLayouts((current) => {
      const layouts = normalizeDashboardLayouts(items, current);
      const index = layouts.findIndex((layout) => layout.itemId === itemId);
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= layouts.length) {
        return layouts;
      }

      const next = [...layouts];
      [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
      return next.map((layout, order) => ({ ...layout, order }));
    });
  }

  function cycleDashboardCardSize(itemId: string) {
    setDashboardLayouts((current) =>
      normalizeDashboardLayouts(items, current).map((layout) => {
        if (layout.itemId !== itemId) {
          return layout;
        }

        const nextSize = dashboardSizes[(dashboardSizes.indexOf(layout.size) + 1) % dashboardSizes.length];
        return { ...layout, size: nextSize };
      }),
    );
  }

  function toggleDashboardCardHidden(itemId: string) {
    setDashboardLayouts((current) =>
      normalizeDashboardLayouts(items, current).map((layout) =>
        layout.itemId === itemId ? { ...layout, hidden: !layout.hidden } : layout,
      ),
    );
  }

  function deleteSelectedItem() {
    if (!selectedItem) return;
    if (!window.confirm(t("deleteConfirm"))) return;
    const nextItems = items.filter((item) => item.id !== selectedItem.id);
    setItems(nextItems);
    navigateToView("library", nextItems[0]?.id ?? "");
    setNotice(`${selectedItem.title} ${t("removed")}`);
  }

  function exportData() {
    const serializableItems = prepareItemsForPersistence(items);
    const blob = new Blob(
      [
        JSON.stringify(
          {
            items: serializableItems,
            theme,
            language,
            dashboardLayouts: normalizedDashboardLayouts,
            collectionSettings,
            appSettings,
          },
          null,
          2,
        ),
      ],
      { type: "application/json" },
    );
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "mypersonalshelf-export.json";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function retryClose() {
    setCloseError("");
    void closeCurrentNativeWindow();
  }

  function forceClose() {
    void destroyCurrentNativeWindow();
  }

  if (!storageReady) {
    return (
      <div className="loadingShell" style={shellStyle}>
        <div className="brandMark">S</div>
        <strong>{appConfig.displayName}</strong>
        <span>{t("loadingShelf")}</span>
      </div>
    );
  }

  if (storageLoadFailed) {
    return (
      <div className="loadingShell storageErrorShell" style={shellStyle}>
        <div className="brandMark">S</div>
        <strong>{t("storageLoadFailed")}</strong>
        <span>{t("storageLoadFailedHint")}</span>
        <button type="button" onClick={() => window.location.reload()}>{t("retry")}</button>
      </div>
    );
  }

  if (activeView === "reader" && selectedItem) {
    const leaveReader = () => {
      if (readerItemIdFromUrl && nativeRuntime) {
        void closeCurrentNativeWindow();
        return;
      }
      navigateToView("library", selectedItem.id);
    };

    return (
      <div className="readerShell" style={shellStyle}>
        {closeError && (
          <div className="closeErrorBanner" role="alert">
            <span>{closeError}</span>
            <div>
              <button type="button" onClick={retryClose}>{t("retry")}</button>
              <button type="button" onClick={forceClose}>{t("forceClose")}</button>
            </div>
          </div>
        )}
        {selectedItem.type === "document" ? (
          <ReaderView
            item={selectedItem}
            theme={theme}
            t={t}
            onBack={leaveReader}
            onCloseFlushChange={registerReaderCloseFlush}
            onPatch={updateSelectedItem}
          />
        ) : (
          <MediaViewerView
            item={selectedItem}
            t={t}
            onBack={leaveReader}
            onCloseFlushChange={registerReaderCloseFlush}
            onPatch={updateSelectedItem}
          />
        )}
      </div>
    );
  }

  return (
    <div className={`appShell ${theme.compactCards ? "compact" : ""}`} style={shellStyle}>
      <aside className="sidebar">
        <button className="brand brandButton" type="button" onClick={() => navigatePrimaryView("dashboard")}>
          <div className="brandMark">S</div>
          <div>
            <strong>{appConfig.displayName}</strong>
            <span>{t("tagline")}</span>
          </div>
        </button>

        <nav className="navList" aria-label={t("primaryNavigation")}>
          {navItems.map((item) => (
            <button
              className={`navItem ${activeView === item.id ? "active" : ""}`}
              type="button"
              key={item.id}
              onClick={() => navigatePrimaryView(item.id)}
            >
              {item.icon}
              {t(item.label)}
            </button>
          ))}
        </nav>

        <div className="sidebarPanel">
          <span className="panelLabel">{t("shelfStatus")}</span>
          <p>{items.length} {t("items")}, {favoriteItems.length} {t("favorites")}, {Object.keys(groupedCollections).length} {t("collections")}.</p>
        </div>
      </aside>

      <main className="workspace">
        {closeError && (
          <div className="closeErrorBanner" role="alert">
            <span>{closeError}</span>
            <div>
              <button type="button" onClick={retryClose}>{t("retry")}</button>
              <button type="button" onClick={forceClose}>{t("forceClose")}</button>
            </div>
          </div>
        )}
        <header className="topbar">
          <div className="searchBox">
            <Search size={18} />
            <input
              ref={searchInputRef}
              aria-label={t("searchContent")}
              placeholder={t("searchPlaceholder")}
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                navigateToView("library");
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" && filteredItems[0]) {
                  event.preventDefault();
                  event.stopPropagation();
                  if (event.ctrlKey || event.metaKey || appSettings.searchEnterBehavior === "open") {
                    void openItem(filteredItems[0]);
                  } else {
                    selectItem(filteredItems[0]);
                  }
                }
              }}
            />
          </div>
          <div className="actions">
            <button className="iconButton" type="button" aria-label={t("exportData")} onClick={exportData}>
              <Download size={18} />
            </button>
            <button className="iconButton" type="button" aria-label={t("openCustomize")} onClick={() => navigatePrimaryView("customize")}>
              <Paintbrush size={18} />
            </button>
            <button className="primaryButton" type="button" onClick={() => setIsAddOpen(true)}>
              <FilePlus2 size={18} />
              {t("addContent")}
            </button>
          </div>
        </header>

        <section className="statusStrip" aria-live="polite">
          {notice} <span>{t("commandHint")}</span>
        </section>

        {activeView === "dashboard" && (
          <>
            <section className="heroBand">
              <div className="heroCopy">
                <span className="eyebrow">{t("heroEyebrow")}</span>
                <h1>{t("dashboardTitle")}</h1>
                <p>{t("heroTitle")}</p>
              </div>
              <div className="heroStats" aria-label={t("featureSummary")}>
                <button type="button" onClick={() => navigatePrimaryView("library")}>
                  <span className="heroStatIcon"><Library size={18} /></span>
                  <span><strong>{items.length}</strong>{t("items")}</span>
                </button>
                <button type="button" onClick={() => navigatePrimaryView("library")}>
                  <span className="heroStatIcon"><Star size={18} /></span>
                  <span><strong>{favoriteItems.length}</strong>{t("pinned")}</span>
                </button>
                <button type="button" onClick={() => navigatePrimaryView("collections")}>
                  <span className="heroStatIcon"><Tags size={18} /></span>
                  <span><strong>{Object.keys(groupedCollections).length}</strong>{t("groups")}</span>
                </button>
                <button type="button" onClick={() => navigatePrimaryView("customize")}>
                  <span className="heroStatIcon"><Paintbrush size={18} /></span>
                  <span><strong>{t("dashboardStyle")}</strong>{t("custom")}</span>
                </button>
              </div>
            </section>

            <div className="dashboardSectionHeading">
              <div>
                <span className="eyebrow">{t("dashboardFavorites")}</span>
                <h2>{t("dashboardPinnedTitle")}</h2>
              </div>
              <p>{t("dashboardPinnedHint")}</p>
            </div>

            <section className="dashboardGrid" aria-label={t("dashboardFavorites")}>
              {visibleDashboardCards.length === 0 ? (
                <div className="emptyDashboardPanel">
                  <div className="guideIllustration compactGuideIllustration">
                    <div className="guideShelfCard"><BookOpen size={18} /> txt/md</div>
                    <div className="guideShelfCard"><Play size={18} /> mp4</div>
                    <div className="guideShelfCard"><Link size={18} /> link</div>
                    <div className="guideShelfCard"><FolderOpen size={18} /> folder</div>
                  </div>
                  <div>
                    <span className="eyebrow">{t("emptyDashboardEyebrow")}</span>
                    <h2>{t("emptyDashboardTitle")}</h2>
                    <p>{t("emptyDashboardText")}</p>
                    <div className="emptyDashboardActions">
                      <button className="primaryButton" type="button" onClick={() => setIsAddOpen(true)}>
                        <FilePlus2 size={17} />
                        {t("addContent")}
                      </button>
                      <button type="button" onClick={() => navigatePrimaryView("guide")}>
                        <HelpCircle size={17} />
                        {t("openGuide")}
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                visibleDashboardCards.map(({ item, layout }) => (
                  <ShelfCard
                    item={item}
                    key={item.id}
                    t={t}
                    selected={selectedItemId === item.id}
                    variant={layout.size}
                    onSelect={() => selectItem(item)}
                    onOpen={() => void openItem(item)}
                    onFilterTag={filterByTag}
                    onToggleFavorite={() => updateItem(setItems, item.id, { isFavorite: !item.isFavorite })}
                  />
                ))
              )}
            </section>

            <section className="dashboardActivityGrid" aria-label={t("recentlyOpened")}>
              <div className="libraryPanel activityPanel">
                <div className="sectionTitle">
                  <h2>{t("recentlyOpened")}</h2>
                  <span>{recentItems.length} {t("items")}</span>
                </div>
                <div className="itemList">
                  {recentItems.length === 0 ? (
                    <p className="emptyText">{t("noRecentItems")}</p>
                  ) : (
                    recentItems.map((item) => (
                      <button
                        className="listItem"
                        type="button"
                        key={item.id}
                        onClick={() => selectItem(item)}
                        onDoubleClick={() => void openItem(item)}
                        onKeyDown={(event) => {
                          if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
                            event.preventDefault();
                            void openItem(item);
                          }
                        }}
                      >
                        <span className="listIcon" style={{ color: item.accent }}>
                          {typeIcons[item.type]}
                        </span>
                        <span>
                          <strong>{getItemTitle(item, t)}</strong>
                          <small>{getItemLocation(item, t)}</small>
                        </span>
                      </button>
                    ))
                  )}
                </div>
              </div>

              <div className="libraryPanel activityPanel">
                <div className="sectionTitle">
                  <h2>{t("frequentlyOpened")}</h2>
                  <span>{frequentItems.length} {t("items")}</span>
                </div>
                <div className="itemList">
                  {frequentItems.length === 0 ? (
                    <p className="emptyText">{t("noFrequentItems")}</p>
                  ) : (
                    frequentItems.map((item) => (
                      <button
                        className="listItem"
                        type="button"
                        key={item.id}
                        onClick={() => selectItem(item)}
                        onDoubleClick={() => void openItem(item)}
                        onKeyDown={(event) => {
                          if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
                            event.preventDefault();
                            void openItem(item);
                          }
                        }}
                      >
                        <span className="listIcon" style={{ color: item.accent }}>
                          {typeIcons[item.type]}
                        </span>
                        <span>
                          <strong>{getItemTitle(item, t)}</strong>
                          <small>{item.openCount} {t("opens")} / {getItemLocation(item, t)}</small>
                        </span>
                      </button>
                    ))
                  )}
                </div>
              </div>
            </section>
          </>
        )}

        {activeView === "library" && (
          <>
            <section className="pageIntro">
              <div>
                <span className="eyebrow">{t("libraryEyebrow")}</span>
                <h1>{t("libraryTitle")}</h1>
              </div>
              <div className="pageIntroStats">
                <span>{filteredItems.length} {t("visible")}</span>
                <span>{Object.keys(groupedCollections).length} {t("groups")}</span>
              </div>
            </section>
            <section className="lowerGrid">
              <div className="libraryPanel">
                <div className="sectionTitle">
                  <h2>{t("library")}</h2>
                  <span>{filteredItems.length} {t("visible")}</span>
                </div>
                <div className="filterRow">
                  <button className={activeType === "all" ? "active" : ""} type="button" onClick={() => setActiveType("all")}>
                    {t("all")}
                  </button>
                  {contentTypes.map((type) => (
                    <button
                      className={activeType === type ? "active" : ""}
                      type="button"
                      key={type}
                      onClick={() => setActiveType(type)}
                    >
                      {getTypeLabel(type, t)}
                    </button>
                  ))}
                </div>
                <div className="itemList">
                  {filteredItems.length === 0 ? (
                    <div className="emptyListPanel">
                      <strong>{query ? t("noSearchResults") : t("emptyLibraryTitle")}</strong>
                      <p>{query ? t("noSearchResultsText") : t("emptyLibraryText")}</p>
                      {!query && (
                        <button type="button" onClick={() => setIsAddOpen(true)}>
                          <FilePlus2 size={16} />
                          {t("addContent")}
                        </button>
                      )}
                    </div>
                  ) : (
                    filteredItems.map((item) => (
                      <button
                        className={`listItem ${selectedItemId === item.id ? "selected" : ""}`}
                        type="button"
                        key={item.id}
                        onClick={() => selectItem(item)}
                        onDoubleClick={() => void openItem(item)}
                        onKeyDown={(event) => {
                          if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
                            event.preventDefault();
                            void openItem(item);
                          }
                        }}
                      >
                        <span className="listIcon" style={{ color: item.accent }}>
                          {typeIcons[item.type]}
                        </span>
                        <span>
                          <strong>{getItemTitle(item, t)}</strong>
                          <small>{getCollectionLabel(item.collection, t)} / {getItemLocation(item, t)}</small>
                        </span>
                      </button>
                    ))
                  )}
                </div>
              </div>

              {selectedItem && (
              <DetailPanel
                item={selectedItem}
                theme={theme}
                t={t}
                pathReady={!nativeRuntime || selectedItem.source !== "path" || registeredPathIds.has(selectedItem.id)}
                collectionNames={collectionNames}
                onPatch={updateSelectedItem}
                onDelete={deleteSelectedItem}
                onOpenItem={() => void openItem(selectedItem)}
                onFilterCollection={filterByCollection}
                onFilterTag={filterByTag}
              />
            )}
          </section>
        </>
      )}

        {activeView === "collections" && (
          <>
            <section className="pageIntro">
              <div>
                <span className="eyebrow">{t("collectionsEyebrow")}</span>
                <h1>{t("collectionsTitle")}</h1>
              </div>
              <div className="pageIntroStats">
                <span>{Object.keys(groupedCollections).length} {t("groups")}</span>
                <span>{items.length} {t("items")}</span>
              </div>
            </section>
            <section className="libraryPanel">
              <div className="sectionTitle">
                <h2>{t("navCollections")}</h2>
                <span>{t("clickCollection")}</span>
              </div>
              <div className="collectionGrid">
                {collectionNames.map((collection) => {
                  const collectionItems = groupedCollections[collection] ?? [];
                  const settings = getCollectionSettings(collection, collectionSettings, items);
                  return (
                    <article className="collectionCard collectionEditorCard" key={collection} style={{ borderColor: settings.color }}>
                      <button className="collectionOpenButton" type="button" onClick={() => filterByCollection(collection)}>
                        <span className="collectionIcon" style={{ color: settings.color }}>
                          {collectionIcons[settings.icon]}
                        </span>
                        <strong>{getCollectionLabel(collection, t)}</strong>
                        <span>{collectionItems.length} {collectionItems.length === 1 ? t("itemSingular") : t("itemPlural")}</span>
                        <small>{collectionItems.map((item) => getTypeLabel(item.type, t)).join(", ")}</small>
                      </button>
                      <div className="collectionEditGrid">
                        <label>
                          {t("collectionName")}
                          <input
                            defaultValue={collection}
                            onBlur={(event) => {
                              if (!renameCollection(collection, event.currentTarget.value)) {
                                event.currentTarget.value = collection;
                              }
                            }}
                            onKeyDown={(event) => {
                              if (event.key === "Enter") {
                                event.currentTarget.blur();
                              }
                            }}
                          />
                        </label>
                        <label>
                          {t("collectionColor")}
                          <input
                            type="color"
                            value={settings.color}
                            onChange={(event) => updateCollectionSettings(collection, { color: event.target.value })}
                          />
                        </label>
                        <label>
                          {t("collectionIcon")}
                          <select value={settings.icon} onChange={(event) => updateCollectionSettings(collection, { icon: event.target.value as CollectionIcon })}>
                            {collectionIconOptions.map((icon) => (
                              <option value={icon} key={icon}>
                                {t(`collectionIcon${icon[0].toUpperCase()}${icon.slice(1)}` as MessageKey)}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
            <section className="libraryPanel">
              <div className="sectionTitle">
                <h2>{t("tagOverview")}</h2>
                <span>{Object.keys(groupedTags).length} {t("tags")}</span>
              </div>
              <div className="tagCloud">
                {Object.entries(groupedTags)
                  .sort((left, right) => right[1].length - left[1].length || left[0].localeCompare(right[0]))
                  .map(([tag, tagItems]) => (
                    <button type="button" key={tag} onClick={() => filterByTag(tag)}>
                      <strong>#{getTagLabel(tag, t)}</strong>
                      <span>{tagItems.length} {tagItems.length === 1 ? t("itemSingular") : t("itemPlural")}</span>
                    </button>
                  ))}
                {Object.keys(groupedTags).length === 0 && <p className="emptyText">{t("noTags")}</p>}
              </div>
            </section>
          </>
        )}

        {activeView === "customize" && (
          <CustomizePanel
            theme={theme}
            items={items}
            dashboardLayouts={normalizedDashboardLayouts}
            t={t}
            onChange={setTheme}
            onMoveDashboardCard={moveDashboardCard}
            onCycleDashboardCardSize={cycleDashboardCardSize}
            onToggleDashboardCardHidden={toggleDashboardCardHidden}
            onReset={() => {
              setTheme(defaultTheme);
              setNotice(t("themeReset"));
            }}
          />
        )}

        {activeView === "settings" && (
          <SettingsPanel
            appSettings={appSettings}
            theme={theme}
            language={language}
            itemCount={items.length}
            collectionCount={collectionNames.length}
            t={t}
            onAppSettingsChange={setAppSettings}
            onThemeChange={setTheme}
            onLanguageChange={setLanguage}
            onExportData={exportData}
          />
        )}

        {activeView === "guide" && (
          <GuidePanel t={t} onAddContent={() => setIsAddOpen(true)} onOpenCustomize={() => navigatePrimaryView("customize")} />
        )}
      </main>

      {isAddOpen && (
        <AddContentModal
          mode={addMode}
          draft={draft}
          isSubmitting={isAdding}
          t={t}
          getTypeLabel={(type) => getTypeLabel(type, t)}
          onModeChange={setAddMode}
          onDraftChange={setDraft}
          onSubmit={addManualItem}
          onFile={importFile}
          onNativeFile={addNativeFile}
          onNativeFolder={addNativeFolder}
          onClose={() => setIsAddOpen(false)}
        />
      )}
    </div>
  );
}

function updateItem(setItems: React.Dispatch<React.SetStateAction<ContentItem[]>>, itemId: string, patch: Partial<ContentItem>) {
  setItems((current) =>
    current.map((item) =>
      item.id === itemId ? { ...item, ...patch, updatedAt: new Date().toISOString() } : item,
    ),
  );
}

function ShelfCard({
  item,
  t,
  selected,
  variant,
  onSelect,
  onOpen,
  onFilterTag,
  onToggleFavorite,
}: {
  item: ContentItem;
  t: (key: MessageKey) => string;
  selected: boolean;
  variant: "standard" | "wide" | "tall";
  onSelect: () => void;
  onOpen: () => void;
  onFilterTag: (tag: string) => void;
  onToggleFavorite: () => void;
}) {
  function handleCardKeyDown(event: React.KeyboardEvent<HTMLElement>) {
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      event.preventDefault();
      onOpen();
      return;
    }

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelect();
    }
  }

  return (
    <article className={`contentCard ${variant} ${selected ? "selected" : ""}`}>
      <button
        className="cardHitArea"
        type="button"
        aria-pressed={selected}
        onClick={onSelect}
        onDoubleClick={onOpen}
        onKeyDown={handleCardKeyDown}
      >
        <div className="cardHeader">
          <div className="typeBadge" style={{ color: item.accent }}>
            {typeIcons[item.type]}
            {getCollectionLabel(item.collection, t)}
          </div>
          <span className="cardType">{getTypeLabel(item.type, t)}</span>
        </div>
        <h2>{getItemTitle(item, t)}</h2>
        <p>{getItemSummary(item, t)}</p>
        <div className="itemPreview" style={{ borderColor: item.accent }}>
          <strong>{getSourceLabel(item.source, t)}</strong>
          <span>{getItemLocation(item, t)}</span>
        </div>
      </button>
      <div className="tagRow">
        {item.tags.map((tag) => (
          <button type="button" key={tag} onClick={() => onFilterTag(tag)}>
            #{getTagLabel(tag, t)}
          </button>
        ))}
      </div>
      <button
        className="favoriteButton"
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onToggleFavorite();
        }}
        onDoubleClick={(event) => event.stopPropagation()}
      aria-label={item.isFavorite ? t("unpin") : t("pin")}
      >
        <Star size={16} fill={item.isFavorite ? "currentColor" : "none"} />
      </button>
    </article>
  );
}

function DetailPanel({
  item,
  theme,
  t,
  pathReady,
  collectionNames,
  onPatch,
  onDelete,
  onOpenItem,
  onFilterCollection,
  onFilterTag,
}: {
  item: ContentItem;
  theme: ThemeSettings;
  t: (key: MessageKey) => string;
  pathReady: boolean;
  collectionNames: string[];
  onPatch: (patch: Partial<ContentItem>) => void;
  onDelete: () => void;
  onOpenItem?: () => void;
  onFilterCollection: (collection: string) => void;
  onFilterTag: (tag: string) => void;
}) {
  const safeExternalUrl = item.type === "link" ? getSafeExternalUrl(item.location) : null;
  const [collectionDraft, setCollectionDraft] = useState(item.collection);
  const [tagDraft, setTagDraft] = useState(item.tags.join(", "));

  useEffect(() => {
    setCollectionDraft(item.collection);
    setTagDraft(item.tags.join(", "));
  }, [item.collection, item.id, item.tags]);

  function commitCollectionDraft() {
    const nextCollection = collectionDraft.trim() || "Inbox";
    setCollectionDraft(nextCollection);
    if (nextCollection !== item.collection) {
      onPatch({ collection: nextCollection });
    }
  }

  function commitTagDraft() {
    const nextTags = parseTagInput(tagDraft);
    setTagDraft(nextTags.join(", "));
    if (nextTags.join("\u0000") !== item.tags.join("\u0000")) {
      onPatch({ tags: nextTags });
    }
  }

  return (
    <div className="readerPanel">
      <div className="sectionTitle">
        <h2>{t("preview")}</h2>
        <span>{getTypeLabel(item.type, t)}</span>
      </div>
      <div className="detailActions">
        <button type="button" onClick={() => onPatch({ isFavorite: !item.isFavorite })}>
          <Star size={16} fill={item.isFavorite ? "currentColor" : "none"} />
          {item.isFavorite ? t("pinnedState") : t("pin")}
        </button>
        {isViewerContent(item) && onOpenItem && (
          <button type="button" onClick={onOpenItem}>
            {item.type === "document" ? <BookOpen size={16} /> : typeIcons[item.type]}
            {item.type === "document" ? t("openReader") : t("open")}
          </button>
        )}
        {item.type === "link" && (
          <button
            type="button"
            disabled={!safeExternalUrl}
            title={safeExternalUrl ? t("open") : t("invalidLink")}
            onClick={onOpenItem}
          >
            <Link size={16} />
            {safeExternalUrl ? t("open") : t("invalidLink")}
          </button>
        )}
        {item.type === "folder" && item.source === "path" && (
          <button type="button" onClick={onOpenItem}>
            <FolderOpen size={16} />
            {t("openFolder")}
          </button>
        )}
        <button className="dangerButton" type="button" onClick={onDelete}>
          <Trash2 size={16} />
          {t("delete")}
        </button>
      </div>

      <div
        className="readerPreview"
        style={{
          borderColor: item.accent,
          fontSize: theme.readerFontSize,
          maxWidth: theme.readerWidth,
          lineHeight: theme.lineHeight,
        }}
      >
        <strong>{getItemTitle(item, t)}</strong>
        <PreviewBody item={item} t={t} onPatch={onPatch} pathReady={pathReady} />
      </div>

      <label className="fieldBlock">
        {t("notes")}
        <textarea
          value={item.summary ? getItemSummary(item, t) : ""}
          onChange={(event) => onPatch({ summary: event.target.value })}
          placeholder={t("notesPlaceholder")}
        />
      </label>

      <div className="organizeEditor">
        <label className="fieldBlock">
          {t("collection")}
          <input
            list="collection-options"
            value={collectionDraft}
            onChange={(event) => setCollectionDraft(event.target.value)}
            onBlur={commitCollectionDraft}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur();
            }}
          />
        </label>
        <datalist id="collection-options">
          {collectionNames.map((collection) => (
            <option value={collection} key={collection} />
          ))}
        </datalist>
        <label className="fieldBlock">
          {t("tagsComma")}
          <input
            value={tagDraft}
            onChange={(event) => setTagDraft(event.target.value)}
            onBlur={commitTagDraft}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur();
            }}
          />
        </label>
      </div>

      <div className="quickFilterRow">
        <button type="button" onClick={() => onFilterCollection(item.collection)}>
          {t("filterCollection")}
        </button>
        {item.tags.map((tag) => (
          <button type="button" key={tag} onClick={() => onFilterTag(tag)}>
            #{getTagLabel(tag, t)}
          </button>
        ))}
      </div>

      <div className="metaGrid">
        <span>{t("collection")}</span>
        <strong>{getCollectionLabel(item.collection, t)}</strong>
        <span>{t("location")}</span>
        <strong>{getItemLocation(item, t)}</strong>
        <span>{t("tags")}</span>
        <strong>{item.tags.map((tag) => `#${getTagLabel(tag, t)}`).join(" ") || t("none")}</strong>
      </div>
    </div>
  );
}

function ReaderView({
  item,
  theme,
  t,
  onBack,
  onCloseFlushChange,
  onPatch,
}: {
  item: ContentItem;
  theme: ThemeSettings;
  t: (key: MessageKey) => string;
  onBack: () => void;
  onCloseFlushChange: (handler: (() => Promise<void>) | null) => void;
  onPatch: (patch: Partial<ContentItem>) => void;
}) {
  const documentText = getItemTextContent(item, t) || "";
  const fallbackText = item.summary ? getItemSummary(item, t) : t("documentEmpty");
  const onPatchRef = useRef(onPatch);
  const encodingChangeRef = useRef<Promise<void>>(Promise.resolve());
  const lastSavedProgressRef = useRef(item.readerProgress ?? 0);
  const lastSavedScrollTopRef = useRef(0);
  const latestReaderPositionRef = useRef({
    progress: item.readerProgress ?? 0,
    scrollTop: item.readerScrollTop ?? 0,
    updatedAt: Date.now(),
  });
  const canAutoSaveProgressRef = useRef(false);
  const resumePromptVisibleRef = useRef(false);
  const [showResumePrompt, setShowResumePrompt] = useState(false);
  const [savedProgress, setSavedProgress] = useState(item.readerProgress ?? 0);
  const [savedScrollTop, setSavedScrollTop] = useState(0);
  const [isChangingEncoding, setIsChangingEncoding] = useState(false);
  const [encodingError, setEncodingError] = useState("");
  const hasReadableText = Boolean(documentText);
  const progressLabel = savedScrollTop > 0 && savedProgress < 1 ? "<1" : String(Math.round(savedProgress));

  useEffect(() => {
    onPatchRef.current = onPatch;
  }, [onPatch]);

  useEffect(() => {
    let isMounted = true;
    const fallbackProgress = item.readerProgress ?? 0;
    const fallbackScrollTop = item.readerScrollTop ?? 0;
    canAutoSaveProgressRef.current = false;
    resumePromptVisibleRef.current = false;
    lastSavedProgressRef.current = fallbackProgress;
    lastSavedScrollTopRef.current = fallbackScrollTop;
    latestReaderPositionRef.current = {
      progress: fallbackProgress,
      scrollTop: fallbackScrollTop,
      updatedAt: Date.now(),
    };
    setSavedProgress(fallbackProgress);
    setSavedScrollTop(fallbackScrollTop);
    setShowResumePrompt(false);
    window.scrollTo({ top: 0 });

    if (!hasReadableText) {
      return () => {
        isMounted = false;
      };
    }

    loadNativeReaderProgress(item.id)
      .catch(() => ({ progress: fallbackProgress, scrollTop: fallbackScrollTop }))
      .then((loadedPosition) => {
        if (!isMounted) {
          return;
        }

        const loadedScrollTop =
          loadedPosition && typeof loadedPosition === "object"
            ? loadedPosition.scrollTop ?? (loadedPosition as { scroll_top?: number }).scroll_top ?? 0
            : 0;
        const nextProgress = typeof loadedPosition === "number" ? loadedPosition : loadedPosition?.progress ?? fallbackProgress;
        const nextScrollTop = typeof loadedPosition === "number" ? fallbackScrollTop : loadedScrollTop;
        lastSavedProgressRef.current = nextProgress;
        lastSavedScrollTopRef.current = nextScrollTop;
        latestReaderPositionRef.current = {
          progress: nextProgress,
          scrollTop: nextScrollTop,
          updatedAt: Date.now(),
        };
        setSavedProgress(nextProgress);
        setSavedScrollTop(nextScrollTop);
        onPatchRef.current({ readerProgress: nextProgress, readerScrollTop: nextScrollTop });

        if (hasReadableText && nextScrollTop > 400) {
          resumePromptVisibleRef.current = true;
          setShowResumePrompt(true);
          canAutoSaveProgressRef.current = false;
          return;
        }

        canAutoSaveProgressRef.current = true;
      });

    return () => {
      isMounted = false;
    };
  }, [hasReadableText, item.id]);

  useEffect(() => {
    if (!hasReadableText || canAutoSaveProgressRef.current || resumePromptVisibleRef.current) {
      return;
    }

    const nextScrollTop = item.readerScrollTop ?? 0;
    if (nextScrollTop <= 400) {
      return;
    }

    const nextProgress = item.readerProgress ?? 0;
    lastSavedProgressRef.current = nextProgress;
    lastSavedScrollTopRef.current = nextScrollTop;
    setSavedProgress(nextProgress);
    setSavedScrollTop(nextScrollTop);
    resumePromptVisibleRef.current = true;
    setShowResumePrompt(true);
  }, [hasReadableText, item.id, item.readerProgress, item.readerScrollTop]);

  useEffect(() => {
    let frame = 0;
    let interval = 0;

    function getScrollPosition() {
      const scrollingElement = document.scrollingElement ?? document.documentElement;
      const scrollTop = window.scrollY || scrollingElement.scrollTop || document.body.scrollTop || 0;
      const scrollableHeight = scrollingElement.scrollHeight - window.innerHeight;
      if (scrollableHeight <= 0) {
        return null;
      }

      const position = {
        progress: Math.min(100, Math.max(0, (scrollTop / scrollableHeight) * 100)),
        scrollTop,
      };
      latestReaderPositionRef.current = { ...position, updatedAt: Date.now() };
      return position;
    }

    function saveScrollProgress() {
      if (!canAutoSaveProgressRef.current || resumePromptVisibleRef.current) {
        return;
      }

      const nextPosition = getScrollPosition();
      if (nextPosition === null) {
        return;
      }

      const roundedProgress = Math.round(nextPosition.progress * 10) / 10;
      const roundedScrollTop = Math.round(nextPosition.scrollTop);
      if (
        Math.abs(roundedProgress - lastSavedProgressRef.current) < 1 &&
        Math.abs(roundedScrollTop - lastSavedScrollTopRef.current) < 300 &&
        roundedProgress < 99.5
      ) {
        return;
      }

      lastSavedProgressRef.current = roundedProgress;
      lastSavedScrollTopRef.current = roundedScrollTop;
      setSavedProgress(roundedProgress);
      setSavedScrollTop(roundedScrollTop);
      onPatchRef.current({ readerProgress: roundedProgress, readerScrollTop: roundedScrollTop });
      saveBrowserItemProgress(item.id, { readerProgress: roundedProgress, readerScrollTop: roundedScrollTop });
      saveNativeReaderProgress(
        item.id,
        roundedProgress,
        roundedScrollTop,
        latestReaderPositionRef.current.updatedAt,
      ).catch(() => {
        // Browser preview cannot call Tauri commands; item state still keeps the value for this session.
      });
    }

    function handleScroll() {
      getScrollPosition();
      if (!frame) {
        frame = window.requestAnimationFrame(() => {
          frame = 0;
          saveScrollProgress();
        });
      }
    }

    async function flushScrollProgress() {
      await encodingChangeRef.current;
      if (!canAutoSaveProgressRef.current || resumePromptVisibleRef.current) return;
      getScrollPosition();
      const latestPosition = latestReaderPositionRef.current;
      const roundedProgress = Math.round(latestPosition.progress * 10) / 10;
      const roundedScrollTop = Math.round(latestPosition.scrollTop);
      lastSavedProgressRef.current = roundedProgress;
      lastSavedScrollTopRef.current = roundedScrollTop;
      onPatchRef.current({ readerProgress: roundedProgress, readerScrollTop: roundedScrollTop });
      saveBrowserItemProgress(item.id, { readerProgress: roundedProgress, readerScrollTop: roundedScrollTop });
      await saveNativeReaderProgress(item.id, roundedProgress, roundedScrollTop, latestPosition.updatedAt);
    }

    const handlePageHide = () => {
      void flushScrollProgress().catch(() => undefined);
    };
    onCloseFlushChange(flushScrollProgress);

    window.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("pagehide", handlePageHide);
    document.addEventListener("scroll", handleScroll, { passive: true, capture: true });
    interval = window.setInterval(saveScrollProgress, 900);
    return () => {
      void flushScrollProgress().catch(() => undefined);
      onCloseFlushChange(null);
      if (frame) {
        window.cancelAnimationFrame(frame);
      }
      if (interval) {
        window.clearInterval(interval);
      }
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("pagehide", handlePageHide);
      document.removeEventListener("scroll", handleScroll, { capture: true });
    };
  }, [item.id, onCloseFlushChange]);

  function scrollToPosition(nextScrollTop: number) {
    const scrollableHeight = document.documentElement.scrollHeight - window.innerHeight;
    window.scrollTo({
      top: Math.min(Math.max(0, nextScrollTop), Math.max(0, scrollableHeight)),
      behavior: "smooth",
    });
  }

  function resumeReading() {
    resumePromptVisibleRef.current = false;
    setShowResumePrompt(false);
    canAutoSaveProgressRef.current = true;
    window.requestAnimationFrame(() => scrollToPosition(savedScrollTop));
  }

  function restartReading() {
    const updatedAt = Date.now();
    resumePromptVisibleRef.current = false;
    setShowResumePrompt(false);
    canAutoSaveProgressRef.current = true;
    lastSavedProgressRef.current = 0;
    lastSavedScrollTopRef.current = 0;
    latestReaderPositionRef.current = { progress: 0, scrollTop: 0, updatedAt };
    setSavedProgress(0);
    setSavedScrollTop(0);
    onPatch({ readerProgress: 0, readerScrollTop: 0 });
    saveBrowserItemProgress(item.id, { readerProgress: 0, readerScrollTop: 0 });
    saveNativeReaderProgress(item.id, 0, 0, updatedAt).catch(() => {
      // Browser preview cannot call Tauri commands; item state still keeps the value for this session.
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function changeTextEncoding(nextEncoding: TextEncoding) {
    if (item.source !== "path" || isChangingEncoding) return;
    const operation = (async () => {
      setIsChangingEncoding(true);
      setEncodingError("");
      try {
        const textContent = await readNativeTextFile(item.location, item.id, nextEncoding);
        await saveNativeTextEncoding(item.id, nextEncoding);
        onPatch({ textContent, textEncoding: nextEncoding });
      } catch {
        setEncodingError(t("encodingReadFailed"));
      } finally {
        setIsChangingEncoding(false);
      }
    })();
    encodingChangeRef.current = operation;
    await operation;
  }

  return (
    <section className="readerPage">
      <div className="readerPageHeader">
        <div>
          <span className="eyebrow">{getCollectionLabel(item.collection, t)}</span>
          <h1>{getItemTitle(item, t)}</h1>
          <p>{t("readerAutoSave")} - {progressLabel}%</p>
          {item.source === "path" && isNativeRuntime() && (
            <div className="readerEncodingGroup">
              <label className="readerEncodingControl">
                {t("textEncoding")}
                <select
                  value={item.textEncoding ?? "auto"}
                  disabled={isChangingEncoding}
                  onChange={(event) => void changeTextEncoding(event.target.value as TextEncoding)}
                >
                  {textEncodingOptions.map((option) => (
                    <option value={option.value} key={option.value}>{t(option.label)}</option>
                  ))}
                </select>
              </label>
              {(item.textEncoding ?? "auto") === "auto" && (
                <small className="readerEncodingHint">{t("encodingAutoHint")}</small>
              )}
            </div>
          )}
          {encodingError && <span className="readerEncodingError" role="alert">{encodingError}</span>}
        </div>
        <button type="button" onClick={onBack}>{t("backToLibrary")}</button>
      </div>
      {showResumePrompt && (
        <div className="resumePrompt" role="dialog" aria-label={t("resumeReadingTitle")}>
          <div>
            <strong>{t("resumeReadingTitle")}</strong>
            <p>{t("resumeReadingText").replace("{progress}", progressLabel)}</p>
          </div>
          <div className="resumeActions">
            <button type="button" onClick={resumeReading}>{t("resumeYes")}</button>
            <button type="button" onClick={restartReading}>{t("resumeNo")}</button>
          </div>
        </div>
      )}
      <article
        className="readerPageBody"
        style={{
          borderColor: item.accent,
          fontSize: theme.readerFontSize,
          lineHeight: theme.lineHeight,
          maxWidth: theme.readerWidth,
        }}
      >
        <DocumentTextView item={item} text={documentText} fallbackText={fallbackText} />
      </article>
    </section>
  );
}

function MediaViewerView({
  item,
  t,
  onBack,
  onCloseFlushChange,
  onPatch,
}: {
  item: ContentItem;
  t: (key: MessageKey) => string;
  onBack: () => void;
  onCloseFlushChange: (handler: (() => Promise<void>) | null) => void;
  onPatch: (patch: Partial<ContentItem>) => void;
}) {
  const previewUrl = item.objectUrl ?? (item.source === "path" ? nativeAssetUrl(item.location) : undefined);
  const canPreviewVideo = item.type === "video" && previewUrl && canPreviewMediaItem(item, "video");
  const canPreviewAudio = item.type === "audio" && previewUrl && canPreviewMediaItem(item, "audio");
  const canPreviewImage = item.type === "image" && previewUrl;
  const mediaElementRef = useRef<HTMLMediaElement | null>(null);
  const mediaOnPatchRef = useRef(onPatch);
  const lastSavedMediaPositionRef = useRef(item.mediaPosition ?? 0);
  const latestMediaPositionRef = useRef({ position: item.mediaPosition ?? 0, updatedAt: Date.now() });
  const [savedMediaPosition, setSavedMediaPosition] = useState(item.mediaPosition ?? 0);

  useEffect(() => {
    mediaOnPatchRef.current = onPatch;
  }, [onPatch]);

  useEffect(() => {
    async function flushMediaPosition() {
      if (item.type !== "video" && item.type !== "audio") return;
      const mediaPosition = mediaElementRef.current?.currentTime;
      if (typeof mediaPosition === "number" && Number.isFinite(mediaPosition)) {
        latestMediaPositionRef.current = { position: mediaPosition, updatedAt: Date.now() };
      }
      const { position: nextPosition, updatedAt } = latestMediaPositionRef.current;
      mediaOnPatchRef.current({ mediaPosition: nextPosition });
      saveBrowserItemProgress(item.id, { mediaPosition: nextPosition });
      await saveNativeMediaProgress(item.id, nextPosition, updatedAt);
    }

    const handlePageHide = () => {
      void flushMediaPosition().catch(() => undefined);
    };
    onCloseFlushChange(flushMediaPosition);

    window.addEventListener("pagehide", handlePageHide);
    return () => {
      void flushMediaPosition().catch(() => undefined);
      onCloseFlushChange(null);
      window.removeEventListener("pagehide", handlePageHide);
    };
  }, [item.id, item.type, onCloseFlushChange]);

  useEffect(() => {
    const fallbackPosition = item.mediaPosition ?? 0;
    lastSavedMediaPositionRef.current = fallbackPosition;
    latestMediaPositionRef.current = { position: fallbackPosition, updatedAt: Date.now() };
    setSavedMediaPosition(fallbackPosition);

    if (item.type !== "video" && item.type !== "audio") {
      return;
    }

    let isMounted = true;
    loadNativeMediaProgress(item.id)
      .then((progress) => {
        if (!isMounted || !progress) {
          return;
        }

        const nextPosition = progress.position ?? fallbackPosition;
        lastSavedMediaPositionRef.current = nextPosition;
        latestMediaPositionRef.current = { position: nextPosition, updatedAt: Date.now() };
        setSavedMediaPosition(nextPosition);
        onPatch({ mediaPosition: nextPosition });
        const media = mediaElementRef.current;
        if (media && nextPosition > 0) {
          const duration = media.duration;
          if (!Number.isFinite(duration) || nextPosition < duration - 2) {
            media.currentTime = nextPosition;
          }
        }
      })
      .catch(() => {
        // Browser preview cannot call Tauri commands; item state remains the fallback.
      });

    return () => {
      isMounted = false;
    };
  }, [item.id, item.type]);

  function attachMediaElement(node: HTMLMediaElement | null) {
    mediaElementRef.current = node;
  }

  function restoreMediaPosition(event: React.SyntheticEvent<HTMLMediaElement>) {
    const position = savedMediaPosition;
    const duration = event.currentTarget.duration;
    if (position > 0 && (!Number.isFinite(duration) || position < duration - 2)) {
      event.currentTarget.currentTime = position;
    }
  }

  function saveMediaPosition(nextPosition: number, minimumDelta = 3) {
    const updatedAt = Date.now();
    latestMediaPositionRef.current = { position: nextPosition, updatedAt };
    if (Math.abs(nextPosition - lastSavedMediaPositionRef.current) >= minimumDelta) {
      lastSavedMediaPositionRef.current = nextPosition;
      setSavedMediaPosition(nextPosition);
      onPatch({ mediaPosition: nextPosition });
      saveBrowserItemProgress(item.id, { mediaPosition: nextPosition });
      saveNativeMediaProgress(item.id, nextPosition, updatedAt).catch(() => {
        // Browser preview cannot call Tauri commands; item state still keeps the value for this session.
      });
    }
  }

  return (
    <section className="readerPage">
      <div className="readerPageHeader">
        <div>
          <span className="eyebrow">{getTypeLabel(item.type, t)}</span>
          <h1>{getItemTitle(item, t)}</h1>
          {(item.type === "video" || item.type === "audio") && (
            <p>{t("mediaResume")}: {Math.round(savedMediaPosition)}s</p>
          )}
        </div>
        <button type="button" onClick={onBack}>{t("backToLibrary")}</button>
      </div>

      <article className="readerPageBody mediaViewerBody" style={{ borderColor: item.accent }}>
        {canPreviewVideo && (
          <video
            src={previewUrl}
            controls
            autoPlay
            ref={attachMediaElement}
            onLoadedMetadata={restoreMediaPosition}
            onPause={(event) => saveMediaPosition(event.currentTarget.currentTime, 0)}
            onTimeUpdate={(event) => saveMediaPosition(event.currentTarget.currentTime)}
          />
        )}
        {canPreviewAudio && (
          <audio
            src={previewUrl}
            controls
            autoPlay
            ref={attachMediaElement}
            onLoadedMetadata={restoreMediaPosition}
            onPause={(event) => saveMediaPosition(event.currentTarget.currentTime, 0)}
            onTimeUpdate={(event) => saveMediaPosition(event.currentTarget.currentTime)}
          />
        )}
        {canPreviewImage && <img src={previewUrl} alt={getItemTitle(item, t)} />}
        {!canPreviewVideo && !canPreviewAudio && !canPreviewImage && (
          <div className="readerEmptyText">
            {item.type === "video" && t("videoPathSaved")}
            {item.type === "audio" && t("audioPathSaved")}
            {item.type === "image" && t("imagePathSaved")}
          </div>
        )}
      </article>
    </section>
  );
}

function PreviewBody({
  item,
  t,
  onPatch,
  pathReady,
}: {
  item: ContentItem;
  t: (key: MessageKey) => string;
  onPatch: (patch: Partial<ContentItem>) => void;
  pathReady: boolean;
}) {
  const canUseAssetPath = pathReady && item.source === "path" && (item.type === "video" || item.type === "audio" || item.type === "image");
  const previewUrl = item.objectUrl ?? (canUseAssetPath ? nativeAssetUrl(item.location) || undefined : undefined);
  const nativeMediaPositionRef = useRef(item.mediaPosition ?? 0);
  const latestPreviewMediaPositionRef = useRef({ position: item.mediaPosition ?? 0, updatedAt: Date.now() });
  const previewMediaElementRef = useRef<HTMLMediaElement | null>(null);
  const previewOnPatchRef = useRef(onPatch);
  const [nativeMediaPosition, setNativeMediaPosition] = useState(item.mediaPosition ?? 0);

  useEffect(() => {
    previewOnPatchRef.current = onPatch;
  }, [onPatch]);

  useEffect(() => {
    const media = previewMediaElementRef.current;
    if (!media || nativeMediaPosition <= 0 || !Number.isFinite(media.duration)) return;
    if (nativeMediaPosition < media.duration - 2 && Math.abs(media.currentTime - nativeMediaPosition) > 1) {
      media.currentTime = nativeMediaPosition;
    }
  }, [item.id, nativeMediaPosition]);

  useEffect(() => {
    function flushPreviewMediaPosition() {
      const { position: nextPosition, updatedAt } = latestPreviewMediaPositionRef.current;
      previewOnPatchRef.current({ mediaPosition: nextPosition });
      saveBrowserItemProgress(item.id, { mediaPosition: nextPosition });
      saveNativeMediaProgress(item.id, nextPosition, updatedAt).catch(() => undefined);
    }

    window.addEventListener("pagehide", flushPreviewMediaPosition);
    return () => {
      flushPreviewMediaPosition();
      window.removeEventListener("pagehide", flushPreviewMediaPosition);
    };
  }, [item.id]);

  useEffect(() => {
    const fallbackPosition = item.mediaPosition ?? 0;
    nativeMediaPositionRef.current = fallbackPosition;
    latestPreviewMediaPositionRef.current = { position: fallbackPosition, updatedAt: Date.now() };
    setNativeMediaPosition(fallbackPosition);

    if (item.type !== "video" && item.type !== "audio") {
      return;
    }

    let isMounted = true;
    function syncNativeMediaPosition() {
      const positionAtStart = latestPreviewMediaPositionRef.current;
      loadNativeMediaProgress(item.id).then((progress) => {
        if (!isMounted || !progress || latestPreviewMediaPositionRef.current !== positionAtStart) {
          return;
        }

        const nextPosition = progress.position ?? fallbackPosition;
        nativeMediaPositionRef.current = nextPosition;
        latestPreviewMediaPositionRef.current = { position: nextPosition, updatedAt: Date.now() };
        setNativeMediaPosition(nextPosition);
        onPatch({ mediaPosition: nextPosition });
        const media = previewMediaElementRef.current;
        if (media?.paused && nextPosition > 0) {
          const duration = media.duration;
          if (!Number.isFinite(duration) || nextPosition < duration - 2) {
            media.currentTime = nextPosition;
          }
        }
      })
      .catch(() => {
        // Browser preview cannot call Tauri commands; item state remains the fallback.
      });
    }

    syncNativeMediaPosition();
    window.addEventListener("focus", syncNativeMediaPosition);

    return () => {
      isMounted = false;
      window.removeEventListener("focus", syncNativeMediaPosition);
    };
  }, [item.id, item.type]);

  function savePreviewMediaPosition(nextPosition: number, minimumDelta = 5) {
    const updatedAt = Date.now();
    latestPreviewMediaPositionRef.current = { position: nextPosition, updatedAt };
    if (Math.abs(nextPosition - nativeMediaPositionRef.current) < minimumDelta) {
      return;
    }

    nativeMediaPositionRef.current = nextPosition;
    setNativeMediaPosition(nextPosition);
    onPatch({ mediaPosition: nextPosition });
    saveBrowserItemProgress(item.id, { mediaPosition: nextPosition });
    saveNativeMediaProgress(item.id, nextPosition, updatedAt).catch(() => {
      // Browser preview cannot call Tauri commands; item state still keeps the value for this session.
    });
  }

  if (item.type === "document") {
    const documentText = getItemTextContent(item, t);
    const fallbackText = item.summary ? getItemSummary(item, t) : t("documentEmpty");

    return (
      <div>
        <DocumentTextView item={item} text={documentText} fallbackText={fallbackText} variant="preview" />
        <p className="readerProgressNote">{t("readerAutoSave")} - {Math.round(item.readerProgress ?? 0)}%</p>
      </div>
    );
  }

  if (item.type === "video") {
    return previewUrl && canPreviewMediaItem(item, "video") ? (
      <video
        src={previewUrl}
        controls
        ref={(node) => {
          previewMediaElementRef.current = node;
        }}
        onLoadedMetadata={(event) => {
          event.currentTarget.currentTime = nativeMediaPosition;
        }}
        onTimeUpdate={(event) => {
          savePreviewMediaPosition(event.currentTarget.currentTime);
        }}
        onPause={(event) => savePreviewMediaPosition(event.currentTarget.currentTime, 0)}
      />
    ) : (
      <p>{t("videoPathSaved")}</p>
    );
  }

  if (item.type === "audio") {
    return previewUrl && canPreviewMediaItem(item, "audio") ? (
      <div>
        <audio
          src={previewUrl}
          controls
          ref={(node) => {
            previewMediaElementRef.current = node;
          }}
          onLoadedMetadata={(event) => {
            event.currentTarget.currentTime = nativeMediaPosition;
          }}
          onTimeUpdate={(event) => {
            savePreviewMediaPosition(event.currentTarget.currentTime);
          }}
          onPause={(event) => savePreviewMediaPosition(event.currentTarget.currentTime, 0)}
        />
        <p>{t("mediaResume")}: {Math.round(nativeMediaPosition)}s</p>
      </div>
    ) : (
      <p>{t("audioPathSaved")}</p>
    );
  }

  if (item.type === "image") {
    return previewUrl ? <img src={previewUrl} alt={item.title} /> : <p>{t("imagePathSaved")}</p>;
  }

  if (item.type === "link") {
    return <p>{item.location}</p>;
  }

  return (
    <div>
      <p>{t("folderPathSaved")}</p>
      <strong>{t("folderEntries")}</strong>
      {item.folderEntries && item.folderEntries.length > 0 ? (
        <ul className="folderEntryList">
          {item.folderEntries.slice(0, 20).map((entry) => (
            <li key={entry.path}>
              <span>{getEntryTypeLabel(entry.entryType, t)}</span>
              {entry.name}
            </li>
          ))}
        </ul>
      ) : (
        <p>{t("noFolderEntries")}</p>
      )}
    </div>
  );
}

function CustomizePanel({
  theme,
  items,
  dashboardLayouts,
  t,
  onChange,
  onMoveDashboardCard,
  onCycleDashboardCardSize,
  onToggleDashboardCardHidden,
  onReset,
}: {
  theme: ThemeSettings;
  items: ContentItem[];
  dashboardLayouts: DashboardLayoutItem[];
  t: (key: MessageKey) => string;
  onChange: (theme: ThemeSettings) => void;
  onMoveDashboardCard: (itemId: string, direction: -1 | 1) => void;
  onCycleDashboardCardSize: (itemId: string) => void;
  onToggleDashboardCardHidden: (itemId: string) => void;
  onReset: () => void;
}) {
  const previewItem = items.find((item) => item.isFavorite) ?? items[0];
  const visibleLayoutCount = dashboardLayouts.filter((layout) => !layout.hidden).length;
  const hiddenLayoutCount = dashboardLayouts.length - visibleLayoutCount;

  return (
    <section className="customizeWorkspace">
      <div className="customizeHeader">
        <div>
          <span className="eyebrow">{t("customizeEyebrow")}</span>
          <h1>{t("customizeTitle")}</h1>
        </div>
        <button type="button" onClick={onReset}>{t("resetTheme")}</button>
      </div>

      <div className="customizeGrid">
        <div className="customizeControls">
          <section className="settingsGroup">
            <div className="groupHeading">
              <h2>{t("identityAndMood")}</h2>
              <span>{t("savedLocalStorage")}</span>
            </div>
            <div className="colorControlGrid">
              <ColorControl label={t("background")} value={theme.background} onChange={(value) => onChange({ ...theme, background: value })} />
              <ColorControl label={t("surface")} value={theme.surface} onChange={(value) => onChange({ ...theme, surface: value })} />
              <ColorControl label={t("text")} value={theme.text} onChange={(value) => onChange({ ...theme, text: value })} />
              <ColorControl label={t("accent")} value={theme.accent} onChange={(value) => onChange({ ...theme, accent: value })} />
            </div>
          </section>

          <section className="settingsGroup">
            <div className="groupHeading">
              <h2>{t("readingComfort")}</h2>
              <span>{t("readerPreview")}</span>
            </div>
            <label className="rangeControl">
              <span>{t("readerWidth")}</span>
              <strong>{theme.readerWidth}px</strong>
              <input
                type="range"
                min="420"
                max="960"
                value={theme.readerWidth}
                onChange={(event) => onChange({ ...theme, readerWidth: Number(event.target.value) })}
              />
            </label>
            <label className="rangeControl">
              <span>{t("lineHeight")}</span>
              <strong>{theme.lineHeight}</strong>
              <input
                type="range"
                min="1.2"
                max="2.4"
                step="0.1"
                value={theme.lineHeight}
                onChange={(event) => onChange({ ...theme, lineHeight: Number(event.target.value) })}
              />
            </label>
            <label className="rangeControl">
              <span>{t("readerFontSize")}</span>
              <strong>{theme.readerFontSize}px</strong>
              <input
                type="range"
                min="13"
                max="22"
                value={theme.readerFontSize}
                onChange={(event) => onChange({ ...theme, readerFontSize: Number(event.target.value) })}
              />
            </label>
            <div
              className="readerSample"
              style={{ fontSize: theme.readerFontSize, maxWidth: theme.readerWidth, lineHeight: theme.lineHeight }}
            >
              <strong>{t("readerSampleTitle")}</strong>
              <p>{t("readerSampleText")}</p>
            </div>
          </section>

          <section className="settingsGroup">
            <div className="groupHeading">
              <h2>{t("homeLayout")}</h2>
              <span>{visibleLayoutCount} {t("layoutVisible")} / {hiddenLayoutCount} {t("layoutHidden")}</span>
            </div>
            <p className="groupDescription">{t("homeLayoutHint")}</p>
            <label className="toggleRow">
              <input
                type="checkbox"
                checked={theme.compactCards}
                onChange={(event) => onChange({ ...theme, compactCards: event.target.checked })}
              />
              <span>{t("compactCards")}</span>
            </label>
            <div className="layoutList">
              {dashboardLayouts.map((layout, index) => {
                const item = items.find((candidate) => candidate.id === layout.itemId);
                if (!item) {
                  return null;
                }

                return (
                  <div className={`layoutItem ${layout.hidden ? "muted" : ""}`} key={layout.itemId}>
                    <div className={`layoutMiniCard ${layout.size}`} style={{ borderColor: item.accent }}>
                      <span className="layoutOrder">{index + 1}</span>
                      <span className="layoutMiniIcon" style={{ color: item.accent }}>
                        {typeIcons[item.type]}
                      </span>
                      <span className="layoutMiniText">
                        <strong>{getItemTitle(item, t)}</strong>
                        <small>{getCollectionLabel(item.collection, t)}</small>
                      </span>
                      <span className="layoutBadges">
                        <b>{getSizeLabel(layout.size, t)}</b>
                        <b>{layout.hidden ? t("layoutHidden") : t("layoutVisible")}</b>
                      </span>
                    </div>
                    <div className="layoutActions">
                      <button type="button" disabled={index === 0} onClick={() => onMoveDashboardCard(layout.itemId, -1)} title={t("moveUp")}>
                        <ArrowUp size={15} />
                        {t("moveUp")}
                      </button>
                      <button
                        type="button"
                        disabled={index === dashboardLayouts.length - 1}
                        onClick={() => onMoveDashboardCard(layout.itemId, 1)}
                        title={t("moveDown")}
                      >
                        <ArrowDown size={15} />
                        {t("moveDown")}
                      </button>
                      <button type="button" onClick={() => onCycleDashboardCardSize(layout.itemId)} title={t("changeSize")}>
                        <Grid3X3 size={15} />
                        {t("changeSize")}
                      </button>
                      <button type="button" onClick={() => onToggleDashboardCardHidden(layout.itemId)} title={layout.hidden ? t("showCard") : t("hideCard")}>
                        {layout.hidden ? <Eye size={15} /> : <EyeOff size={15} />}
                        {layout.hidden ? t("showCard") : t("hideCard")}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </div>

        <aside className="customPreviewPane">
          <div className="groupHeading">
            <h2>{t("livePreview")}</h2>
            <span>{t("preview")}</span>
          </div>
          <div className="themePreview">
            <div className="previewSidebar">
              <div className="previewMark">S</div>
              <span>{t("navDashboard")}</span>
              <span>{t("navLibrary")}</span>
              <span>{t("navCollections")}</span>
            </div>
            <div className="previewMain">
              <div className="previewHero">
                <span>{t("heroEyebrow")}</span>
                <strong>{t("previewHeroTitle")}</strong>
              </div>
              {previewItem && (
                <div className={`previewCard ${theme.compactCards ? "compactPreviewCard" : ""}`}>
                  <div className="typeBadge" style={{ color: previewItem.accent }}>
                    {typeIcons[previewItem.type]}
                    {getCollectionLabel(previewItem.collection, t)}
                  </div>
                  <strong>{getItemTitle(previewItem, t)}</strong>
                  <p>{getItemSummary(previewItem, t)}</p>
                </div>
              )}
              <div
                className="previewReader"
                style={{ fontSize: theme.readerFontSize, maxWidth: theme.readerWidth / 2, lineHeight: theme.lineHeight }}
              >
                <strong>{t("readerSampleTitle")}</strong>
                <p>{t("readerSampleText")}</p>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
}

function SettingsPanel({
  appSettings,
  theme,
  language,
  itemCount,
  collectionCount,
  t,
  onAppSettingsChange,
  onThemeChange,
  onLanguageChange,
  onExportData,
}: {
  appSettings: AppSettings;
  theme: ThemeSettings;
  language: Language;
  itemCount: number;
  collectionCount: number;
  t: (key: MessageKey) => string;
  onAppSettingsChange: (settings: AppSettings) => void;
  onThemeChange: (theme: ThemeSettings) => void;
  onLanguageChange: (language: Language) => void;
  onExportData: () => void;
}) {
  return (
    <section className="settingsWorkspace">
      <div className="customizeHeader">
        <div>
          <span className="eyebrow">{t("settingsEyebrow")}</span>
          <h1>{t("settingsTitle")}</h1>
        </div>
      </div>

      <div className="settingsPageGrid">
        <section className="settingsGroup">
          <div className="groupHeading">
            <h2>{t("settingsGeneral")}</h2>
            <span>{t("savedLocalStorage")}</span>
          </div>
          <label className="controlRow">
            <span>{t("language")}</span>
            <select value={language} onChange={(event) => onLanguageChange(event.target.value as Language)}>
              {languageOptions.map((option) => (
                <option value={option.value} key={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </section>

        <section className="settingsGroup">
          <div className="groupHeading">
            <h2>{t("settingsOpening")}</h2>
            <span>{t("readerOpenMode")}</span>
          </div>
          <div className="segmentedControl" aria-label={t("readerOpenMode")}>
            {(["window", "embedded"] as ReaderOpenMode[]).map((mode) => (
              <button
                className={theme.readerOpenMode === mode ? "active" : ""}
                type="button"
                key={mode}
                onClick={() => onThemeChange({ ...theme, readerOpenMode: mode })}
              >
                {mode === "window" ? t("readerOpenWindow") : t("readerOpenEmbedded")}
              </button>
            ))}
          </div>
          <p className="groupDescription">{t("readerOpenModeHint")}</p>
        </section>

        <section className="settingsGroup">
          <div className="groupHeading">
            <h2>{t("settingsSearch")}</h2>
            <span>{t("searchContent")}</span>
          </div>
          <label className="toggleRow">
            <input
              type="checkbox"
              checked={appSettings.resetSearchOnNavigation}
              onChange={(event) => onAppSettingsChange({ ...appSettings, resetSearchOnNavigation: event.target.checked })}
            />
            <span>{t("resetSearchOnNavigation")}</span>
          </label>
          <label className="controlRow">
            <span>{t("searchEnterBehavior")}</span>
            <select
              value={appSettings.searchEnterBehavior}
              onChange={(event) =>
                onAppSettingsChange({ ...appSettings, searchEnterBehavior: event.target.value as SearchEnterBehavior })
              }
            >
              <option value="select">{t("searchEnterSelect")}</option>
              <option value="open">{t("searchEnterOpen")}</option>
            </select>
          </label>
        </section>

        <section className="settingsGroup">
          <div className="groupHeading">
            <h2>{t("settingsData")}</h2>
            <span>{itemCount} {t("items")} / {collectionCount} {t("groups")}</span>
          </div>
          <p className="groupDescription">{t("settingsDataHint")}</p>
          <button className="settingsActionButton" type="button" onClick={onExportData}>
            <Download size={16} />
            {t("exportData")}
          </button>
        </section>

        <section className="settingsGroup">
          <div className="groupHeading">
            <h2>{t("settingsAbout")}</h2>
            <span>MyPersonalShelf</span>
          </div>
          <div className="settingsInfoList">
            <span>{t("settingsStorage")}</span>
            <strong>{t("settingsStorageValue")}</strong>
            <span>{t("settingsAppMode")}</span>
            <strong>{t("settingsAppModeValue")}</strong>
          </div>
        </section>
      </div>
    </section>
  );
}

function GuidePanel({
  t,
  onAddContent,
  onOpenCustomize,
}: {
  t: (key: MessageKey) => string;
  onAddContent: () => void;
  onOpenCustomize: () => void;
}) {
  return (
    <section className="guideWorkspace">
      <div className="customizeHeader guideHero">
        <div>
          <span className="eyebrow">{t("guideEyebrow")}</span>
          <h1>{t("guideTitle")}</h1>
        </div>
        <div className="guideHeroActions">
          <button type="button" onClick={onAddContent}>
            <FilePlus2 size={17} />
            {t("addContent")}
          </button>
          <button type="button" onClick={onOpenCustomize}>
            <Paintbrush size={17} />
            {t("navCustomize")}
          </button>
        </div>
      </div>

      <section className="guideIntroPanel">
        <div className="guideIllustration">
          <div className="guideShelfCard"><BookOpen size={20} /> {t("guideVisualDocument")}</div>
          <div className="guideShelfCard"><Play size={20} /> {t("guideVisualMedia")}</div>
          <div className="guideShelfCard"><Link size={20} /> {t("guideVisualLink")}</div>
          <div className="guideShelfCard"><Tags size={20} /> {t("guideVisualTags")}</div>
        </div>
        <div>
          <h2>{t("guideWhatTitle")}</h2>
          <p>{t("guideWhatText")}</p>
        </div>
      </section>

      <section className="guideGrid">
        <GuideCard icon={<FilePlus2 size={20} />} title={t("guideAddTitle")} text={t("guideAddText")} />
        <GuideCard icon={<Library size={20} />} title={t("guideLibraryTitle")} text={t("guideLibraryText")} />
        <GuideCard icon={<MousePointerHint />} title={t("guideOpenTitle")} text={t("guideOpenText")} />
        <GuideCard icon={<Tags size={20} />} title={t("guideOrganizeTitle")} text={t("guideOrganizeText")} />
        <GuideCard icon={<Paintbrush size={20} />} title={t("guideCustomizeTitle")} text={t("guideCustomizeText")} />
        <GuideCard icon={<Settings2 size={20} />} title={t("guideSettingsTitle")} text={t("guideSettingsText")} />
      </section>
    </section>
  );
}

function GuideCard({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return (
    <article className="guideCard">
      <span>{icon}</span>
      <h2>{title}</h2>
      <p>{text}</p>
    </article>
  );
}

function MousePointerHint() {
  return (
    <span className="mousePointerHint" aria-hidden="true">
      <span />
    </span>
  );
}

function ColorControl({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="colorControl">
      <span>{label}</span>
      <input type="color" value={value} onChange={(event) => onChange(event.target.value)} />
      <strong>{value}</strong>
    </label>
  );
}

export default App;
