import { BookOpen, FilePlus2, FolderOpen, HelpCircle, Link, Play, Star, Tags } from "lucide-react";
import type { MessageKey } from "../lib/i18n";
import { getCollectionSettings } from "../lib/collections";
import {
  getCollectionLabel,
  getItemLocation,
  getItemTitle,
  getTagLabel,
  getTypeLabel,
} from "../lib/shelfDisplay";
import type {
  CollectionSettings,
  ContentItem,
  ContentType,
  DashboardLayoutItem,
} from "../types";
import { collectionIcons, typeIcons } from "./icons";
import { ShelfCard } from "./ShelfCard";

export interface DashboardCardEntry {
  layout: DashboardLayoutItem;
  item: ContentItem;
}

export function DashboardView({
  t,
  items,
  inboxItems,
  favoriteItems,
  recentItems,
  frequentItems,
  collectionCount,
  collectionSettings,
  pinnedTypes,
  pinnedCollections,
  pinnedTags,
  dashboardCards,
  selectedItemId,
  draggingItemId,
  dropTargetId,
  onNavigate,
  onFocusInboxCleanup,
  onFilterType,
  onFilterCollection,
  onFilterTag,
  onUnpinType,
  onUnpinCollection,
  onUnpinTag,
  onSelectItem,
  onOpenItem,
  onToggleFavorite,
  onAddContent,
  onReorderStart,
  onReorderHover,
  onReorderEnd,
}: {
  t: (key: MessageKey) => string;
  items: ContentItem[];
  inboxItems: ContentItem[];
  favoriteItems: ContentItem[];
  recentItems: ContentItem[];
  frequentItems: ContentItem[];
  collectionCount: number;
  collectionSettings: Record<string, CollectionSettings>;
  pinnedTypes: ContentType[];
  pinnedCollections: string[];
  pinnedTags: string[];
  dashboardCards: DashboardCardEntry[];
  selectedItemId: string;
  draggingItemId: string | null;
  dropTargetId: string | null;
  onNavigate: (view: "library" | "collections" | "customize" | "guide") => void;
  onFocusInboxCleanup: (notice: string) => void;
  onFilterType: (type: ContentType) => void;
  onFilterCollection: (collection: string) => void;
  onFilterTag: (tag: string) => void;
  onUnpinType: (type: ContentType) => void;
  onUnpinCollection: (collection: string) => void;
  onUnpinTag: (tag: string) => void;
  onSelectItem: (item: ContentItem) => void;
  onOpenItem: (item: ContentItem) => void;
  onToggleFavorite: (item: ContentItem) => void;
  onAddContent: () => void;
  onReorderStart: (itemId: string) => void;
  onReorderHover: (overItemId: string) => void;
  onReorderEnd: (activeItemId: string, overItemId: string | null) => void;
}) {
  const hasShortcuts = pinnedTypes.length > 0 || pinnedCollections.length > 0 || pinnedTags.length > 0;

  function countLabel(count: number) {
    return `${count} ${count === 1 ? t("itemSingular") : t("itemPlural")}`;
  }

  function handleActivityKeyDown(event: React.KeyboardEvent<HTMLButtonElement>, item: ContentItem) {
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      event.preventDefault();
      onOpenItem(item);
    }
  }

  return (
    <>
      {inboxItems.length > 0 && (
        <section className="cleanupBanner" aria-label={t("inboxCleanupAction")}>
          <p>{t("inboxPendingBanner").replace("{count}", String(inboxItems.length))}</p>
          <button type="button" onClick={() => onFocusInboxCleanup(t("inboxCleanupAction"))}>
            {t("inboxCleanupAction")}
          </button>
        </section>
      )}

      {/* The counts are the only part of the old hero band that changed as the
        * shelf changed, so they are all that survives it. They read as a
        * sentence and stay clickable. */}
      <header className="dashboardHeader">
        <h1>{t("dashboardTitle")}</h1>
        <div className="dashboardCounts" aria-label={t("featureSummary")}>
          <button type="button" onClick={() => onNavigate("library")}>
            <strong>{items.length}</strong>
            {t("items")}
          </button>
          <button type="button" onClick={() => onNavigate("library")}>
            <strong>{favoriteItems.length}</strong>
            {t("pinned")}
          </button>
          <button type="button" onClick={() => onNavigate("collections")}>
            <strong>{collectionCount}</strong>
            {t("groups")}
          </button>
        </div>
      </header>

      {hasShortcuts && (
        <section className="dashboardShortcutGrid" aria-label={t("dashboardShortcutsTitle")}>
          <div className="dashboardSectionHeading">
            <h2>
              {t("dashboardShortcutsTitle")}
              <span>{pinnedTypes.length + pinnedCollections.length + pinnedTags.length}</span>
            </h2>
            <p>{t("dashboardShortcutsHint")}</p>
          </div>
          <div className="shortcutCardRow">
            {pinnedTypes.map((type) => {
              const count = items.filter((item) => item.type === type).length;
              return (
                <div className="shortcutCard" key={`type:${type}`}>
                  <button type="button" className="shortcutCardMain" onClick={() => onFilterType(type)}>
                    <span className="shortcutCardIcon" style={{ color: "var(--app-accent)" }}>
                      {typeIcons[type]}
                    </span>
                    <strong>{getTypeLabel(type, t)}</strong>
                    <span>{countLabel(count)}</span>
                  </button>
                  <button
                    type="button"
                    className="shortcutCardUnpin"
                    aria-label={t("unpinType")}
                    title={t("unpinType")}
                    onClick={() => onUnpinType(type)}
                  >
                    <Star size={14} fill="currentColor" />
                  </button>
                </div>
              );
            })}
            {pinnedCollections.map((collection) => {
              const settings = getCollectionSettings(collection, collectionSettings, items);
              const count = items.filter((item) => item.collection === collection).length;
              return (
                <div className="shortcutCard" key={`collection:${collection}`} style={{ borderColor: settings.color }}>
                  <button type="button" className="shortcutCardMain" onClick={() => onFilterCollection(collection)}>
                    <span className="shortcutCardIcon" style={{ color: settings.color }}>
                      {collectionIcons[settings.icon]}
                    </span>
                    <strong>{getCollectionLabel(collection, t)}</strong>
                    <span>{countLabel(count)}</span>
                  </button>
                  <button
                    type="button"
                    className="shortcutCardUnpin"
                    aria-label={t("unpinCollection")}
                    title={t("unpinCollection")}
                    onClick={() => onUnpinCollection(collection)}
                  >
                    <Star size={14} fill="currentColor" />
                  </button>
                </div>
              );
            })}
            {pinnedTags.map((tag) => {
              const count = items.filter((item) => item.tags.includes(tag)).length;
              return (
                <div className="shortcutCard" key={`tag:${tag}`}>
                  <button type="button" className="shortcutCardMain" onClick={() => onFilterTag(tag)}>
                    <span className="shortcutCardIcon" style={{ color: "var(--app-accent)" }}>
                      <Tags size={16} />
                    </span>
                    <strong>#{getTagLabel(tag, t)}</strong>
                    <span>{countLabel(count)}</span>
                  </button>
                  <button
                    type="button"
                    className="shortcutCardUnpin"
                    aria-label={t("unpinTag")}
                    title={t("unpinTag")}
                    onClick={() => onUnpinTag(tag)}
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
        <h2>
          {t("dashboardPinnedTitle")}
          <span>{dashboardCards.length}</span>
        </h2>
        <p>{t("dashboardPinnedHint")}</p>
      </div>

      <section className="dashboardGrid" aria-label={t("dashboardFavorites")}>
        {dashboardCards.length === 0 ? (
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
                <button className="primaryButton" type="button" onClick={onAddContent}>
                  <FilePlus2 size={17} />
                  {t("addContent")}
                </button>
                <button type="button" onClick={() => onNavigate("guide")}>
                  <HelpCircle size={17} />
                  {t("openGuide")}
                </button>
              </div>
            </div>
          </div>
        ) : (
          dashboardCards.map(({ item, layout }) => (
            <ShelfCard
              item={item}
              key={item.id}
              t={t}
              selected={selectedItemId === item.id}
              variant={layout.size}
              reorderable
              dragging={draggingItemId === item.id}
              dropTarget={dropTargetId === item.id && draggingItemId !== item.id}
              onSelect={() => onSelectItem(item)}
              onFilterTag={onFilterTag}
              onToggleFavorite={() => onToggleFavorite(item)}
              onReorderStart={onReorderStart}
              onReorderHover={onReorderHover}
              onReorderEnd={onReorderEnd}
            />
          ))
        )}
      </section>

      <section className="dashboardActivityGrid" aria-label={t("recentlyOpened")}>
        <div className="activityPanel">
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
                  onClick={() => onSelectItem(item)}
                  onDoubleClick={() => onOpenItem(item)}
                  onKeyDown={(event) => handleActivityKeyDown(event, item)}
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

        <div className="activityPanel">
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
                  onClick={() => onSelectItem(item)}
                  onDoubleClick={() => onOpenItem(item)}
                  onKeyDown={(event) => handleActivityKeyDown(event, item)}
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
  );
}
