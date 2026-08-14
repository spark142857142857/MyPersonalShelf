import {
  ClipboardPaste,
  Download,
  FilePlus2,
  Grid3X3,
  HelpCircle,
  Library,
  Paintbrush,
  Search,
  Settings2,
  Tags,
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
import { formatCount, getMessage, type Language, type MessageKey } from "./lib/i18n";
import { AddContentModal, type AddMode, type DraftItem } from "./components/AddContentModal";
import { GuidePanel } from "./components/GuidePanel";
import { MediaViewerView } from "./components/MediaViewerView";
import { ReaderView } from "./components/ReaderView";
import { SettingsPanel } from "./components/SettingsPanel";
import { SidebarShortcuts } from "./components/SidebarShortcuts";
import { reorderDashboardLayouts } from "./lib/dashboardLayouts";
import { defaultTheme, normalizeThemeSettings } from "./lib/theme";
import { onAccentColor } from "./lib/themePresets";
import {
  getCollectionLabel,
  getItemLocation,
  getItemSummary,
  getItemTitle,
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
  loadNativeAppState,
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
  selectNativeFile,
  selectNativeFolder,
} from "./lib/native";
import { runWithConcurrency } from "./lib/concurrency";
import {
  canOpenSeparateViewerWindow,
  getTypeFromFile,
  isViewerContent,
  normalizeDashboardLayouts,
  parseTagInput,
} from "./lib/shelfItems";
import {
  defaultCollectionIcon,
  getCollectionSettings,
  normalizeCollectionSettings,
} from "./lib/collections";
import { CollectionsView } from "./components/CollectionsView";
import { CustomizePanel } from "./components/CustomizePanel";
import { DashboardView } from "./components/DashboardView";
import { DetailPanel } from "./components/DetailPanel";
import { LibraryView } from "./components/LibraryView";
import { ItemOperationRegistry } from "./lib/itemOperations";
import { isExternalDocumentItem } from "./lib/documentOpen";
import { NativeShelfQueue } from "./lib/nativeShelfQueue";
import { getSafeExternalUrl } from "./lib/urlSafety";
import { isSearchFocusShortcut, parseSearchQuery } from "./lib/search";
import { browserItemStorageKey, prepareItemsForPersistence } from "./lib/persistence";
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
  setRemoteLinkMetadataAllowed,
} from "./lib/linkMeta";
import type {
  AppSettings,
  ContentItem,
  CollectionSettings,
  ContentType,
  DashboardCardSize,
  DashboardLayoutItem,
  ThemeSettings,
} from "./types";

type View = "dashboard" | "library" | "collections" | "customize" | "settings" | "guide" | "reader";
type NoticeLevel = "info" | "warning" | "danger";
const themeStorageKey = "mypersonalshelf.theme.v1";
const languageStorageKey = "mypersonalshelf.language.v1";
const dashboardStorageKey = "mypersonalshelf.dashboard.v1";
const collectionSettingsStorageKey = "mypersonalshelf.collectionSettings.v1";
const appSettingsStorageKey = "mypersonalshelf.appSettings.v1";
const shelfSaveDebounceMs = 400;
// A bookmark import can add hundreds of links at once; this caps how many
// preview lookups are in flight at a time.
const linkPreviewConcurrency = 4;
const maxUploadDocumentBytes = 10 * 1024 * 1024;
const maxManualTextBytes = 1024 * 1024;

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
  const pendingShelfSaveRef = useRef<{ flush: () => void; cancel: () => void } | null>(null);
  const activeViewRef = useRef(activeView);
  activeViewRef.current = activeView;
  const latestAppStateRef = useRef({ items, theme, language, appSettings, dashboardLayouts, collectionSettings });
  latestAppStateRef.current = { items, theme, language, appSettings, dashboardLayouts, collectionSettings };
  // Applied during render, not in an effect: cards read favicon URLs while
  // rendering, so the switch has to be current before the first paint.
  setRemoteLinkMetadataAllowed(appSettings.fetchLinkPreviews);

  const t = useCallback((key: MessageKey) => getMessage(language, key), [language]);
  const tCount = useCallback(
    (count: number, key: MessageKey) => formatCount(language, count, key),
    [language],
  );
  const tRef = useRef(t);
  tRef.current = t;
  // Window-level shortcut handlers are attached once, so they read the current
  // handler through a ref instead of re-binding listeners on every render.
  const addClipboardLinkRef = useRef<() => Promise<void>>(async () => undefined);
  addClipboardLinkRef.current = addClipboardLink;
  const openItemRef = useRef<(item: ContentItem) => Promise<void>>(async () => undefined);
  openItemRef.current = openItem;
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
    // Seeds the initial history entry from the first render only; later
    // navigation pushes its own entries through navigateToView.
    window.history.replaceState({ view: activeView, selectedItemId }, "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    // Off means nothing about these URLs leaves the machine; the shelf keeps the
    // title and accent it derived locally from the URL.
    if (!latestAppStateRef.current.appSettings.fetchLinkPreviews) return;

    const targets = linkItems.filter((item) => item.type === "link");
    if (targets.length === 0) return;
    const epoch = linkEnrichEpochRef.current;

    void runWithConcurrency(targets, linkPreviewConcurrency, async (item) => {
      if (epoch !== linkEnrichEpochRef.current) return;
      const capturedLocation = item.location;
      const capturedAccent = item.accent;
      const capturedPreviewImage = item.previewImage;
      const capturedTagsKey = item.tags.join("\u0000");
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
    });
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

  // A notice raised before the switch is still in the old language, and there
  // is no way to re-render it, so it is dropped rather than left stale.
  useEffect(() => {
    setNotice("");
  }, [language]);

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

    function writeShelfState() {
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

      void nativeShelfQueueRef.current.enqueueStateSave(() => saveNativeAppState(state)).catch(() => {
        setNotice(t("nativeStorageFailed"));
      });
    }

    // Serializing the whole shelf on every keystroke is wasteful, so writes are
    // debounced. pendingShelfSaveRef lets close/unload paths force the pending
    // write out, or drop it when they are about to write fresher state.
    const timer = window.setTimeout(() => {
      pendingShelfSaveRef.current = null;
      writeShelfState();
    }, shelfSaveDebounceMs);

    pendingShelfSaveRef.current = {
      flush: () => {
        window.clearTimeout(timer);
        pendingShelfSaveRef.current = null;
        writeShelfState();
      },
      cancel: () => {
        window.clearTimeout(timer);
        pendingShelfSaveRef.current = null;
      },
    };

    return () => {
      window.clearTimeout(timer);
      pendingShelfSaveRef.current = null;
    };
  }, [appSettings, collectionSettings, dashboardLayouts, items, language, nativeRuntime, readerItemIdFromUrl, storageLoadFailed, storageReady, t, theme]);

  useEffect(() => {
    if (nativeRuntime) return;

    // The browser preview has no close hook of its own, so the last debounced
    // write is forced out before the page goes away.
    function flushBeforeUnload() {
      pendingShelfSaveRef.current?.flush();
    }

    window.addEventListener("pagehide", flushBeforeUnload);
    return () => window.removeEventListener("pagehide", flushBeforeUnload);
  }, [nativeRuntime]);

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
      // Drop any debounced write: the snapshot built below is newer, and letting
      // the timer fire afterwards could re-save older state.
      pendingShelfSaveRef.current?.cancel();

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
        void addClipboardLinkRef.current();
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
  }, [isAddOpen, navigateToView, readerItemIdFromUrl]);

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
    // Depends on the identifying fields rather than the item object: unrelated
    // patches (open counts, notes) must not re-register the path.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeView, ensureItemPathRegistered, nativeRuntime, readerItemIdFromUrl, selectedItem?.id, selectedItem?.location, selectedItem?.source, selectedItem?.type, showNotice, t]);

  const favoriteItems = items.filter((item) => item.isFavorite);
  const inboxItems = items.filter((item) => item.collection === "Inbox");
  const duplicateGroups = useMemo(() => findDuplicateGroups(items), [items]);
  const pinnedTypeShortcuts = appSettings.pinnedTypes;
  const pinnedCollectionShortcuts = appSettings.pinnedCollections;
  const pinnedTagShortcuts = appSettings.pinnedTags;
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
  /**
   * The types the shelf actually holds. A filter that can only ever come back
   * empty is not worth a chip, and the library's filter row is tight enough
   * that six fixed chips are most of what wrapped it onto a second line.
   *
   * Read from the whole shelf rather than the filtered view — narrowing to one
   * type would otherwise remove every other chip and strand the filter. The
   * active type is kept even once its last item is gone, so a chip never
   * disappears from under the selection.
   */
  const availableContentTypes = useMemo(() => {
    const present = new Set(items.map((item) => item.type));
    return contentTypes.filter((type) => present.has(type) || activeType === type);
  }, [items, activeType]);
  const [newCollectionName, setNewCollectionName] = useState("");

  const shellStyle = {
    "--app-bg": theme.background,
    "--app-surface": theme.surface,
    "--app-text": theme.text,
    "--app-muted": theme.muted,
    "--app-accent": theme.accent,
    // Computed rather than fixed at white: a pale accent needs a dark label on
    // it. CSS cannot measure luminance, so this is decided here.
    "--on-accent": onAccentColor(theme.accent),
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

    // The reader window reads this state on startup, so the pending debounced
    // write is dropped in favour of the fresher snapshot built here.
    pendingShelfSaveRef.current?.cancel();

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
      void openItemRef.current(selectedItem);
    }

    window.addEventListener("keydown", handleOpenShortcut);
    return () => window.removeEventListener("keydown", handleOpenShortcut);
  }, [isAddOpen, selectedItem]);

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
      <div className="themeRoot loadingShell" style={shellStyle}>
        <div className="brandMark">S</div>
        <strong>{appConfig.displayName}</strong>
        <span>{t("loadingShelf")}</span>
      </div>
    );
  }

  if (storageLoadFailed) {
    return (
      <div className="themeRoot loadingShell storageErrorShell" style={shellStyle}>
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
      <div className="themeRoot readerShell" style={shellStyle}>
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
      className={`themeRoot appShell density-${theme.dashboardCardDensity} ${isDraggingOver ? "dragOver" : ""}`}
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

        <SidebarShortcuts
          t={t}
          items={items}
          collectionSettings={collectionSettings}
          pinnedTypes={pinnedTypeShortcuts}
          pinnedCollections={pinnedCollectionShortcuts}
          pinnedTags={pinnedTagShortcuts}
          onFilterType={filterByTypePin}
          onFilterCollection={filterByCollection}
          onFilterTag={filterByTag}
          onUnpinType={pinTypeToDashboard}
          onUnpinCollection={pinCollectionToDashboard}
          onUnpinTag={pinTagToDashboard}
        />

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

        <section
          className={`statusStrip statusStrip--${noticeLevel} ${notice ? "" : "statusStrip--silent"}`}
          aria-live="polite"
        >
          <span className="statusNotice">{notice}</span>
        </section>

        {activeView === "dashboard" && (
          <DashboardView
            t={t}
            tCount={tCount}
            items={items}
            inboxItems={inboxItems}
            favoriteItems={favoriteItems}
            recentItems={recentItems}
            frequentItems={frequentItems}
            collectionCount={Object.keys(groupedCollections).length}
            dashboardCards={visibleDashboardCards}
            selectedItemId={selectedItemId}
            draggingItemId={draggingDashboardItemId}
            dropTargetId={dashboardDropTargetId}
            onNavigate={navigatePrimaryView}
            onFocusInboxCleanup={focusInboxCleanup}
            onFilterTag={filterByTag}
            onSelectItem={(item) => void selectItem(item)}
            onOpenItem={(item) => void openItem(item)}
            onToggleFavorite={(item) => updateItem(setItems, item.id, { isFavorite: !item.isFavorite })}
            onAddContent={() => setIsAddOpen(true)}
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
        )}

        {activeView === "library" && (
          <LibraryView
            t={t}
            tCount={tCount}
            items={filteredItems}
            contentTypes={availableContentTypes}
            collectionCount={Object.keys(groupedCollections).length}
            inboxItems={inboxItems}
            query={query}
            activeType={activeType}
            pinnedTypes={appSettings.pinnedTypes}
            pathHealthFilter={pathHealthFilter}
            pathScanInFlight={pathScanInFlight}
            brokenPathCount={unavailablePathIds.size}
            showBrokenPathFilter={nativeRuntime}
            selectedItemId={selectedItemId}
            selectedItemIds={selectedItemIds}
            bulkCollection={bulkCollection}
            bulkTags={bulkTags}
            onSelectType={(type) => {
              setPathHealthFilter(false);
              setActiveType(type);
            }}
            onPinType={pinTypeToDashboard}
            onScanBrokenPaths={() => void filterBrokenPaths()}
            onFocusInboxCleanup={focusInboxCleanup}
            onBulkCollectionChange={setBulkCollection}
            onBulkTagsChange={setBulkTags}
            onApplyBulkEdits={applyBulkEdits}
            onClearSelection={clearItemSelection}
            onSelectAllVisible={selectAllVisibleItems}
            onToggleItemSelection={toggleItemSelection}
            onSelectItem={(item) => void selectItem(item)}
            onOpenItem={(item) => void openItem(item)}
            onAddContent={() => setIsAddOpen(true)}
            detailPanel={
              selectedItem && (
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
              )
            }
          />
        )}

        {activeView === "collections" && (
          <CollectionsView
            t={t}
            tCount={tCount}
            items={items}
            collectionNames={collectionNames}
            groupedCollections={groupedCollections}
            groupedTags={groupedTags}
            collectionSettings={collectionSettings}
            pinnedCollections={appSettings.pinnedCollections}
            pinnedTags={appSettings.pinnedTags}
            editingCollection={editingCollection}
            newCollectionName={newCollectionName}
            onNewCollectionNameChange={setNewCollectionName}
            onCreateCollection={createCollection}
            onFilterCollection={filterByCollection}
            onFilterTag={filterByTag}
            onPinCollection={pinCollectionToDashboard}
            onPinTag={pinTagToDashboard}
            onEditingCollectionChange={setEditingCollection}
            onDeleteEmptyCollection={deleteEmptyCollection}
            onRenameCollection={renameCollection}
            onUpdateCollectionSettings={updateCollectionSettings}
          />
        )}

        {activeView === "customize" && (
          <CustomizePanel
            theme={theme}
            items={items}
            dashboardLayouts={normalizedDashboardLayouts}
            t={t}
            tCount={tCount}
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
            tCount={tCount}
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


export default App;
