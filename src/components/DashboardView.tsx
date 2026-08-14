import { BookOpen, FilePlus2, FolderOpen, HelpCircle, Link, Play } from "lucide-react";
import type { MessageKey } from "../lib/i18n";
import { getItemLocation, getItemTitle } from "../lib/shelfDisplay";
import type { ContentItem, DashboardLayoutItem } from "../types";
import { typeIcons } from "./icons";
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
  dashboardCards,
  selectedItemId,
  draggingItemId,
  dropTargetId,
  onNavigate,
  onFocusInboxCleanup,
  onFilterTag,
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
  dashboardCards: DashboardCardEntry[];
  selectedItemId: string;
  draggingItemId: string | null;
  dropTargetId: string | null;
  onNavigate: (view: "library" | "collections" | "customize" | "guide") => void;
  onFocusInboxCleanup: (notice: string) => void;
  onFilterTag: (tag: string) => void;
  onSelectItem: (item: ContentItem) => void;
  onOpenItem: (item: ContentItem) => void;
  onToggleFavorite: (item: ContentItem) => void;
  onAddContent: () => void;
  onReorderStart: (itemId: string) => void;
  onReorderHover: (overItemId: string) => void;
  onReorderEnd: (activeItemId: string, overItemId: string | null) => void;
}) {
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

      {/* On an empty shelf the panel below carries its own heading and its own
        * invitation, so this one would only announce a section of nothing and
        * explain how to drag cards that do not exist. */}
      {dashboardCards.length > 0 && (
        <div className="dashboardSectionHeading">
          <h2>
            {t("dashboardPinnedTitle")}
            <span>{dashboardCards.length}</span>
          </h2>
          <p>{t("dashboardPinnedHint")}</p>
        </div>
      )}

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
