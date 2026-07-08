import {
  BookOpen,
  Download,
  FilePlus2,
  FolderOpen,
  Grid3X3,
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
  X,
} from "lucide-react";
import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { appConfig } from "./lib/appConfig";
import { getMessage, languageOptions, type Language, type MessageKey } from "./lib/i18n";
import { loadNativeAppState, nativeAssetUrl, saveNativeAppState, selectNativeFile, selectNativeFolder } from "./lib/native";
import { contentItems as seedItems } from "./lib/sampleData";
import type {
  ContentItem,
  ContentSource,
  ContentType,
  DashboardCardSize,
  DashboardLayoutItem,
  ThemeSettings,
} from "./types";

type View = "dashboard" | "library" | "collections" | "customize";
type AddMode = "manual" | "upload";

interface DraftItem {
  title: string;
  type: ContentType;
  source: ContentSource;
  location: string;
  collection: string;
  tags: string;
  accent: string;
  summary: string;
  textContent: string;
}

const itemStorageKey = "mypersonalshelf.items.v1";
const themeStorageKey = "mypersonalshelf.theme.v1";
const languageStorageKey = "mypersonalshelf.language.v1";
const dashboardStorageKey = "mypersonalshelf.dashboard.v1";

const defaultTheme: ThemeSettings = {
  background: "#edf0f4",
  surface: "#ffffff",
  text: "#1d2430",
  muted: "#667085",
  accent: "#263238",
  readerWidth: 680,
  lineHeight: 1.8,
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

const navItems: Array<{ id: View; label: MessageKey; icon: React.ReactNode }> = [
  { id: "dashboard", label: "navDashboard", icon: <Grid3X3 size={18} /> },
  { id: "library", label: "navLibrary", icon: <Library size={18} /> },
  { id: "collections", label: "navCollections", icon: <Tags size={18} /> },
  { id: "customize", label: "navCustomize", icon: <Paintbrush size={18} /> },
];

const contentTypes: ContentType[] = ["document", "video", "audio", "image", "link", "folder"];
const dashboardSizes: DashboardCardSize[] = ["standard", "wide", "tall"];

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
  "Novel reading archive": "seedNovelTitle",
  "React lecture materials": "seedLectureTitle",
  "Focus music folder": "seedMusicTitle",
  "Saved reference links": "seedLinksTitle",
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

function getItemTextContent(item: ContentItem, t: (key: MessageKey) => string) {
  return item.textContent ? translateKnown(item.textContent, seedTextContentLabelKeys, t) : "";
}

function loadItems(): ContentItem[] {
  const raw = window.localStorage.getItem(itemStorageKey);
  if (!raw) {
    return seedItems.map(normalizeItem);
  }

  try {
    const parsed = JSON.parse(raw) as ContentItem[];
    return (parsed.length > 0 ? parsed : seedItems).map(normalizeItem);
  } catch {
    return seedItems.map(normalizeItem);
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

function createId() {
  return `item-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function getSafeExternalUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function parseSearchQuery(query: string) {
  const trimmed = query.trim();
  const separatorIndex = trimmed.indexOf(":");
  if (separatorIndex <= 0) {
    return { command: "text", value: trimmed.toLowerCase() };
  }

  const rawCommand = trimmed.slice(0, separatorIndex).toLowerCase();
  const commandAliases: Record<string, string> = {
    "명령": "text",
    "검색": "text",
    "태그": "tag",
    "종류": "type",
    "타입": "type",
    "컬렉션": "collection",
    "모음": "collection",
    "열기": "open",
    "재생": "play",
  };

  return {
    command: commandAliases[rawCommand] ?? rawCommand,
    value: trimmed.slice(separatorIndex + 1).trim().toLowerCase(),
  };
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

function App() {
  const [items, setItems] = useState<ContentItem[]>(loadItems);
  const [theme, setTheme] = useState<ThemeSettings>(loadTheme);
  const [language, setLanguage] = useState<Language>(loadLanguage);
  const [dashboardLayouts, setDashboardLayouts] = useState<DashboardLayoutItem[]>(() =>
    normalizeDashboardLayouts(loadItems(), loadDashboardLayouts()),
  );
  const [activeView, setActiveView] = useState<View>("dashboard");
  const [selectedItemId, setSelectedItemId] = useState(items[0]?.id ?? "");
  const [query, setQuery] = useState("");
  const [activeType, setActiveType] = useState<ContentType | "all">("all");
  const [notice, setNotice] = useState("");
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [addMode, setAddMode] = useState<AddMode>("manual");
  const [draft, setDraft] = useState<DraftItem>(initialDraft);
  const [storageReady, setStorageReady] = useState(false);
  const objectUrlsRef = useRef<Set<string>>(new Set());
  const searchInputRef = useRef<HTMLInputElement>(null);

  const t = useCallback((key: MessageKey) => getMessage(language, key), [language]);

  useEffect(() => {
    if (!notice) {
      setNotice(t("readyNotice"));
    }
  }, [notice, t]);

  useEffect(() => {
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
        setDashboardLayouts(normalizeDashboardLayouts(nextItems, state.dashboardLayouts ?? []));
        setSelectedItemId(nextItems[0]?.id ?? "");
      })
      .catch(() => {
        // Browser preview cannot call Tauri commands; localStorage remains the fallback.
      })
      .finally(() => {
        if (isMounted) {
          setStorageReady(true);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    setNotice(t("readyNotice"));
  }, [language, t]);

  useEffect(() => {
    setDashboardLayouts((current) => normalizeDashboardLayouts(items, current));
  }, [items]);

  useEffect(() => {
    if (!storageReady) {
      return;
    }

    const serializableItems = items.map(({ objectUrl, ...item }) => item);
    const normalizedLayouts = normalizeDashboardLayouts(items, dashboardLayouts);
    window.localStorage.setItem(itemStorageKey, JSON.stringify(serializableItems));
    window.localStorage.setItem(themeStorageKey, JSON.stringify(theme));
    window.localStorage.setItem(languageStorageKey, language);
    window.localStorage.setItem(dashboardStorageKey, JSON.stringify(normalizedLayouts));

    saveNativeAppState({
      items: serializableItems,
      theme,
      language,
      dashboardLayouts: normalizedLayouts,
    }).catch(() => {
      // Browser preview cannot persist to SQLite; localStorage has already been updated.
    });
  }, [dashboardLayouts, items, language, storageReady, theme]);

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
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchInputRef.current?.focus();
        setActiveView("library");
      }
    }

    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, []);

  const selectedItem = items.find((item) => item.id === selectedItemId) ?? items[0];
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

  const shellStyle = {
    "--app-bg": theme.background,
    "--app-surface": theme.surface,
    "--app-text": theme.text,
    "--app-muted": theme.muted,
    "--app-accent": theme.accent,
    "--reader-width": `${theme.readerWidth}px`,
    "--reader-line-height": theme.lineHeight,
  } as React.CSSProperties;

  function selectItem(item: ContentItem, nextView: View = "library") {
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
    setSelectedItemId(item.id);
    setActiveView(nextView);
    setNotice(`${getItemTitle(item, t)} ${t("selected")}`);
  }

  function addManualItem(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const now = new Date().toISOString();
    const nextItem: ContentItem = {
      id: createId(),
      title: draft.title.trim() || "Untitled shelf item",
      type: draft.type,
      source: draft.source,
      location: draft.location.trim() || "No location yet",
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
    setSelectedItemId(nextItem.id);
    setDraft(initialDraft);
    setIsAddOpen(false);
    setActiveView("library");
    setNotice(`${nextItem.title} ${t("addedToShelf")}`);
  }

  function importFile(file: File) {
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
        setSelectedItemId(nextItem.id);
        setActiveView("library");
        setIsAddOpen(false);
        setNotice(`${nextItem.title} ${t("importedReadable")}`);
      };
      reader.readAsText(file);
      return;
    }

    const nextItem = { ...baseItem, objectUrl: URL.createObjectURL(file) };
    setItems((current) => [nextItem, ...current]);
    setSelectedItemId(nextItem.id);
    setActiveView("library");
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
      setSelectedItemId(nextItem.id);
      setActiveView("library");
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
      setSelectedItemId(nextItem.id);
      setActiveView("library");
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
    const nextItems = items.filter((item) => item.id !== selectedItem.id);
    setItems(nextItems);
    setSelectedItemId(nextItems[0]?.id ?? "");
    setNotice(`${selectedItem.title} ${t("removed")}`);
  }

  function exportData() {
    const serializableItems = items.map(({ objectUrl, ...item }) => item);
    const blob = new Blob(
      [
        JSON.stringify(
          {
            items: serializableItems,
            theme,
            language,
            dashboardLayouts: normalizedDashboardLayouts,
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

  return (
    <div className={`appShell ${theme.compactCards ? "compact" : ""}`} style={shellStyle}>
      <aside className="sidebar">
        <button className="brand brandButton" type="button" onClick={() => setActiveView("dashboard")}>
          <div className="brandMark">S</div>
          <div>
            <strong>{appConfig.displayName}</strong>
            <span>{t("tagline")}</span>
          </div>
        </button>

        <nav className="navList" aria-label="Primary navigation">
          {navItems.map((item) => (
            <button
              className={`navItem ${activeView === item.id ? "active" : ""}`}
              type="button"
              key={item.id}
              onClick={() => setActiveView(item.id)}
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
                setActiveView("library");
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" && filteredItems[0]) {
                  event.preventDefault();
                  selectItem(filteredItems[0]);
                }
              }}
            />
          </div>
          <div className="actions">
            <label className="topbarSelect">
              <span>{t("language")}</span>
              <select value={language} onChange={(event) => setLanguage(event.target.value as Language)}>
                {languageOptions.map((option) => (
                  <option value={option.value} key={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <button className="iconButton" type="button" aria-label={t("exportData")} onClick={exportData}>
              <Download size={18} />
            </button>
            <button className="iconButton" type="button" aria-label={t("openCustomize")} onClick={() => setActiveView("customize")}>
              <Settings2 size={18} />
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
              <div>
                <span className="eyebrow">{t("heroEyebrow")}</span>
                <h1>{t("heroTitle")}</h1>
              </div>
              <div className="heroStats" aria-label={t("featureSummary")}>
                <button type="button" onClick={() => setActiveView("library")}>{items.length} {t("items")}</button>
                <button type="button" onClick={() => setActiveView("library")}>{favoriteItems.length} {t("pinned")}</button>
                <button type="button" onClick={() => setActiveView("collections")}>{Object.keys(groupedCollections).length} {t("groups")}</button>
                <button type="button" onClick={() => setActiveView("customize")}>{t("custom")}</button>
              </div>
            </section>

            <section className="dashboardGrid" aria-label={t("dashboardFavorites")}>
              {visibleDashboardCards.map(({ item, layout }) => (
                <ShelfCard
                  item={item}
                  key={item.id}
                  t={t}
                  selected={selectedItemId === item.id}
                  variant={layout.size}
                  onSelect={() => selectItem(item)}
                  onToggleFavorite={() => updateItem(setItems, item.id, { isFavorite: !item.isFavorite })}
                />
              ))}
            </section>

            <section className="libraryPanel">
              <div className="sectionTitle">
                <h2>{t("recentlyOpened")}</h2>
                <span>{recentItems.length} {t("items")}</span>
              </div>
              <div className="itemList">
                {recentItems.length === 0 ? (
                  <p className="emptyText">{t("noRecentItems")}</p>
                ) : (
                  recentItems.map((item) => (
                    <button className="listItem" type="button" key={item.id} onClick={() => selectItem(item)}>
                      <span className="listIcon" style={{ color: item.accent }}>
                        {typeIcons[item.type]}
                      </span>
                      <span>
                        <strong>{getItemTitle(item, t)}</strong>
                        <small>{item.openCount} {t("opens")} / {item.location}</small>
                      </span>
                    </button>
                  ))
                )}
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
                  {filteredItems.map((item) => (
                    <button
                      className={`listItem ${selectedItemId === item.id ? "selected" : ""}`}
                      type="button"
                      key={item.id}
                      onClick={() => selectItem(item, "library")}
                    >
                      <span className="listIcon" style={{ color: item.accent }}>
                        {typeIcons[item.type]}
                      </span>
                      <span>
                        <strong>{getItemTitle(item, t)}</strong>
                        <small>{getCollectionLabel(item.collection, t)} / {item.location}</small>
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {selectedItem && (
                <DetailPanel
                  item={selectedItem}
                  theme={theme}
                  t={t}
                  onPatch={updateSelectedItem}
                  onDelete={deleteSelectedItem}
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
                {Object.entries(groupedCollections).map(([collection, collectionItems]) => (
                  <button
                    className="collectionCard"
                    type="button"
                    key={collection}
                    onClick={() => {
                      setQuery(collection);
                      setActiveType("all");
                      setActiveView("library");
                      setNotice(`${getCollectionLabel(collection, t)} ${t("collectionFiltered")}`);
                    }}
                  >
                    <strong>{getCollectionLabel(collection, t)}</strong>
                    <span>{collectionItems.length} {collectionItems.length === 1 ? t("itemSingular") : t("itemPlural")}</span>
                    <small>{collectionItems.map((item) => getTypeLabel(item.type, t)).join(", ")}</small>
                  </button>
                ))}
              </div>
            </section>
          </>
        )}

        {activeView === "customize" && (
          <CustomizePanel
            theme={theme}
            language={language}
            items={items}
            dashboardLayouts={normalizedDashboardLayouts}
            t={t}
            onChange={setTheme}
            onLanguageChange={setLanguage}
            onMoveDashboardCard={moveDashboardCard}
            onCycleDashboardCardSize={cycleDashboardCardSize}
            onToggleDashboardCardHidden={toggleDashboardCardHidden}
            onReset={() => {
              setTheme(defaultTheme);
              setNotice(t("themeReset"));
            }}
          />
        )}
      </main>

      {isAddOpen && (
        <AddContentModal
          mode={addMode}
          draft={draft}
          t={t}
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
  onToggleFavorite,
}: {
  item: ContentItem;
  t: (key: MessageKey) => string;
  selected: boolean;
  variant: "standard" | "wide" | "tall";
  onSelect: () => void;
  onToggleFavorite: () => void;
}) {
  return (
    <article className={`contentCard ${variant} ${selected ? "selected" : ""}`}>
      <button className="cardHitArea" type="button" onClick={onSelect}>
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
          <span>{item.location}</span>
        </div>
        <div className="tagRow">
          {item.tags.map((tag) => (
            <span key={tag}>#{getTagLabel(tag, t)}</span>
          ))}
        </div>
      </button>
      <button className="favoriteButton" type="button" onClick={onToggleFavorite} aria-label="Toggle favorite">
        <Star size={16} fill={item.isFavorite ? "currentColor" : "none"} />
      </button>
    </article>
  );
}

function DetailPanel({
  item,
  theme,
  t,
  onPatch,
  onDelete,
}: {
  item: ContentItem;
  theme: ThemeSettings;
  t: (key: MessageKey) => string;
  onPatch: (patch: Partial<ContentItem>) => void;
  onDelete: () => void;
}) {
  const safeExternalUrl = item.type === "link" ? getSafeExternalUrl(item.location) : null;

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
        {item.type === "link" && (
          <button
            type="button"
            disabled={!safeExternalUrl}
            title={safeExternalUrl ? t("open") : t("invalidLink")}
            onClick={() => {
              if (safeExternalUrl) {
                window.open(safeExternalUrl, "_blank", "noopener,noreferrer");
              }
            }}
          >
            <Link size={16} />
            {safeExternalUrl ? t("open") : t("invalidLink")}
          </button>
        )}
        <button className="dangerButton" type="button" onClick={onDelete}>
          <Trash2 size={16} />
          {t("delete")}
        </button>
      </div>

      <div
        className="readerPreview"
        style={{ borderColor: item.accent, maxWidth: theme.readerWidth, lineHeight: theme.lineHeight }}
      >
        <strong>{getItemTitle(item, t)}</strong>
        <PreviewBody item={item} t={t} onPatch={onPatch} />
      </div>

      <label className="fieldBlock">
        {t("notes")}
        <textarea
          value={item.summary ? getItemSummary(item, t) : ""}
          onChange={(event) => onPatch({ summary: event.target.value })}
          placeholder={t("notesPlaceholder")}
        />
      </label>

      <div className="metaGrid">
        <span>{t("collection")}</span>
        <strong>{getCollectionLabel(item.collection, t)}</strong>
        <span>{t("location")}</span>
        <strong>{item.location}</strong>
        <span>{t("tags")}</span>
        <strong>{item.tags.map((tag) => `#${getTagLabel(tag, t)}`).join(" ") || t("none")}</strong>
      </div>
    </div>
  );
}

function PreviewBody({
  item,
  t,
  onPatch,
}: {
  item: ContentItem;
  t: (key: MessageKey) => string;
  onPatch: (patch: Partial<ContentItem>) => void;
}) {
  const previewUrl = item.objectUrl ?? (item.source === "path" ? nativeAssetUrl(item.location) : undefined);

  if (item.type === "document") {
    return (
      <div>
        <p>{getItemTextContent(item, t) || (item.summary ? getItemSummary(item, t) : t("documentEmpty"))}</p>
        <label className="progressControl">
          {t("readingProgress")}: {Math.round(item.readerProgress ?? 0)}%
          <input
            type="range"
            min="0"
            max="100"
            value={item.readerProgress ?? 0}
            onChange={(event) => onPatch({ readerProgress: Number(event.target.value) })}
          />
        </label>
      </div>
    );
  }

  if (item.type === "video") {
    return previewUrl ? (
      <video
        src={previewUrl}
        controls
        onLoadedMetadata={(event) => {
          event.currentTarget.currentTime = item.mediaPosition ?? 0;
        }}
        onTimeUpdate={(event) => {
          const nextPosition = event.currentTarget.currentTime;
          if (Math.abs(nextPosition - (item.mediaPosition ?? 0)) >= 5) {
            onPatch({ mediaPosition: nextPosition });
          }
        }}
        onPause={(event) => onPatch({ mediaPosition: event.currentTarget.currentTime })}
      />
    ) : (
      <p>{t("videoPathSaved")}</p>
    );
  }

  if (item.type === "audio") {
    return previewUrl ? (
      <div>
        <audio
          src={previewUrl}
          controls
          onLoadedMetadata={(event) => {
            event.currentTarget.currentTime = item.mediaPosition ?? 0;
          }}
          onTimeUpdate={(event) => {
            const nextPosition = event.currentTarget.currentTime;
            if (Math.abs(nextPosition - (item.mediaPosition ?? 0)) >= 5) {
              onPatch({ mediaPosition: nextPosition });
            }
          }}
          onPause={(event) => onPatch({ mediaPosition: event.currentTarget.currentTime })}
        />
        <p>{t("mediaResume")}: {Math.round(item.mediaPosition ?? 0)}s</p>
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

function AddContentModal({
  mode,
  draft,
  t,
  onModeChange,
  onDraftChange,
  onSubmit,
  onFile,
  onNativeFile,
  onNativeFolder,
  onClose,
}: {
  mode: AddMode;
  draft: DraftItem;
  t: (key: MessageKey) => string;
  onModeChange: (mode: AddMode) => void;
  onDraftChange: (draft: DraftItem) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  onFile: (file: File) => void;
  onNativeFile: () => void;
  onNativeFolder: () => void;
  onClose: () => void;
}) {
  return (
    <div className="modalBackdrop" role="presentation">
      <section className="modalPanel" role="dialog" aria-modal="true" aria-labelledby="add-content-title">
        <div className="sectionTitle">
          <h2 id="add-content-title">{t("addContentTitle")}</h2>
          <button className="iconButton" type="button" aria-label={t("close")} onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="filterRow">
          <button className={mode === "manual" ? "active" : ""} type="button" onClick={() => onModeChange("manual")}>
            {t("manual")}
          </button>
          <button className={mode === "upload" ? "active" : ""} type="button" onClick={() => onModeChange("upload")}>
            {t("uploadPreview")}
          </button>
          <button type="button" onClick={onNativeFile}>
            {t("nativeFile")}
          </button>
          <button type="button" onClick={onNativeFolder}>
            {t("nativeFolder")}
          </button>
        </div>

        {mode === "upload" ? (
          <label className="uploadBox">
            <Upload size={24} />
            {t("uploadPrompt")}
            <input
              type="file"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) onFile(file);
              }}
            />
          </label>
        ) : (
          <form className="formGrid" onSubmit={onSubmit}>
            <label>
              {t("title")}
              <input value={draft.title} onChange={(event) => onDraftChange({ ...draft, title: event.target.value })} />
            </label>
            <label>
              {t("type")}
              <select
                value={draft.type}
                onChange={(event) => onDraftChange({ ...draft, type: event.target.value as ContentType })}
              >
                {contentTypes.map((type) => (
                  <option key={type} value={type}>{getTypeLabel(type, t)}</option>
                ))}
              </select>
            </label>
            <label>
              {t("source")}
              <select
                value={draft.source}
                onChange={(event) => onDraftChange({ ...draft, source: event.target.value as ContentSource })}
              >
                <option value="path">{t("pathOption")}</option>
                <option value="url">{t("urlOption")}</option>
                <option value="note">{t("noteOption")}</option>
              </select>
            </label>
            <label>
              {t("locationLabel")}
              <input value={draft.location} onChange={(event) => onDraftChange({ ...draft, location: event.target.value })} />
            </label>
            <label>
              {t("collection")}
              <input value={draft.collection} onChange={(event) => onDraftChange({ ...draft, collection: event.target.value })} />
            </label>
            <label>
              {t("tagsComma")}
              <input value={draft.tags} onChange={(event) => onDraftChange({ ...draft, tags: event.target.value })} />
            </label>
            <label>
              {t("accent")}
              <input type="color" value={draft.accent} onChange={(event) => onDraftChange({ ...draft, accent: event.target.value })} />
            </label>
            <label className="spanTwo">
              {t("summaryNotes")}
              <textarea value={draft.summary} onChange={(event) => onDraftChange({ ...draft, summary: event.target.value })} />
            </label>
            <label className="spanTwo">
              {t("documentText")}
              <textarea value={draft.textContent} onChange={(event) => onDraftChange({ ...draft, textContent: event.target.value })} />
            </label>
            <button className="primaryButton spanTwo" type="submit">
              {t("addToShelf")}
            </button>
          </form>
        )}
      </section>
    </div>
  );
}

function CustomizePanel({
  theme,
  language,
  items,
  dashboardLayouts,
  t,
  onChange,
  onLanguageChange,
  onMoveDashboardCard,
  onCycleDashboardCardSize,
  onToggleDashboardCardHidden,
  onReset,
}: {
  theme: ThemeSettings;
  language: Language;
  items: ContentItem[];
  dashboardLayouts: DashboardLayoutItem[];
  t: (key: MessageKey) => string;
  onChange: (theme: ThemeSettings) => void;
  onLanguageChange: (language: Language) => void;
  onMoveDashboardCard: (itemId: string, direction: -1 | 1) => void;
  onCycleDashboardCardSize: (itemId: string) => void;
  onToggleDashboardCardHidden: (itemId: string) => void;
  onReset: () => void;
}) {
  const previewItem = items.find((item) => item.isFavorite) ?? items[0];

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
            <div className="readerSample" style={{ maxWidth: theme.readerWidth, lineHeight: theme.lineHeight }}>
              <strong>{t("readerSampleTitle")}</strong>
              <p>{t("readerSampleText")}</p>
            </div>
          </section>

          <section className="settingsGroup">
            <div className="groupHeading">
              <h2>{t("homeLayout")}</h2>
              <span>{dashboardLayouts.length} {t("items")}</span>
            </div>
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
                    <span>
                      <strong>{getItemTitle(item, t)}</strong>
                      <small>{getSizeLabel(layout.size, t)} / {layout.hidden ? t("hideCard") : getCollectionLabel(item.collection, t)}</small>
                    </span>
                    <div className="layoutActions">
                      <button type="button" disabled={index === 0} onClick={() => onMoveDashboardCard(layout.itemId, -1)}>
                        {t("moveUp")}
                      </button>
                      <button
                        type="button"
                        disabled={index === dashboardLayouts.length - 1}
                        onClick={() => onMoveDashboardCard(layout.itemId, 1)}
                      >
                        {t("moveDown")}
                      </button>
                      <button type="button" onClick={() => onCycleDashboardCardSize(layout.itemId)}>
                        {t("changeSize")}
                      </button>
                      <button type="button" onClick={() => onToggleDashboardCardHidden(layout.itemId)}>
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
              <div className="previewReader" style={{ maxWidth: theme.readerWidth / 2, lineHeight: theme.lineHeight }}>
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
