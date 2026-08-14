import { BookOpen, FilePlus2, FolderOpen, HelpCircle, Link, Play } from "lucide-react";
import type { MessageKey } from "../lib/i18n";
import { getItemFileName, getItemTitle } from "../lib/shelfDisplay";
import type { ContentItem, DashboardLayoutItem } from "../types";
import { typeIcons } from "./icons";
import { ShelfCard } from "./ShelfCard";

export interface DashboardCardEntry {
  layout: DashboardLayoutItem;
  item: ContentItem;
}

export function DashboardView({
  t,
  tCount,
  items,
  inboxItems,
  favoriteItems,
  recentItems,
  frequentItems,
  unfinishedItems,
  collectionCount,
  dashboardCards,
  selectedItemId,
  draggingItemId,
  dropTargetId,
  onNavigate,
  onFocusInboxCleanup,
  onFilterTag,
  onOpenItem,
  onToggleFavorite,
  onAddContent,
  onReorderStart,
  onReorderHover,
  onReorderEnd,
}: {
  t: (key: MessageKey) => string;
  tCount: (count: number, key: MessageKey) => string;
  items: ContentItem[];
  inboxItems: ContentItem[];
  favoriteItems: ContentItem[];
  recentItems: ContentItem[];
  frequentItems: ContentItem[];
  unfinishedItems: ContentItem[];
  collectionCount: number;
  dashboardCards: DashboardCardEntry[];
  selectedItemId: string;
  draggingItemId: string | null;
  dropTargetId: string | null;
  onNavigate: (view: "library" | "collections" | "customize" | "guide") => void;
  onFocusInboxCleanup: (notice: string) => void;
  onFilterTag: (tag: string) => void;
  onOpenItem: (item: ContentItem) => void;
  onToggleFavorite: (item: ContentItem) => void;
  onAddContent: () => void;
  onReorderStart: (itemId: string) => void;
  onReorderHover: (overItemId: string) => void;
  onReorderEnd: (activeItemId: string, overItemId: string | null) => void;
}) {
  /* Everything on this page opens on a single click.
   *
   * The cards and the two activity lists used to select on a click and open on
   * a double, borrowed from the library, where it works because the library
   * has a detail panel for the selection to appear in. Here it could not:
   * selecting navigates to the library, so the row or card was unmounted
   * before the second click could reach it. Measured -- after the first click
   * of a double, document.body.contains(row) is false. Every double click and
   * every Ctrl+Enter on this page was unreachable.
   *
   * So the dashboard is a launcher and the library is where things are
   * inspected. That also makes the section this refresh added -- pick up where
   * you left off, which already opened on one click -- the rule rather than
   * the exception. */
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
      <header className="pageHeader">
        <h1>{t("dashboardTitle")}</h1>
        <div className="pageHeaderCounts" aria-label={t("featureSummary")}>
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

      {/* The one section here that is not a mirror of what its reader already
        * did. Pinned cards change when they are dragged, and the activity
        * lists when something is opened; this changes as a book is read, and
        * it is the reason to come back rather than a record of having been.
        *
        * Absent entirely when nothing is part-read — a heading over an empty
        * list would be the standing copy this refresh spent phase 3 removing. */}
      {unfinishedItems.length > 0 && (
        <section className="continuePanel" aria-label={t("continueReading")}>
          <div className="dashboardSectionHeading">
            <h2>
              {t("continueReading")}
              <span>{unfinishedItems.length}</span>
            </h2>
            <p>{t("continueReadingHint")}</p>
          </div>
          <div className="itemList">
            {unfinishedItems.map((item) => {
              const progress = Math.round(item.readerProgress ?? 0);
              return (
                <button
                  className="listItem continueRow"
                  type="button"
                  key={item.id}
                  onClick={() => onOpenItem(item)}
                >
                  <span className="listIcon" style={{ color: item.accent }}>
                    {typeIcons[item.type]}
                  </span>
                  <span>
                    <strong>{getItemTitle(item, t)}</strong>
                    {/* The bar carries the same number as the text beside it,
                      * so it is decoration to a screen reader. */}
                    <span className="continueMeter" aria-hidden="true">
                      <span style={{ width: `${progress}%` }} />
                    </span>
                    <small>{progress}% · {getItemFileName(item, t)}</small>
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      )}

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
              onActivate={() => onOpenItem(item)}
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
            <span>{tCount(recentItems.length, "items")}</span>
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
                  onClick={() => onOpenItem(item)}
                >
                  <span className="listIcon" style={{ color: item.accent }}>
                    {typeIcons[item.type]}
                  </span>
                  <span>
                    <strong>{getItemTitle(item, t)}</strong>
                    <small>{getItemFileName(item, t)}</small>
                  </span>
                </button>
              ))
            )}
          </div>
        </div>

        <div className="activityPanel">
          <div className="sectionTitle">
            <h2>{t("frequentlyOpened")}</h2>
            <span>{tCount(frequentItems.length, "items")}</span>
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
                  onClick={() => onOpenItem(item)}
                >
                  <span className="listIcon" style={{ color: item.accent }}>
                    {typeIcons[item.type]}
                  </span>
                  <span>
                    <strong>{getItemTitle(item, t)}</strong>
                    <small>{tCount(item.openCount, "opens")} / {getItemFileName(item, t)}</small>
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
