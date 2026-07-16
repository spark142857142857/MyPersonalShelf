import {
  ArrowDown,
  ArrowUp,
  BookOpen,
  ClipboardPaste,
  Download,
  Eye,
  EyeOff,
  ExternalLink,
  FilePlus2,
  FolderOpen,
  Grid3X3,
  GripVertical,
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
  Upload,
} from "lucide-react";
import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { appConfig } from "./lib/appConfig";
import {
  defaultAppSettings,
  normalizeAppSettings,
  renamePinnedCollection,
  togglePinnedCollection,
  togglePinnedTag,
  togglePinnedType,
} from "./lib/appSettings";
import { getMessage, languageOptions, type Language, type MessageKey } from "./lib/i18n";
import { AddContentModal, type AddMode, type DraftItem } from "./components/AddContentModal";
import { DocumentTextView } from "./components/DocumentTextView";
import { GuidePanel } from "./components/GuidePanel";
import { MediaViewerView } from "./components/MediaViewerView";
import { ReaderView } from "./components/ReaderView";
import { SettingsPanel } from "./components/SettingsPanel";
import { reorderDashboardLayouts } from "./lib/dashboardLayouts";
import { defaultTheme, normalizeThemeSettings } from "./lib/theme";
import {
  canPreviewMediaItem,
  getCollectionLabel,
  getEntryTypeLabel,
  getItemLocation,
  getItemSummary,
  getItemTextContent,
  getItemTitle,
  getLinkPlatformLabel,
  getSizeLabel,
  getSourceLabel,
  getTagLabel,
  getTypeLabel,
  textEncodingOptions,
} from "./lib/shelfDisplay";
import {
  closeCurrentNativeWindow,
  deleteNativeContentItem,
  destroyCurrentNativeWindow,
  isNativeRuntime,
  isNativeReaderWindowOpen,
  loadNativeMediaProgress,
  loadNativeReaderProgress,
  loadNativeAppState,
  nativeAssetUrl,
  onNativeCloseRequested,
  onNativeTextEncodingChanged,
  openNativeFolder,
  openNativePath,
  openNativeReaderWindow,
  openNativeUrl,
  readNativeTextFile,
  registerNativeContentPath,
  unregisterNativeContentPaths,
  saveNativeAppState,
  saveNativeMediaProgress,
  saveNativeReaderProgress,
  saveNativeTextEncoding,
  selectNativeFile,
  selectNativeFolder,
} from "./lib/native";
import { ItemOperationRegistry } from "./lib/itemOperations";
import { isExternalDocumentItem } from "./lib/documentOpen";
import { NativeShelfQueue } from "./lib/nativeShelfQueue";
import { getSafeExternalUrl } from "./lib/urlSafety";
import { isSearchFocusShortcut, parseSearchQuery } from "./lib/search";
import { browserItemStorageKey, prepareItemsForPersistence, saveBrowserItemProgress } from "./lib/persistence";
import { buildShelfItem, createShelfItemId, findDuplicate, findDuplicateGroups, mergeShelfItems } from "./lib/duplicates";
import { parseBookmarkFile } from "./lib/bookmarkImport";
import {
  extractUrlFromText,
  isEditableKeyboardTarget,
  isQuickCaptureShortcut,
  readDropCapture,
  titleFromUrl,
} from "./lib/quickCapture";
import { parseShelfExport, restoreShelfState, type ShelfRestoreMode } from "./lib/shelfImport";
import {
  buildLinkTags,
  detectLinkPlatform,
  faviconUrlFor,
  fetchLinkPreview,
  isPlaceholderLinkTitle,
  linkPlatformAccent,
  type LinkPlatform,
} from "./lib/linkMeta";
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
type NoticeLevel = "info" | "warning" | "danger";
const themeStorageKey = "mypersonalshelf.theme.v1";
const languageStorageKey = "mypersonalshelf.language.v1";
const dashboardStorageKey = "mypersonalshelf.dashboard.v1";
const collectionSettingsStorageKey = "mypersonalshelf.collectionSettings.v1";
const appSettingsStorageKey = "mypersonalshelf.appSettings.v1";
const maxUploadDocumentBytes = 10 * 1024 * 1024;
const maxManualTextBytes = 1024 * 1024;
const collectionIconOptions: CollectionIcon[] = ["grid", "book", "play", "music", "link", "folder", "tag"];

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

function readLocalStorageItem(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function loadBrowserShelf(): { items: ContentItem[]; loadFailed: boolean } {
  const raw = readLocalStorageItem(browserItemStorageKey);
  if (!raw) {
    return { items: [], loadFailed: false };
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return { items: [], loadFailed: true };
    }
    return {
      items: parsed.map((entry) => normalizeItem(entry as ContentItem)),
      loadFailed: false,
    };
  } catch {
    return { items: [], loadFailed: true };
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
  const raw = readLocalStorageItem(themeStorageKey);
  if (!raw) {
    return defaultTheme;
  }

  try {
    return normalizeThemeSettings(JSON.parse(raw) as Partial<ThemeSettings> & { compactCards?: boolean });
  } catch {
    return defaultTheme;
  }
}

function loadLanguage(): Language {
  const raw = readLocalStorageItem(languageStorageKey);
  return raw === "ko" ? "ko" : "en";
}

function loadDashboardLayouts(): DashboardLayoutItem[] {
  const raw = readLocalStorageItem(dashboardStorageKey);
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
  const raw = readLocalStorageItem(appSettingsStorageKey);
  if (!raw) {
    return defaultAppSettings;
  }

  try {
    return normalizeAppSettings(JSON.parse(raw) as Partial<AppSettings>);
  } catch {
    return defaultAppSettings;
  }
}

function loadCollectionSettings(): Record<string, CollectionSettings> {
  const raw = readLocalStorageItem(collectionSettingsStorageKey);
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


function isViewerContent(item: ContentItem) {
  return item.type === "document" || item.type === "video" || item.type === "audio" || item.type === "image";
}

function canOpenSeparateViewerWindow(item: ContentItem) {
  if (item.source === "upload") return false;
  if (isExternalDocumentItem(item)) return false;
  return item.type === "document" || ((item.type === "video" || item.type === "audio" || item.type === "image") && item.source === "path");
}

function createId() {
  return createShelfItemId();
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
  const [browserBoot] = useState(() => (isNativeRuntime() ? null : loadBrowserShelf()));
  const [items, setItems] = useState<ContentItem[]>(() => browserBoot?.items ?? []);
  const [theme, setTheme] = useState<ThemeSettings>(() => (nativeRuntime ? defaultTheme : loadTheme()));
  const [language, setLanguage] = useState<Language>(() => (nativeRuntime ? "en" : loadLanguage()));
  const [appSettings, setAppSettings] = useState<AppSettings>(() => (nativeRuntime ? defaultAppSettings : loadAppSettings()));
  const [collectionSettings, setCollectionSettings] = useState<Record<string, CollectionSettings>>(() =>
    nativeRuntime ? {} : loadCollectionSettings(),
  );
  const [dashboardLayouts, setDashboardLayouts] = useState<DashboardLayoutItem[]>(() =>
    nativeRuntime ? [] : normalizeDashboardLayouts(browserBoot?.items ?? [], loadDashboardLayouts()),
  );
  const [activeView, setActiveView] = useState<View>(readerItemIdFromUrl ? "reader" : "dashboard");
  const [selectedItemId, setSelectedItemId] = useState(readerItemIdFromUrl ?? items[0]?.id ?? "");
  const [query, setQuery] = useState("");
  const [activeType, setActiveType] = useState<ContentType | "all">("all");
  const [notice, setNotice] = useState("");
  const [noticeLevel, setNoticeLevel] = useState<NoticeLevel>("info");
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [addMode, setAddMode] = useState<AddMode>("manual");
  const [draft, setDraft] = useState<DraftItem>(initialDraft);
  const [storageReady, setStorageReady] = useState(false);
  const [storageLoadFailed, setStorageLoadFailed] = useState(() => Boolean(browserBoot?.loadFailed));
  const [closeError, setCloseError] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [registeredPathIds, setRegisteredPathIds] = useState<Set<string>>(() => new Set());
  const [unavailablePathIds, setUnavailablePathIds] = useState<Set<string>>(() => new Set());
  const [pathHealthFilter, setPathHealthFilter] = useState(false);
  const [pathScanInFlight, setPathScanInFlight] = useState(false);
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(() => new Set());
  const [bulkCollection, setBulkCollection] = useState("");
  const [bulkTags, setBulkTags] = useState("");
  const [editingCollection, setEditingCollection] = useState<string | null>(null);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [draggingDashboardItemId, setDraggingDashboardItemId] = useState<string | null>(null);
  const [dashboardDropTargetId, setDashboardDropTargetId] = useState<string | null>(null);
  const draggingDashboardItemIdRef = useRef<string | null>(null);
  const objectUrlsRef = useRef<Set<string>>(new Set());
  const bookmarkInputRef = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const nativeShelfQueueRef = useRef(new NativeShelfQueue());
  const addInFlightRef = useRef(false);
  const pathRegistrationInFlightRef = useRef<Map<string, Promise<ContentItem>>>(new Map());
  const itemOperationsRef = useRef(new ItemOperationRegistry());
  const linkEnrichEpochRef = useRef(0);
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
      setNoticeLevel("info");
    }
  }, [notice, t]);

  const showNotice = useCallback((message: string, level: NoticeLevel = "info") => {
    setNotice(message);
    setNoticeLevel(level);
  }, []);

  const focusInboxCleanup = useCallback(
    (baseNotice: string) => {
      setPathHealthFilter(false);
      setQuery("collection:Inbox");
      setActiveType("all");
      navigateToView("library");
      showNotice(`${baseNotice} ${t("inboxCleanupHint")}`);
    },
    [navigateToView, showNotice, t],
  );

  const enrichLinkItems = useCallback((linkItems: ContentItem[]) => {
    for (const item of linkItems) {
      if (item.type !== "link") continue;
      const epoch = linkEnrichEpochRef.current;
      const capturedLocation = item.location;
      const capturedAccent = item.accent;
      const capturedPreviewImage = item.previewImage;
      const capturedTagsKey = item.tags.join("\u0000");
      void (async () => {
        try {
          const preview = await fetchLinkPreview(item.location);
          if (epoch !== linkEnrichEpochRef.current) return;
          setItems((current) =>
            current.map((entry) => {
              if (
                entry.id !== item.id ||
                entry.type !== "link" ||
                entry.location !== capturedLocation
              ) {
                return entry;
              }

              const patch: Partial<ContentItem> = {};
              if (entry.tags.join("\u0000") === capturedTagsKey) {
                const nextTags = buildLinkTags(entry.tags, entry.location);
                if (nextTags.join("\u0000") !== entry.tags.join("\u0000")) {
                  patch.tags = nextTags;
                }
              }

              if (entry.accent === capturedAccent) {
                patch.accent = linkPlatformAccent(preview.platform);
              }

              if (!entry.previewImage || entry.previewImage === capturedPreviewImage) {
                if (preview.previewImage) {
                  patch.previewImage = preview.previewImage;
                } else {
                  const favicon = faviconUrlFor(entry.location);
                  if (favicon) patch.previewImage = favicon;
                }
              }

              if (preview.title && isPlaceholderLinkTitle(entry.title, entry.location)) {
                patch.title = preview.title;
              }

              if (Object.keys(patch).length === 0) return entry;
              return { ...entry, ...patch, updatedAt: new Date().toISOString() };
            }),
          );
        } catch {
          // Offline or blocked — keep local title/URL.
        }
      })();
    }
  }, []);

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
        setTheme(normalizeThemeSettings(state.theme ?? {}));
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

    if (nativeRuntime && nativeShelfQueueRef.current.getActiveDeletion()) {
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

    void nativeShelfQueueRef.current.enqueueSave(() => saveNativeAppState(state)).catch(() => {
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
          const activeDeletion = nativeShelfQueueRef.current.getActiveDeletion();
          const deletionSucceeded = activeDeletion
            ? await activeDeletion.promise
            : false;
          const latest = latestAppStateRef.current;
          const closingItems = activeDeletion && deletionSucceeded
            ? latest.items.filter((item) => item.id !== activeDeletion.itemId)
            : latest.items;
          const state = {
            items: prepareItemsForPersistence(closingItems),
            theme: latest.theme,
            language: latest.language,
            appSettings: latest.appSettings,
            dashboardLayouts: normalizeDashboardLayouts(closingItems, latest.dashboardLayouts),
            collectionSettings: latest.collectionSettings,
          };
          await nativeShelfQueueRef.current.enqueueSave(() => saveNativeAppState(state));
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
      if (
        isQuickCaptureShortcut(event) &&
        !isAddOpen &&
        !readerItemIdFromUrl &&
        !isEditableKeyboardTarget(event.target)
      ) {
        event.preventDefault();
        void addClipboardLink();
        return;
      }
      if (isSearchFocusShortcut(event, isAddOpen)) {
        event.preventDefault();
        searchInputRef.current?.focus();
        navigateToView("library");
      }
    }

    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [isAddOpen, navigateToView, readerItemIdFromUrl, t]);

  const selectedItem = items.find((item) => item.id === selectedItemId) ?? items[0];
  const ensureItemPathRegistered = useCallback(async (item: ContentItem): Promise<ContentItem> => {
    if (!nativeRuntime || item.source !== "path") {
      return item;
    }
    if (itemOperationsRef.current.isDeleting(item.id)) {
      throw new Error("This item is being removed.");
    }

    const key = `${item.id}\u0000${item.type}\u0000${item.location}`;
    const pending = pathRegistrationInFlightRef.current.get(key);
    if (pending) {
      return pending;
    }

    const operation = registerNativeContentPath(item.location, item.type, item.id)
      .then((normalizedLocation) => {
        if (normalizedLocation !== item.location) {
          updateItem(setItems, item.id, { location: normalizedLocation });
        }
        setRegisteredPathIds((current) => new Set(current).add(item.id));
        setUnavailablePathIds((current) => {
          if (!current.has(item.id)) return current;
          const next = new Set(current);
          next.delete(item.id);
          return next;
        });
        return normalizedLocation === item.location ? item : { ...item, location: normalizedLocation };
      })
      .catch((error) => {
        setRegisteredPathIds((current) => {
          const next = new Set(current);
          next.delete(item.id);
          return next;
        });
        setUnavailablePathIds((current) => new Set(current).add(item.id));
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
        showNotice(t("pathUnavailable"), "danger");
      });
    };

    registerSelectedPath();
    window.addEventListener("focus", registerSelectedPath);
    return () => window.removeEventListener("focus", registerSelectedPath);
  }, [activeView, ensureItemPathRegistered, nativeRuntime, readerItemIdFromUrl, selectedItem?.id, selectedItem?.location, selectedItem?.source, selectedItem?.type, showNotice, t]);

  const favoriteItems = items.filter((item) => item.isFavorite);
  const inboxItems = items.filter((item) => item.collection === "Inbox");
  const duplicateGroups = useMemo(() => findDuplicateGroups(items), [items]);
  const pinnedTypeShortcuts = appSettings.pinnedTypes;
  const pinnedCollectionShortcuts = appSettings.pinnedCollections;
  const pinnedTagShortcuts = appSettings.pinnedTags;
  const hasDashboardShortcuts =
    pinnedTypeShortcuts.length > 0 || pinnedCollectionShortcuts.length > 0 || pinnedTagShortcuts.length > 0;
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
      if (pathHealthFilter) {
        return item.source === "path" && unavailablePathIds.has(item.id);
      }
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
  }, [activeType, items, pathHealthFilter, query, t, unavailablePathIds]);

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
  const collectionNames = useMemo(() => {
    const names = new Set([
      ...Object.keys(groupedCollections),
      ...Object.keys(collectionSettings),
    ]);
    return [...names].sort((left, right) => left.localeCompare(right));
  }, [collectionSettings, groupedCollections]);
  const [newCollectionName, setNewCollectionName] = useState("");

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

    await nativeShelfQueueRef.current.awaitActiveDeletion();

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

    await nativeShelfQueueRef.current.enqueueSave(() => saveNativeAppState(state));
  }

  async function openItem(item: ContentItem) {
    const operations = itemOperationsRef.current;
    if (!operations.beginOpen(item.id)) {
      setNotice(t("itemDeleteInProgress"));
      return;
    }
    try {
      await performOpenItem(item);
    } finally {
      operations.endOpen(item.id);
    }
  }

  async function performOpenItem(item: ContentItem) {
    if (item.type === "link") {
      const safeExternalUrl = getSafeExternalUrl(item.location);
      if (!safeExternalUrl) {
        navigateToView("library", item.id);
        showNotice(t("invalidLink"), "warning");
        return;
      }

      setSelectedItemId(item.id);
      markItemOpened(item);
      openNativeUrl(safeExternalUrl).catch(() => {
        window.open(safeExternalUrl, "_blank", "noopener,noreferrer");
      });
      showNotice(`${getItemTitle(item, t)} ${t("selected")}`);
      return;
    }

    let targetItem = item;
    if (item.source === "path" && nativeRuntime) {
      try {
        targetItem = await ensureItemPathRegistered(item);
      } catch {
        navigateToView("library", item.id);
        showNotice(t("pathUnavailable"), "danger");
        return;
      }
    }

    if (targetItem.type === "folder" && targetItem.source === "path") {
      setSelectedItemId(targetItem.id);
      markItemOpened(targetItem);
      try {
        await openNativeFolder(targetItem.location, targetItem.id);
      } catch {
        setNotice(t("nativeUnavailable"));
        return;
      }
      setNotice(`${getItemTitle(targetItem, t)} ${t("selected")}`);
      return;
    }

    if (isExternalDocumentItem(targetItem)) {
      setSelectedItemId(targetItem.id);
      markItemOpened(targetItem);
      try {
        await openNativePath(targetItem.location, targetItem.id);
      } catch {
        setNotice(t("nativeUnavailable"));
        return;
      }
      setNotice(`${getItemTitle(targetItem, t)} ${t("openedExternally")}`);
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
        if (itemOperationsRef.current.isDeleting(targetItem.id)) return;
        await persistItemBeforeOpeningWindow(targetItem);
        if (itemOperationsRef.current.isDeleting(targetItem.id)) return;
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
    setPathHealthFilter(false);
    setQuery(`collection:${collection}`);
    setActiveType("all");
    navigateToView("library");
    showNotice(`${getCollectionLabel(collection, t)} ${t("collectionFiltered")}`);
  }

  function filterByTypePin(type: ContentType) {
    setPathHealthFilter(false);
    setQuery("");
    setActiveType(type);
    navigateToView("library");
    showNotice(`${getTypeLabel(type, t)} ${t("typeFiltered")}`);
  }

  function filterByTag(tag: string) {
    setPathHealthFilter(false);
    setQuery(`tag:${tag}`);
    setActiveType("all");
    navigateToView("library");
    showNotice(`#${getTagLabel(tag, t)} ${t("tagFiltered")}`);
  }

  function pinTypeToDashboard(type: ContentType) {
    const next = togglePinnedType(appSettings, type);
    const pinned = next.pinnedTypes.includes(type);
    setAppSettings(next);
    showNotice(`${getTypeLabel(type, t)} ${pinned ? t("typePinnedNotice") : t("typeUnpinnedNotice")}`);
  }

  function pinCollectionToDashboard(collection: string) {
    const next = togglePinnedCollection(appSettings, collection);
    const pinned = next.pinnedCollections.includes(collection);
    setAppSettings(next);
    showNotice(
      `${getCollectionLabel(collection, t)} ${pinned ? t("collectionPinnedNotice") : t("collectionUnpinnedNotice")}`,
    );
  }

  function pinTagToDashboard(tag: string) {
    const next = togglePinnedTag(appSettings, tag);
    const pinned = next.pinnedTags.includes(tag);
    setAppSettings(next);
    showNotice(`#${getTagLabel(tag, t)} ${pinned ? t("tagPinnedNotice") : t("tagUnpinnedNotice")}`);
  }

  async function filterBrokenPaths() {
    setQuery("");
    setActiveType("all");
    setPathHealthFilter(true);
    navigateToView("library");
    if (!nativeRuntime) {
      showNotice(t("nativeUnavailable"), "warning");
      return;
    }
    setPathScanInFlight(true);
    showNotice(t("brokenPathsScanning"));
    const pathItems = latestAppStateRef.current.items.filter((item) => item.source === "path");
    const broken = new Set<string>();
    try {
      for (const item of pathItems) {
        try {
          await ensureItemPathRegistered(item);
        } catch {
          broken.add(item.id);
        }
      }
      setUnavailablePathIds(broken);
      if (broken.size === 0) {
        showNotice(t("brokenPathsNone"));
      } else {
        showNotice(`${broken.size} ${t("brokenPathsFound")}`, "warning");
      }
    } finally {
      setPathScanInFlight(false);
    }
  }

  async function keepDuplicateItem(keepId: string, groupIds: string[]) {
    const removeIds = groupIds.filter((id) => id !== keepId);
    if (removeIds.length === 0) return;
    const confirmMessage = t("duplicatesConfirmKeep").replace("{count}", String(removeIds.length));
    if (!window.confirm(confirmMessage)) return;

    let removedCount = 0;
    for (const id of removeIds) {
      const operations = itemOperationsRef.current;
      if (!operations.beginDelete(id)) continue;

      const deletionOperation = nativeShelfQueueRef.current.runNativeDelete(id, {
        nativeRuntime,
        isReaderWindowOpen: isNativeReaderWindowOpen,
        deleteItem: deleteNativeContentItem,
      });

      try {
        if (!await deletionOperation) {
          showNotice(t("closeViewerBeforeDelete"), "warning");
          continue;
        }

        const latest = latestAppStateRef.current;
        const nextItems = latest.items.filter((item) => item.id !== id);
        latestAppStateRef.current = {
          ...latest,
          items: nextItems,
          dashboardLayouts: normalizeDashboardLayouts(nextItems, latest.dashboardLayouts),
        };
        setItems((current) => current.filter((item) => item.id !== id));
        setRegisteredPathIds((current) => {
          const next = new Set(current);
          next.delete(id);
          return next;
        });
        setUnavailablePathIds((current) => {
          if (!current.has(id)) return current;
          const next = new Set(current);
          next.delete(id);
          return next;
        });
        removedCount += 1;
      } catch {
        showNotice(t("pathPermissionReleaseFailed"), "danger");
      } finally {
        nativeShelfQueueRef.current.clearActiveDeletion();
        operations.endDelete(id);
      }
    }

    if (removedCount > 0) {
      showNotice(`${removedCount} ${t("duplicatesCleaned")}`);
    }
    navigateToView("library", keepId);
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
    const nameTaken =
      items.some((item) => item.collection === normalizedName) ||
      Boolean(collectionSettings[normalizedName]);
    if (nameTaken) {
      showNotice(t("collectionNameExists"), "warning");
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
    setAppSettings((current) => renamePinnedCollection(current, previousName, normalizedName));
    showNotice(`${getCollectionLabel(previousName, t)} -> ${normalizedName}`);
    return true;
  }

  function createCollection(rawName: string) {
    const normalizedName = rawName.trim();
    if (!normalizedName) {
      showNotice(t("collectionNameRequired"), "warning");
      return false;
    }
    const nameTaken =
      items.some((item) => item.collection === normalizedName) ||
      Boolean(collectionSettings[normalizedName]) ||
      Object.keys(groupedCollections).includes(normalizedName);
    if (nameTaken) {
      showNotice(t("collectionNameExists"), "warning");
      return false;
    }

    setCollectionSettings((current) => ({
      ...current,
      [normalizedName]: {
        color: "#263238",
        icon: defaultCollectionIcon(normalizedName),
      },
    }));
    setNewCollectionName("");
    setEditingCollection(normalizedName);
    showNotice(`${normalizedName} ${t("collectionCreated")}`);
    return true;
  }

  function deleteEmptyCollection(collection: string) {
    if ((groupedCollections[collection] ?? []).length > 0) {
      showNotice(t("collectionDeleteNotEmpty"), "warning");
      return;
    }
    setCollectionSettings((current) => {
      const next = { ...current };
      delete next[collection];
      return next;
    });
    setAppSettings((current) => ({
      ...current,
      pinnedCollections: current.pinnedCollections.filter((entry) => entry !== collection),
    }));
    if (editingCollection === collection) {
      setEditingCollection(null);
    }
    showNotice(`${getCollectionLabel(collection, t)} ${t("collectionDeleted")}`);
  }

  function navigatePrimaryView(nextView: View) {
    if (appSettings.resetSearchOnNavigation) {
      setQuery("");
      setActiveType("all");
    }
    setPathHealthFilter(false);
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
    const submittedDraft = { ...draft };
    const itemId = createId();
    try {
      let location = submittedDraft.location.trim() || "No location yet";
      if (submittedDraft.source === "url") {
        const safeUrl = getSafeExternalUrl(location);
        if (!safeUrl) {
          showNotice(t("invalidLink"), "warning");
          return;
        }
        location = safeUrl;
      }
      if (nativeRuntime && submittedDraft.source === "path") {
        location = await registerNativeContentPath(location, submittedDraft.type, itemId);
      }

      const manualTags = submittedDraft.tags
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean);
      const isLink = submittedDraft.type === "link" || submittedDraft.source === "url";
      const nextItem = buildShelfItem({
        id: itemId,
        title: submittedDraft.title.trim(),
        type: submittedDraft.type,
        source: submittedDraft.source,
        location,
        collection: submittedDraft.collection.trim() || "Inbox",
        tags: isLink ? buildLinkTags(manualTags, location) : manualTags,
        accent: isLink ? linkPlatformAccent(detectLinkPlatform(location)) : submittedDraft.accent,
        summary: submittedDraft.summary.trim(),
        textContent: submittedDraft.textContent.trim(),
        previewImage: isLink ? faviconUrlFor(location) ?? undefined : undefined,
      });

      commitShelfItems([nextItem], { closeModal: true });
      setDraft(initialDraft);
    } catch {
      showNotice(t("invalidLocalPath"), "danger");
    } finally {
      addInFlightRef.current = false;
      setIsAdding(false);
    }
  }

  function commitShelfItems(
    candidates: ContentItem[],
    options?: { closeModal?: boolean; successNotice?: string; focusInbox?: boolean },
  ) {
    let result = mergeShelfItems(latestAppStateRef.current.items, candidates);
    setItems((current) => {
      result = mergeShelfItems(current, candidates);
      return result.nextItems;
    });

    if (result.added.some((item) => item.source === "path")) {
      setRegisteredPathIds((current) => {
        const next = new Set(current);
        result.added.forEach((item) => {
          if (item.source === "path") next.add(item.id);
        });
        return next;
      });
    }

    if (options?.closeModal) {
      setIsAddOpen(false);
    }

    if (result.added.length === 0) {
      const duplicate = result.skippedDuplicates[0];
      if (duplicate) {
        navigateToView("library", duplicate.existing.id);
        showNotice(`${getItemTitle(duplicate.existing, t)} ${t("alreadyOnShelf")}`, "warning");
      }
      return result;
    }

    enrichLinkItems(result.added.filter((item) => item.type === "link"));

    let successMessage = options?.successNotice;
    if (!successMessage) {
      if (result.added.length === 1) {
        const warning =
          result.titleWarnings.length > 0 ? ` ${t("titleSimilarWarning")}` : "";
        successMessage = `${result.added[0].title} ${t("addedToShelf")}${warning}`;
      } else {
        const skipped =
          result.skippedDuplicates.length > 0
            ? ` ${result.skippedDuplicates.length} ${t("bookmarksSkipped")}`
            : "";
        successMessage = `${result.added.length} ${t("bookmarksImported")}${skipped}`;
      }
    }

    if (options?.focusInbox) {
      focusInboxCleanup(successMessage);
      if (result.added[0]) {
        setSelectedItemId(result.added[0].id);
      }
    } else {
      navigateToView("library", result.added[0].id);
      showNotice(successMessage);
    }
    return result;
  }

  function patchItems(ids: string[], patch: Partial<ContentItem> | ((item: ContentItem) => Partial<ContentItem>)) {
    const idSet = new Set(ids);
    const updatedAt = new Date().toISOString();
    setItems((current) =>
      current.map((item) => {
        if (!idSet.has(item.id)) return item;
        const nextPatch = typeof patch === "function" ? patch(item) : patch;
        return { ...item, ...nextPatch, updatedAt };
      }),
    );
  }

  function importFile(file: File) {
    void importFiles([file]);
  }

  async function importFiles(files: File[]) {
    if (files.length === 0) return;

    const candidates: ContentItem[] = [];
    for (const file of files) {
      if (getTypeFromFile(file) === "document" && file.size > maxUploadDocumentBytes) {
        setNotice(t("uploadDocumentTooLarge"));
        continue;
      }

      const type = getTypeFromFile(file);
      const baseFields = {
        title: file.name.replace(/\.[^/.]+$/, ""),
        type,
        source: "upload" as const,
        location: file.name,
        collection: "Inbox",
        tags: [type, "uploaded"],
        accent: type === "document" ? "#b7791f" : "#2563eb",
        summary: t("uploadPreviewSummary"),
        fileName: file.name,
      };

      if (type === "document") {
        const textContent = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
          reader.onerror = () => resolve("");
          reader.readAsText(file);
        });
        candidates.push(buildShelfItem({ ...baseFields, textContent }));
      } else {
        candidates.push(buildShelfItem({ ...baseFields, objectUrl: URL.createObjectURL(file) }));
      }
    }

    if (candidates.length === 0) return;
    commitShelfItems(candidates, {
      closeModal: true,
      successNotice:
        candidates.length === 1
          ? `${candidates[0].title} ${t("importedPreview")}`
          : `${candidates.length} ${t("addedToShelf")}`,
      focusInbox: true,
    });
  }

  async function addNativeFile() {
    if (addInFlightRef.current) return;
    addInFlightRef.current = true;
    setIsAdding(true);
    try {
      const selection = await selectNativeFile();
      if (!selection) {
        return;
      }

      const duplicate = findDuplicate(latestAppStateRef.current.items, {
        type: selection.contentType,
        source: "path",
        location: selection.path,
      });
      if (duplicate) {
        navigateToView("library", duplicate.id);
        setNotice(`${getItemTitle(duplicate, t)} ${t("alreadyOnShelf")}`);
        setIsAddOpen(false);
        return;
      }

      const itemId = createId();
      const location = await registerNativeContentPath(selection.path, selection.contentType, itemId);
      const nextItem = buildShelfItem({
        id: itemId,
        title: selection.title,
        type: selection.contentType,
        source: "path",
        location,
        fileName: selection.fileName,
        sizeBytes: selection.sizeBytes,
        modifiedAt: selection.modifiedAt,
        collection: selection.contentType === "document" ? "Reading" : "Media",
        tags: [selection.contentType, "local"],
        accent: selection.contentType === "document" ? "#b7791f" : "#2563eb",
        summary: selection.fileName ? t("localFileSummary") : t("localFilePathSummary"),
        textContent: selection.textContent,
      });

      commitShelfItems([nextItem], {
        closeModal: true,
        successNotice: `${nextItem.title} ${t("nativeFileAdded")}`,
      });
    } catch {
      setNotice(t("nativeUnavailable"));
    } finally {
      addInFlightRef.current = false;
      setIsAdding(false);
    }
  }

  async function addNativeFolder() {
    if (addInFlightRef.current) return;
    addInFlightRef.current = true;
    setIsAdding(true);
    try {
      const selection = await selectNativeFolder();
      if (!selection) {
        return;
      }

      const duplicate = findDuplicate(latestAppStateRef.current.items, {
        type: "folder",
        source: "path",
        location: selection.path,
      });
      if (duplicate) {
        navigateToView("library", duplicate.id);
        setNotice(`${getItemTitle(duplicate, t)} ${t("alreadyOnShelf")}`);
        setIsAddOpen(false);
        return;
      }

      const itemId = createId();
      const location = await registerNativeContentPath(selection.path, "folder", itemId);
      const nextItem = buildShelfItem({
        id: itemId,
        title: selection.title,
        type: "folder",
        source: "path",
        location,
        collection: "Folders",
        tags: ["folder", "local"],
        accent: "#059669",
        summary: `${selection.entries.length} ${t("localFolderSummary")}`,
        folderEntries: selection.entries,
      });

      commitShelfItems([nextItem], {
        closeModal: true,
        successNotice: `${nextItem.title} ${t("nativeFolderAdded")}`,
      });
    } catch {
      setNotice(t("nativeUnavailable"));
    } finally {
      addInFlightRef.current = false;
      setIsAdding(false);
    }
  }

  async function addClipboardLink() {
    try {
      const text = await navigator.clipboard.readText();
      const url = extractUrlFromText(text);
      if (!url) {
        showNotice(t("clipboardNoUrl"), "warning");
        return;
      }
      const platform = detectLinkPlatform(url);
      const nextItem = buildShelfItem({
        title: titleFromUrl(url),
        type: "link",
        source: "url",
        location: url,
        collection: "Inbox",
        tags: buildLinkTags([], url),
        accent: linkPlatformAccent(platform),
        previewImage: faviconUrlFor(url) ?? undefined,
      });
      commitShelfItems([nextItem], {
        successNotice: `${nextItem.title} ${t("quickAddSuccess")}`,
        focusInbox: true,
      });
    } catch {
      showNotice(t("clipboardReadFailed"), "warning");
    }
  }

  function handleShellDragOver(event: React.DragEvent<HTMLDivElement>) {
    if (readerItemIdFromUrl || isAddOpen) return;
    if (draggingDashboardItemIdRef.current) return;
    if ([...event.dataTransfer.types].includes("application/x-mypersonalshelf-card")) return;
    event.preventDefault();
    setIsDraggingOver(true);
  }

  function handleShellDragLeave(event: React.DragEvent<HTMLDivElement>) {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
    setIsDraggingOver(false);
  }

  function handleShellDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDraggingOver(false);
    if (readerItemIdFromUrl || isAddOpen) return;
    if (draggingDashboardItemIdRef.current) return;
    if ([...event.dataTransfer.types].includes("application/x-mypersonalshelf-card")) return;

    const capture = readDropCapture(event.dataTransfer);
    if (capture.kind === "url") {
      const platform = detectLinkPlatform(capture.url);
      const nextItem = buildShelfItem({
        title: titleFromUrl(capture.url),
        type: "link",
        source: "url",
        location: capture.url,
        collection: "Inbox",
        tags: buildLinkTags([], capture.url),
        accent: linkPlatformAccent(platform),
        previewImage: faviconUrlFor(capture.url) ?? undefined,
      });
      commitShelfItems([nextItem], {
        successNotice: `${nextItem.title} ${t("quickAddSuccess")}`,
        focusInbox: true,
      });
      return;
    }

    if (capture.kind === "files") {
      void importFiles(capture.files);
    }
  }

  async function relinkSelectedPath(item: ContentItem) {
    if (!nativeRuntime || item.source !== "path") {
      setNotice(t("nativeUnavailable"));
      return;
    }

    try {
      if (item.type === "folder") {
        const selection = await selectNativeFolder();
        if (!selection) return;
        const location = await registerNativeContentPath(selection.path, "folder", item.id);
        patchItems([item.id], {
          location,
          folderEntries: selection.entries,
          title: item.title || selection.title,
          summary: `${selection.entries.length} ${t("localFolderSummary")}`,
        });
      } else {
        const selection = await selectNativeFile();
        if (!selection) return;
        if (selection.contentType !== item.type) {
          setNotice(t("relinkFailed"));
          return;
        }
        const location = await registerNativeContentPath(selection.path, item.type, item.id);
        patchItems([item.id], {
          location,
          fileName: selection.fileName,
          sizeBytes: selection.sizeBytes,
          modifiedAt: selection.modifiedAt,
          textContent: selection.textContent,
        });
      }
      setRegisteredPathIds((current) => new Set(current).add(item.id));
      setNotice(t("relinkSuccess"));
    } catch {
      setNotice(t("relinkFailed"));
    }
  }

  async function importBookmarksFile(file: File) {
    try {
      const content = await file.text();
      const parsed = parseBookmarkFile(content, file.name);
      if (parsed.bookmarks.length === 0) {
        showNotice(t("bookmarksImportFailed"), "warning");
        return;
      }
      const confirmMessage = t("bookmarksImportConfirm").replace("{count}", String(parsed.bookmarks.length));
      if (!window.confirm(confirmMessage)) return;

      const candidates = parsed.bookmarks.map((bookmark) => {
        const platform = detectLinkPlatform(bookmark.url);
        return buildShelfItem({
          title: bookmark.title,
          type: "link",
          source: "url",
          location: bookmark.url,
          collection: bookmark.collection || "Inbox",
          tags: buildLinkTags(["imported"], bookmark.url),
          accent: linkPlatformAccent(platform),
          previewImage: faviconUrlFor(bookmark.url) ?? undefined,
        });
      });
      commitShelfItems(candidates, { closeModal: true, focusInbox: true });
    } catch {
      showNotice(t("bookmarksImportFailed"), "warning");
    }
  }

  function toggleItemSelection(itemId: string, selected: boolean) {
    setSelectedItemIds((current) => {
      const next = new Set(current);
      if (selected) next.add(itemId);
      else next.delete(itemId);
      return next;
    });
  }

  function selectAllVisibleItems() {
    setSelectedItemIds(new Set(filteredItems.map((item) => item.id)));
  }

  function clearItemSelection() {
    setSelectedItemIds(new Set());
    setBulkCollection("");
    setBulkTags("");
  }

  function applyBulkEdits() {
    const ids = [...selectedItemIds];
    if (ids.length === 0) return;
    const nextCollection = bulkCollection.trim();
    const nextTags = parseTagInput(bulkTags);
    if (!nextCollection && nextTags.length === 0) return;

    patchItems(ids, (item) => ({
      ...(nextCollection ? { collection: nextCollection } : {}),
      ...(nextTags.length > 0
        ? { tags: [...new Set([...item.tags, ...nextTags])] }
        : {}),
    }));
    clearItemSelection();
    setNotice(`${ids.length} ${t("selectedCount")}`);
  }

  async function restoreFromFile(file: File, mode: ShelfRestoreMode) {
    try {
      const raw = await file.text();
      const payload = parseShelfExport(raw);
      if (mode === "replace" && !window.confirm(t("restoreConfirmReplace"))) {
        return;
      }

      const current = latestAppStateRef.current;
      const restored = restoreShelfState(
        {
          items: current.items,
          theme: current.theme,
          language: current.language,
          dashboardLayouts: current.dashboardLayouts,
          collectionSettings: current.collectionSettings,
          appSettings: current.appSettings,
        },
        payload,
        mode,
      );

      const nextItems = restored.items.map((item) => normalizeItem(item));
      const nextTheme =
        mode === "replace" && restored.theme
          ? normalizeThemeSettings(restored.theme)
          : current.theme;
      const nextLanguage =
        mode === "replace" && restored.language ? restored.language : current.language;
      const nextAppSettings =
        mode === "replace" && restored.appSettings
          ? normalizeAppSettings(restored.appSettings)
          : current.appSettings;
      const nextDashboardLayouts =
        mode === "replace"
          ? normalizeDashboardLayouts(nextItems, restored.dashboardLayouts ?? [])
          : normalizeDashboardLayouts(nextItems, current.dashboardLayouts);
      const nextCollectionSettings =
        mode === "replace"
          ? normalizeCollectionSettings(restored.collectionSettings ?? {})
          : current.collectionSettings;

      linkEnrichEpochRef.current += 1;

      if (mode === "replace" && nativeRuntime) {
        const nextIds = new Set(nextItems.map((item) => item.id));
        const staleIds = new Set<string>();
        for (const id of registeredPathIds) {
          if (!nextIds.has(id)) staleIds.add(id);
        }
        for (const item of current.items) {
          if ((item.source === "path" || item.type === "folder") && !nextIds.has(item.id)) {
            staleIds.add(item.id);
          }
        }
        try {
          await unregisterNativeContentPaths([...staleIds]);
        } catch {
          // Best-effort ACL cleanup; shelf replace still proceeds.
        }
      }

      // Keep close/persist saves aligned before React re-renders.
      latestAppStateRef.current = {
        items: nextItems,
        theme: nextTheme,
        language: nextLanguage,
        appSettings: nextAppSettings,
        dashboardLayouts: nextDashboardLayouts,
        collectionSettings: nextCollectionSettings,
      };

      setItems(nextItems);
      setRegisteredPathIds(new Set());
      clearItemSelection();

      if (mode === "replace") {
        if (restored.theme) setTheme(nextTheme);
        if (restored.language) setLanguage(nextLanguage);
        if (restored.appSettings) setAppSettings(nextAppSettings);
        setDashboardLayouts(nextDashboardLayouts);
        setCollectionSettings(nextCollectionSettings);
      } else {
        setDashboardLayouts(nextDashboardLayouts);
      }

      setSelectedItemId(nextItems[0]?.id ?? "");
      setNotice(
        mode === "merge"
          ? `${t("restoreSuccess")} (+${restored.addedCount}, skip ${restored.skippedCount})`
          : t("restoreSuccess"),
      );
    } catch {
      setNotice(t("restoreFailed"));
    }
  }

  function updateSelectedItem(patch: Partial<ContentItem>) {
    if (!selectedItem) return;
    patchItems([selectedItem.id], patch);
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

  function reorderDashboardCard(activeItemId: string, overItemId: string) {
    setDashboardLayouts((current) =>
      reorderDashboardLayouts(normalizeDashboardLayouts(items, current), activeItemId, overItemId),
    );
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

  async function deleteSelectedItem() {
    if (!selectedItem) return;
    if (!window.confirm(t("deleteConfirm"))) return;
    const itemToDelete = selectedItem;
    const operations = itemOperationsRef.current;
    if (!operations.beginDelete(itemToDelete.id)) {
      setNotice(t("itemDeleteInProgress"));
      return;
    }
    const deletionOperation = nativeShelfQueueRef.current.runNativeDelete(itemToDelete.id, {
      nativeRuntime,
      isReaderWindowOpen: isNativeReaderWindowOpen,
      deleteItem: deleteNativeContentItem,
    });
    try {
      if (!await deletionOperation) {
        setItems((current) => [...current]);
        setNotice(t("closeViewerBeforeDelete"));
        return;
      }
      const latest = latestAppStateRef.current;
      const nextItems = latest.items.filter((item) => item.id !== itemToDelete.id);
      const nextSelectedItem = nextItems.find(
        (item) => item.id !== itemToDelete.id,
      );
      latestAppStateRef.current = {
        ...latest,
        items: nextItems,
        dashboardLayouts: normalizeDashboardLayouts(nextItems, latest.dashboardLayouts),
      };
      setRegisteredPathIds((current) => {
        const next = new Set(current);
        next.delete(itemToDelete.id);
        return next;
      });
      setItems((current) => current.filter((item) => item.id !== itemToDelete.id));
      navigateToView("library", nextSelectedItem?.id ?? "");
      setNotice(`${itemToDelete.title} ${t("removed")}`);
    } catch {
      setItems((current) => [...current]);
      setNotice(t("pathPermissionReleaseFailed"));
    } finally {
      nativeShelfQueueRef.current.clearActiveDeletion();
      operations.endDelete(itemToDelete.id);
    }
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
    <div
      className={`appShell density-${theme.dashboardCardDensity} ${isDraggingOver ? "dragOver" : ""}`}
      style={shellStyle}
      onDragOver={handleShellDragOver}
      onDragLeave={handleShellDragLeave}
      onDrop={handleShellDrop}
    >
      {isDraggingOver && <div className="dropOverlay" aria-hidden="true">{t("dropToAdd")}</div>}
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
            <button className="iconButton" type="button" aria-label={t("quickAddClipboard")} title={`${t("quickAddClipboard")} (Ctrl+Shift+V)`} onClick={() => void addClipboardLink()}>
              <ClipboardPaste size={18} />
            </button>
            <button className="iconButton" type="button" aria-label={t("exportData")} title={t("exportData")} onClick={exportData}>
              <Download size={18} />
            </button>
            <button className="iconButton" type="button" aria-label={t("openCustomize")} title={t("openCustomize")} onClick={() => navigatePrimaryView("customize")}>
              <Paintbrush size={18} />
            </button>
            <button className="primaryButton" type="button" onClick={() => setIsAddOpen(true)}>
              <FilePlus2 size={18} />
              {t("addContent")}
            </button>
          </div>
        </header>

        <section className={`statusStrip statusStrip--${noticeLevel}`} aria-live="polite">
          <span className="statusNotice">{notice}</span>
        </section>

        {activeView === "dashboard" && (
          <>
            {inboxItems.length > 0 && (
              <section className="cleanupBanner" aria-label={t("inboxCleanupAction")}>
                <p>{t("inboxPendingBanner").replace("{count}", String(inboxItems.length))}</p>
                <button type="button" onClick={() => focusInboxCleanup(t("inboxCleanupAction"))}>
                  {t("inboxCleanupAction")}
                </button>
              </section>
            )}

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

            {hasDashboardShortcuts && (
              <section className="dashboardShortcutGrid" aria-label={t("dashboardShortcutsTitle")}>
                <div className="dashboardSectionHeading">
                  <div>
                    <span className="eyebrow">{t("dashboardShortcutsTitle")}</span>
                    <h2>{t("dashboardShortcutsTitle")}</h2>
                  </div>
                  <p>{t("dashboardShortcutsHint")}</p>
                </div>
                <div className="shortcutCardRow">
                  {pinnedTypeShortcuts.map((type) => {
                    const count = items.filter((item) => item.type === type).length;
                    return (
                      <div className="shortcutCard" key={`type:${type}`}>
                        <button type="button" className="shortcutCardMain" onClick={() => filterByTypePin(type)}>
                          <span className="shortcutCardIcon" style={{ color: "var(--app-accent)" }}>
                            {typeIcons[type]}
                          </span>
                          <strong>{getTypeLabel(type, t)}</strong>
                          <span>{count} {count === 1 ? t("itemSingular") : t("itemPlural")}</span>
                        </button>
                        <button
                          type="button"
                          className="shortcutCardUnpin"
                          aria-label={t("unpinType")}
                          title={t("unpinType")}
                          onClick={() => pinTypeToDashboard(type)}
                        >
                          <Star size={14} fill="currentColor" />
                        </button>
                      </div>
                    );
                  })}
                  {pinnedCollectionShortcuts.map((collection) => {
                    const settings = getCollectionSettings(collection, collectionSettings, items);
                    const count = items.filter((item) => item.collection === collection).length;
                    return (
                      <div className="shortcutCard" key={`collection:${collection}`} style={{ borderColor: settings.color }}>
                        <button type="button" className="shortcutCardMain" onClick={() => filterByCollection(collection)}>
                          <span className="shortcutCardIcon" style={{ color: settings.color }}>
                            {collectionIcons[settings.icon]}
                          </span>
                          <strong>{getCollectionLabel(collection, t)}</strong>
                          <span>{count} {count === 1 ? t("itemSingular") : t("itemPlural")}</span>
                        </button>
                        <button
                          type="button"
                          className="shortcutCardUnpin"
                          aria-label={t("unpinCollection")}
                          title={t("unpinCollection")}
                          onClick={() => pinCollectionToDashboard(collection)}
                        >
                          <Star size={14} fill="currentColor" />
                        </button>
                      </div>
                    );
                  })}
                  {pinnedTagShortcuts.map((tag) => {
                    const count = items.filter((item) => item.tags.includes(tag)).length;
                    return (
                      <div className="shortcutCard" key={`tag:${tag}`}>
                        <button type="button" className="shortcutCardMain" onClick={() => filterByTag(tag)}>
                          <span className="shortcutCardIcon" style={{ color: "var(--app-accent)" }}>
                            <Tags size={16} />
                          </span>
                          <strong>#{getTagLabel(tag, t)}</strong>
                          <span>{count} {count === 1 ? t("itemSingular") : t("itemPlural")}</span>
                        </button>
                        <button
                          type="button"
                          className="shortcutCardUnpin"
                          aria-label={t("unpinTag")}
                          title={t("unpinTag")}
                          onClick={() => pinTagToDashboard(tag)}
                        >
                          <Star size={14} fill="currentColor" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

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
                    reorderable
                    dragging={draggingDashboardItemId === item.id}
                    dropTarget={dashboardDropTargetId === item.id && draggingDashboardItemId !== item.id}
                    onSelect={() => selectItem(item)}
                    onFilterTag={filterByTag}
                    onToggleFavorite={() => updateItem(setItems, item.id, { isFavorite: !item.isFavorite })}
                    onReorderStart={(itemId) => {
                      draggingDashboardItemIdRef.current = itemId;
                      setDraggingDashboardItemId(itemId);
                      setDashboardDropTargetId(null);
                    }}
                    onReorderHover={(overItemId) => {
                      const activeId = draggingDashboardItemIdRef.current;
                      if (activeId && overItemId && activeId !== overItemId) {
                        setDashboardDropTargetId(overItemId);
                      }
                    }}
                    onReorderEnd={(activeItemId, overItemId) => {
                      if (overItemId && activeItemId !== overItemId) {
                        reorderDashboardCard(activeItemId, overItemId);
                      }
                      draggingDashboardItemIdRef.current = null;
                      setDraggingDashboardItemId(null);
                      setDashboardDropTargetId(null);
                    }}
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
                  <button
                    className={activeType === "all" && !pathHealthFilter ? "active" : ""}
                    type="button"
                    onClick={() => {
                      setPathHealthFilter(false);
                      setActiveType("all");
                    }}
                  >
                    {t("all")}
                  </button>
                  {contentTypes.map((type) => {
                    const pinned = appSettings.pinnedTypes.includes(type);
                    return (
                      <div className="filterChipGroup" key={type}>
                        <button
                          className={activeType === type && !pathHealthFilter ? "active" : ""}
                          type="button"
                          onClick={() => {
                            setPathHealthFilter(false);
                            setActiveType(type);
                          }}
                        >
                          {getTypeLabel(type, t)}
                        </button>
                        <button
                          className={`pinChipButton ${pinned ? "pinned" : ""}`}
                          type="button"
                          aria-pressed={pinned}
                          aria-label={pinned ? t("unpinType") : t("pinType")}
                          title={pinned ? t("unpinType") : t("pinType")}
                          onClick={() => pinTypeToDashboard(type)}
                        >
                          <Star size={13} fill={pinned ? "currentColor" : "none"} />
                        </button>
                      </div>
                    );
                  })}
                  {nativeRuntime && (
                    <button
                      className={pathHealthFilter ? "active" : ""}
                      type="button"
                      title={t("brokenPathsHint")}
                      disabled={pathScanInFlight}
                      onClick={() => void filterBrokenPaths()}
                    >
                      {t("brokenPathsFilter")}
                      {unavailablePathIds.size > 0 ? ` (${unavailablePathIds.size})` : ""}
                    </button>
                  )}
                </div>
                {inboxItems.length > 0 && !pathHealthFilter && query !== "collection:Inbox" && (
                  <div className="cleanupBanner compactCleanupBanner">
                    <p>{t("inboxPendingBanner").replace("{count}", String(inboxItems.length))}</p>
                    <button type="button" onClick={() => focusInboxCleanup(t("inboxCleanupAction"))}>
                      {t("inboxCleanupAction")}
                    </button>
                  </div>
                )}
                {selectedItemIds.size > 0 && (
                  <div className="bulkBar">
                    <span className="bulkCount">{selectedItemIds.size} {t("selectedCount")}</span>
                    <input
                      list="collection-options"
                      placeholder={t("bulkCollection")}
                      value={bulkCollection}
                      onChange={(event) => setBulkCollection(event.target.value)}
                    />
                    <input
                      placeholder={t("bulkAddTags")}
                      value={bulkTags}
                      onChange={(event) => setBulkTags(event.target.value)}
                    />
                    <button className="primaryButton" type="button" onClick={applyBulkEdits}>{t("applyBulk")}</button>
                    <button type="button" onClick={clearItemSelection}>{t("clearSelection")}</button>
                  </div>
                )}
                {filteredItems.length > 0 && selectedItemIds.size === 0 && (
                  <div className="bulkBar bulkBarIdle">
                    <button type="button" onClick={selectAllVisibleItems}>{t("selectAllVisible")}</button>
                  </div>
                )}
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
                      <div className={`listItemRow ${selectedItemId === item.id ? "selected" : ""}`} key={item.id}>
                        <input
                          type="checkbox"
                          checked={selectedItemIds.has(item.id)}
                          aria-label={getItemTitle(item, t)}
                          onChange={(event) => toggleItemSelection(item.id, event.target.checked)}
                        />
                        <button
                          className={`listItem ${selectedItemId === item.id ? "selected" : ""}`}
                          type="button"
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
                            {item.type === "link" && item.previewImage ? (
                              <img className="listFavicon" src={item.previewImage} alt="" />
                            ) : (
                              typeIcons[item.type]
                            )}
                          </span>
                          <span>
                            <strong>{getItemTitle(item, t)}</strong>
                            <small>
                              {item.type === "link"
                                ? `${getLinkPlatformLabel(detectLinkPlatform(item.location), t)} · ${getCollectionLabel(item.collection, t)}`
                                : `${getCollectionLabel(item.collection, t)} / ${getItemLocation(item, t)}`}
                            </small>
                          </span>
                        </button>
                      </div>
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
                onRelink={selectedItem.source === "path" && nativeRuntime ? () => void relinkSelectedPath(selectedItem) : undefined}
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
                <span>{collectionNames.length} {t("groups")}</span>
                <span>{items.length} {t("items")}</span>
              </div>
            </section>
            <section className="libraryPanel">
              <div className="sectionTitle">
                <h2>{t("navCollections")}</h2>
                <span>{t("clickCollection")}</span>
              </div>
              <form
                className="createCollectionRow"
                onSubmit={(event) => {
                  event.preventDefault();
                  createCollection(newCollectionName);
                }}
              >
                <input
                  value={newCollectionName}
                  onChange={(event) => setNewCollectionName(event.target.value)}
                  placeholder={t("createCollectionPlaceholder")}
                  aria-label={t("createCollection")}
                />
                <button className="primaryButton" type="submit">
                  {t("createCollection")}
                </button>
              </form>
              <p className="collectionCreateHint">{t("createCollectionHint")}</p>
              <div className="collectionGrid">
                {collectionNames.map((collection) => {
                  const collectionItems = groupedCollections[collection] ?? [];
                  const settings = getCollectionSettings(collection, collectionSettings, items);
                  const isEditing = editingCollection === collection;
                  const collectionPinned = appSettings.pinnedCollections.includes(collection);
                  const isEmpty = collectionItems.length === 0;
                  return (
                    <article className={`collectionCard ${isEditing ? "collectionEditorCard isEditing" : "collectionEditorCard"} ${isEmpty ? "emptyCollectionCard" : ""}`} key={collection} style={{ borderColor: settings.color }}>
                      <button className="collectionOpenButton" type="button" onClick={() => filterByCollection(collection)}>
                        <span className="collectionIcon" style={{ color: settings.color }}>
                          {collectionIcons[settings.icon]}
                        </span>
                        <strong>{getCollectionLabel(collection, t)}</strong>
                        <span>{collectionItems.length} {collectionItems.length === 1 ? t("itemSingular") : t("itemPlural")}</span>
                        <small>
                          {isEmpty
                            ? t("emptyCollectionHint")
                            : collectionItems.map((item) => getTypeLabel(item.type, t)).join(", ")}
                        </small>
                      </button>
                      <div className="collectionCardActions">
                        <button
                          className={`pinChipButton ${collectionPinned ? "pinned" : ""}`}
                          type="button"
                          aria-pressed={collectionPinned}
                          aria-label={collectionPinned ? t("unpinCollection") : t("pinCollection")}
                          title={collectionPinned ? t("unpinCollection") : t("pinCollection")}
                          onClick={() => pinCollectionToDashboard(collection)}
                        >
                          <Star size={14} fill={collectionPinned ? "currentColor" : "none"} />
                        </button>
                        <button
                          className="collectionEditToggle"
                          type="button"
                          onClick={() => setEditingCollection(isEditing ? null : collection)}
                        >
                          {isEditing ? t("doneEditingCollection") : t("editCollection")}
                        </button>
                        {isEmpty && (
                          <button
                            className="collectionEditToggle"
                            type="button"
                            onClick={() => deleteEmptyCollection(collection)}
                          >
                            {t("deleteEmptyCollection")}
                          </button>
                        )}
                      </div>
                      {isEditing && (
                        <div className="collectionEditGrid">
                          <label>
                            {t("collectionName")}
                            <input
                              defaultValue={collection}
                              onBlur={(event) => {
                                if (!renameCollection(collection, event.currentTarget.value)) {
                                  event.currentTarget.value = collection;
                                } else {
                                  setEditingCollection(event.currentTarget.value.trim() || collection);
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
                      )}
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
                  .map(([tag, tagItems]) => {
                    const tagPinned = appSettings.pinnedTags.includes(tag);
                    return (
                      <div className="tagCloudItem" key={tag}>
                        <button type="button" onClick={() => filterByTag(tag)}>
                          <strong>#{getTagLabel(tag, t)}</strong>
                          <span>{tagItems.length} {tagItems.length === 1 ? t("itemSingular") : t("itemPlural")}</span>
                        </button>
                        <button
                          className={`pinChipButton ${tagPinned ? "pinned" : ""}`}
                          type="button"
                          aria-pressed={tagPinned}
                          aria-label={tagPinned ? t("unpinTag") : t("pinTag")}
                          title={tagPinned ? t("unpinTag") : t("pinTag")}
                          onClick={() => pinTagToDashboard(tag)}
                        >
                          <Star size={13} fill={tagPinned ? "currentColor" : "none"} />
                        </button>
                      </div>
                    );
                  })}
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
            duplicateGroups={duplicateGroups}
            t={t}
            onAppSettingsChange={setAppSettings}
            onThemeChange={setTheme}
            onLanguageChange={setLanguage}
            onExportData={exportData}
            onRestoreFile={(file, mode) => void restoreFromFile(file, mode)}
            onOpenDuplicate={(itemId) => navigateToView("library", itemId)}
            onKeepDuplicate={(keepId, groupIds) => void keepDuplicateItem(keepId, groupIds)}
          />
        )}

        {activeView === "guide" && (
          <GuidePanel t={t} onAddContent={() => setIsAddOpen(true)} onOpenCustomize={() => navigatePrimaryView("customize")} />
        )}
      </main>

      <input
        ref={bookmarkInputRef}
        type="file"
        accept=".html,.htm,.json,text/html,application/json"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) void importBookmarksFile(file);
        }}
      />

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
          onImportBookmarks={() => bookmarkInputRef.current?.click()}
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


function findDashboardCardIdAtPoint(clientX: number, clientY: number, excludeId?: string) {
  const cards = document.querySelectorAll<HTMLElement>("[data-dashboard-card-id]");
  for (const card of cards) {
    const itemId = card.dataset.dashboardCardId;
    if (!itemId || itemId === excludeId) continue;
    const rect = card.getBoundingClientRect();
    if (
      clientX >= rect.left &&
      clientX <= rect.right &&
      clientY >= rect.top &&
      clientY <= rect.bottom
    ) {
      return itemId;
    }
  }
  return null;
}

function ShelfCard({
  item,
  t,
  selected,
  variant,
  reorderable = false,
  dragging = false,
  dropTarget = false,
  onSelect,
  onOpen,
  onFilterTag,
  onToggleFavorite,
  onReorderStart,
  onReorderHover,
  onReorderEnd,
}: {
  item: ContentItem;
  t: (key: MessageKey) => string;
  selected: boolean;
  variant: "standard" | "wide" | "tall";
  reorderable?: boolean;
  dragging?: boolean;
  dropTarget?: boolean;
  onSelect: () => void;
  onOpen?: () => void;
  onFilterTag: (tag: string) => void;
  onToggleFavorite: () => void;
  onReorderStart?: (itemId: string) => void;
  onReorderHover?: (overItemId: string) => void;
  onReorderEnd?: (activeItemId: string, overItemId: string | null) => void;
}) {
  const pointerIdRef = useRef<number | null>(null);
  const dragOriginRef = useRef<{ x: number; y: number } | null>(null);
  const reorderActiveRef = useRef(false);

  function handleCardKeyDown(event: React.KeyboardEvent<HTMLElement>) {
    if (onOpen && (event.ctrlKey || event.metaKey) && event.key === "Enter") {
      event.preventDefault();
      onOpen();
      return;
    }

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelect();
    }
  }

  function finishPointerReorder(clientX: number, clientY: number) {
    if (!reorderActiveRef.current) {
      pointerIdRef.current = null;
      dragOriginRef.current = null;
      return;
    }
    const overItemId = findDashboardCardIdAtPoint(clientX, clientY, item.id);
    onReorderEnd?.(item.id, overItemId);
    reorderActiveRef.current = false;
    pointerIdRef.current = null;
    dragOriginRef.current = null;
  }

  const platform = item.type === "link" ? detectLinkPlatform(item.location) : null;
  const previewSrc =
    item.previewImage ?? (item.type === "link" ? faviconUrlFor(item.location) : null);
  const platformClass =
    platform === "youtube-music" ? "ytMusicCard" : platform === "youtube" ? "youtubeCard" : "";

  return (
    <article
      className={`contentCard ${variant} ${selected ? "selected" : ""} ${dragging ? "dragging" : ""} ${dropTarget ? "dropTarget" : ""} ${platformClass}`.trim()}
      data-dashboard-card-id={reorderable ? item.id : undefined}
    >
      <button
        className="cardHitArea"
        type="button"
        aria-pressed={selected}
        onClick={onSelect}
        onDoubleClick={onOpen ? () => onOpen() : undefined}
        onKeyDown={handleCardKeyDown}
      >
        {previewSrc && (
          <div className="cardMedia" aria-hidden="true">
            <img src={previewSrc} alt="" />
          </div>
        )}
        <div className="cardHeader">
          <div className="typeBadge" style={{ color: item.accent }}>
            {platform === "youtube-music" ? <Music2 size={16} /> : typeIcons[item.type]}
            {platform ? getLinkPlatformLabel(platform, t) : getCollectionLabel(item.collection, t)}
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
      {reorderable && (
        <span
          className="cardDragHandle"
          role="button"
          tabIndex={0}
          aria-label={t("dragToReorder")}
          title={t("dragToReorder")}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
            }
          }}
          onPointerDown={(event) => {
            if (event.button !== 0) return;
            event.preventDefault();
            event.stopPropagation();
            pointerIdRef.current = event.pointerId;
            dragOriginRef.current = { x: event.clientX, y: event.clientY };
            reorderActiveRef.current = false;
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            if (pointerIdRef.current !== event.pointerId || !dragOriginRef.current) return;
            const origin = dragOriginRef.current;
            const distance = Math.hypot(event.clientX - origin.x, event.clientY - origin.y);
            if (!reorderActiveRef.current) {
              if (distance < 5) return;
              reorderActiveRef.current = true;
              onReorderStart?.(item.id);
            }
            const overItemId = findDashboardCardIdAtPoint(event.clientX, event.clientY, item.id);
            if (overItemId) {
              onReorderHover?.(overItemId);
            }
          }}
          onPointerUp={(event) => {
            if (pointerIdRef.current !== event.pointerId) return;
            try {
              event.currentTarget.releasePointerCapture(event.pointerId);
            } catch {
              // Pointer may already be released.
            }
            finishPointerReorder(event.clientX, event.clientY);
          }}
          onPointerCancel={(event) => {
            if (pointerIdRef.current !== event.pointerId) return;
            if (reorderActiveRef.current) {
              onReorderEnd?.(item.id, null);
            }
            reorderActiveRef.current = false;
            pointerIdRef.current = null;
            dragOriginRef.current = null;
          }}
        >
          <GripVertical size={16} />
        </span>
      )}
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
  onRelink,
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
  onRelink?: () => void;
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
            {isExternalDocumentItem(item) ? (
              <>
                <ExternalLink size={16} />
                {t("openExternal")}
              </>
            ) : item.type === "document" ? (
              <>
                <BookOpen size={16} />
                {t("openReader")}
              </>
            ) : (
              <>
                {typeIcons[item.type]}
                {t("open")}
              </>
            )}
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
        {onRelink && (
          <button type="button" onClick={onRelink}>
            <FolderOpen size={16} />
            {t("relinkPath")}
          </button>
        )}
        <button className="dangerButton" type="button" onClick={onDelete}>
          <Trash2 size={16} />
          {t("delete")}
        </button>
      </div>

      {item.source === "path" && !pathReady && (
        <p className="pathBrokenBanner" role="alert">
          <strong>{t("pathBrokenBanner")}</strong>
          <span>{t("relinkHint")}</span>
        </p>
      )}

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
        <small className="previewLocation">{getItemLocation(item, t)}</small>
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
    </div>
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
  const previewUrl = item.objectUrl ?? (canUseAssetPath ? nativeAssetUrl(item.id) || undefined : undefined);
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
    if (isExternalDocumentItem(item)) {
      return (
        <div>
          <p className="groupDescription">{t("externalDocumentHint")}</p>
        </div>
      );
    }

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
    const platform = detectLinkPlatform(item.location);
    const previewSrc = item.previewImage ?? faviconUrlFor(item.location);
    return (
      <div className={`linkPreviewBody ${platform === "youtube" || platform === "youtube-music" ? "linkPreviewMedia" : ""}`}>
        {previewSrc && <img className="linkPreviewThumb" src={previewSrc} alt="" />}
        <div>
          <p className="linkPlatformLabel">{getLinkPlatformLabel(platform, t)}</p>
          <p className="linkPreviewUrl">{item.location}</p>
        </div>
      </div>
    );
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
            <div className="controlRow">
              <span>{t("dashboardCardDensity")}</span>
              <div className="segmentedControl densityControl" aria-label={t("dashboardCardDensity")}>
                {(
                  [
                    ["large", "densityLarge"],
                    ["normal", "densityNormal"],
                    ["small", "densitySmall"],
                  ] as const
                ).map(([value, labelKey]) => (
                  <button
                    className={theme.dashboardCardDensity === value ? "active" : ""}
                    type="button"
                    key={value}
                    onClick={() => onChange({ ...theme, dashboardCardDensity: value })}
                  >
                    {t(labelKey)}
                  </button>
                ))}
              </div>
            </div>
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
    </section>
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
