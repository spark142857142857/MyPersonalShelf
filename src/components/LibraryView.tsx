import type React from "react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { AlertTriangle, FilePlus2, FolderOpen, Star } from "lucide-react";
import { visibleRange } from "../lib/virtualList";
import type { MessageKey } from "../lib/i18n";
import { detectLinkPlatform } from "../lib/linkMeta";
import {
  getCollectionLabel,
  getItemFileName,
  getItemImageSrc,
  getItemTitle,
  getLinkKindLabel,
  getTypeLabel,
} from "../lib/shelfDisplay";
import type { ContentItem, ContentType } from "../types";
import { typeIcons } from "./icons";

/** Replaced by a real measurement on the first render that has rows. */
const assumedRowHeight = 61;

export function LibraryView({
  t,
  tCount,
  items,
  contentTypes,
  collectionCount,
  query,
  activeType,
  pinnedTypes,
  pathHealthFilter,
  pathScanInFlight,
  brokenPathCount,
  brokenItemIds,
  showBrokenPathFilter,
  selectedItemId,
  selectedItemIds,
  bulkCollection,
  bulkTags,
  onSelectType,
  onPinType,
  onScanBrokenPaths,
  onBulkCollectionChange,
  onBulkTagsChange,
  onApplyBulkEdits,
  onClearSelection,
  onSelectAllVisible,
  onToggleItemSelection,
  onSelectItem,
  onOpenItem,
  onAddContent,
  onRelinkItem,
  onRemoveItem,
  detailPanel,
}: {
  t: (key: MessageKey) => string;
  tCount: (count: number, key: MessageKey) => string;
  items: ContentItem[];
  contentTypes: ContentType[];
  collectionCount: number;
  query: string;
  activeType: ContentType | "all";
  pinnedTypes: ContentType[];
  pathHealthFilter: boolean;
  pathScanInFlight: boolean;
  brokenPathCount: number;
  brokenItemIds: Set<string>;
  showBrokenPathFilter: boolean;
  selectedItemId: string;
  selectedItemIds: Set<string>;
  bulkCollection: string;
  bulkTags: string;
  onSelectType: (type: ContentType | "all") => void;
  onPinType: (type: ContentType) => void;
  onScanBrokenPaths: () => void;
  onBulkCollectionChange: (value: string) => void;
  onBulkTagsChange: (value: string) => void;
  onApplyBulkEdits: () => void;
  onClearSelection: () => void;
  onSelectAllVisible: () => void;
  onToggleItemSelection: (itemId: string, selected: boolean) => void;
  onSelectItem: (item: ContentItem) => void;
  onOpenItem: (item: ContentItem) => void;
  onAddContent: () => void;
  onRelinkItem?: (item: ContentItem) => void;
  onRemoveItem?: (item: ContentItem) => void;
  detailPanel?: React.ReactNode;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const [rowHeight, setRowHeight] = useState(assumedRowHeight);
  const [viewport, setViewport] = useState({ scrollTop: 0, height: 0 });

  /* The list keeps its place in the page rather than becoming its own scroll
   * box, so the window is what scrolls and the list's own offset is what
   * decides which rows are on screen. A negative top means the list starts
   * above the fold; visibleRange clamps it. */
  useEffect(() => {
    function measure() {
      const element = listRef.current;
      if (!element) return;
      const nextTop = -element.getBoundingClientRect().top;
      const nextHeight = window.innerHeight;
      setViewport((current) =>
        current.scrollTop === nextTop && current.height === nextHeight
          ? current
          : { scrollTop: nextTop, height: nextHeight },
      );
    }

    measure();
    window.addEventListener("scroll", measure, { passive: true });
    window.addEventListener("resize", measure);
    return () => {
      window.removeEventListener("scroll", measure);
      window.removeEventListener("resize", measure);
    };
  }, []);

  /* Rows are uniform because their title and subtitle are both clipped to one
   * line, but the exact height follows the type scale, so it is read off a
   * real row rather than hardcoded here. Guarded by the comparison, so this
   * settles after one pass instead of looping. */
  useLayoutEffect(() => {
    const row = listRef.current?.querySelector(".listItemRow");
    if (!row) return;
    const measured = Math.round(row.getBoundingClientRect().height);
    if (measured > 0 && measured !== rowHeight) {
      setRowHeight(measured);
    }
    // items.length is here so an empty list that gains rows gets measured;
    // without it this would only ever run on mount, when there is nothing to
    // measure. The comparison above is what stops it looping.
  }, [rowHeight, items.length]);

  const { start, end } = visibleRange({
    scrollTop: viewport.scrollTop,
    viewportHeight: viewport.height,
    rowHeight,
    count: items.length,
  });
  const leadingSpace = start * rowHeight;
  const trailingSpace = Math.max(0, items.length - end) * rowHeight;

  function handleItemKeyDown(event: React.KeyboardEvent<HTMLButtonElement>, item: ContentItem) {
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      event.preventDefault();
      onOpenItem(item);
    }
  }

  return (
    <>
      <header className="pageHeader">
        <h1>{t("navLibrary")}</h1>
        <div className="pageHeaderCounts">
          <span><strong>{items.length}</strong>{t("visible")}</span>
          <span><strong>{collectionCount}</strong>{t("groups")}</span>
        </div>
      </header>
      <section className="lowerGrid">
        <div className="libraryPanel">
          <div className="filterRow">
            <button
              className={activeType === "all" && !pathHealthFilter ? "active" : ""}
              type="button"
              onClick={() => onSelectType("all")}
            >
              {t("all")}
            </button>
            {contentTypes.map((type) => {
              const pinned = pinnedTypes.includes(type);
              return (
                <div className={`filterChipGroup ${pinned ? "pinned" : ""}`} key={type}>
                  <button
                    className={activeType === type && !pathHealthFilter ? "active" : ""}
                    type="button"
                    onClick={() => onSelectType(type)}
                  >
                    {getTypeLabel(type, t)}
                  </button>
                  <button
                    className={`pinChipButton ${pinned ? "pinned" : ""}`}
                    type="button"
                    aria-pressed={pinned}
                    aria-label={pinned ? t("unpinType") : t("pinType")}
                    title={pinned ? t("unpinType") : t("pinType")}
                    onClick={() => onPinType(type)}
                  >
                    <Star size={13} fill={pinned ? "currentColor" : "none"} />
                  </button>
                </div>
              );
            })}
            {showBrokenPathFilter && (
              <button
                className={pathHealthFilter ? "active" : ""}
                type="button"
                title={t("brokenPathsHint")}
                disabled={pathScanInFlight}
                onClick={onScanBrokenPaths}
              >
                {t("brokenPathsFilter")}
                {brokenPathCount > 0 ? ` (${brokenPathCount})` : ""}
              </button>
            )}
          </div>
          {selectedItemIds.size > 0 && (
            <div className="bulkBar">
              <span className="bulkCount">{tCount(selectedItemIds.size, "selectedCount")}</span>
              <input
                list="collection-options"
                placeholder={t("bulkCollection")}
                value={bulkCollection}
                onChange={(event) => onBulkCollectionChange(event.target.value)}
              />
              <input
                placeholder={t("bulkAddTags")}
                value={bulkTags}
                onChange={(event) => onBulkTagsChange(event.target.value)}
              />
              <button className="primaryButton" type="button" onClick={onApplyBulkEdits}>{t("applyBulk")}</button>
              <button type="button" onClick={onClearSelection}>{t("clearSelection")}</button>
            </div>
          )}
          {items.length > 0 && selectedItemIds.size === 0 && (
            <div className="bulkBar bulkBarIdle">
              <button type="button" onClick={onSelectAllVisible}>{t("selectAllVisible")}</button>
            </div>
          )}
          <div className="itemList" ref={listRef}>
            {items.length === 0 ? (
              <div className="emptyListPanel">
                <strong>{query ? t("noSearchResults") : t("emptyLibraryTitle")}</strong>
                <p>{query ? t("noSearchResultsText") : t("emptyLibraryText")}</p>
                {!query && (
                  <button type="button" onClick={onAddContent}>
                    <FilePlus2 size={16} />
                    {t("addContent")}
                  </button>
                )}
              </div>
            ) : (
              <>
              {leadingSpace > 0 && <div style={{ height: leadingSpace }} aria-hidden="true" />}
              {items.slice(start, end).map((item) => {
                const listIconSrc = getItemImageSrc(item);
                const missing = brokenItemIds.has(item.id);
                return (
                  <div className={`listItemRow ${selectedItemId === item.id ? "selected" : ""}`} key={item.id}>
                    <input
                      type="checkbox"
                      checked={selectedItemIds.has(item.id)}
                      aria-label={getItemTitle(item, t)}
                      onChange={(event) => onToggleItemSelection(item.id, event.target.checked)}
                    />
                    <button
                      className={`listItem ${selectedItemId === item.id ? "selected" : ""}`}
                      type="button"
                      onClick={() => onSelectItem(item)}
                      onDoubleClick={() => onOpenItem(item)}
                      onKeyDown={(event) => handleItemKeyDown(event, item)}
                    >
                      <span className="listIcon" style={{ color: item.accent }}>
                        {listIconSrc ? (
                          <img className="listFavicon" src={listIconSrc} alt="" />
                        ) : (
                          typeIcons[item.type]
                        )}
                      </span>
                      <span>
                        <strong>{getItemTitle(item, t)}</strong>
                        <small>
                          {/* A missing path is the one thing about a row that
                            * the row cannot afford to keep to itself. Before
                            * this it showed only in the detail panel, so
                            * finding a broken item meant selecting every item
                            * in turn. */}
                          {missing && (
                            <span className="listItemMissing">
                              <AlertTriangle size={13} aria-hidden="true" />
                              {t("pathMissing")}
                            </span>
                          )}
                          {item.type === "link"
                            ? `${getLinkKindLabel(item.location, detectLinkPlatform(item.location), t)} · ${getCollectionLabel(item.collection, t)}`
                            : `${getCollectionLabel(item.collection, t)} / ${getItemFileName(item, t)}`}
                        </small>
                      </span>
                    </button>
                    {/* A broken row is the one row you cannot do anything with
                      * by clicking it, so its two ways out sit on the row
                      * itself rather than behind a selection. */}
                    {missing && (onRelinkItem || onRemoveItem) && (
                      <div className="listItemActions">
                        {onRelinkItem && (
                          <button type="button" onClick={() => onRelinkItem(item)}>
                            <FolderOpen size={14} />
                            {t("relinkPath")}
                          </button>
                        )}
                        {onRemoveItem && (
                          <button
                            className="listItemDrop"
                            type="button"
                            onClick={() => onRemoveItem(item)}
                          >
                            {t("delete")}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
              {trailingSpace > 0 && <div style={{ height: trailingSpace }} aria-hidden="true" />}
              </>
            )}
          </div>
        </div>

        {detailPanel}
      </section>
    </>
  );
}
