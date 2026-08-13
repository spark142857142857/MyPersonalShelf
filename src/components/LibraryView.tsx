import type React from "react";
import { FilePlus2, Star } from "lucide-react";
import type { MessageKey } from "../lib/i18n";
import { detectLinkPlatform, displayableImageSrc } from "../lib/linkMeta";
import {
  getCollectionLabel,
  getItemLocation,
  getItemTitle,
  getLinkKindLabel,
  getTypeLabel,
} from "../lib/shelfDisplay";
import type { ContentItem, ContentType } from "../types";
import { typeIcons } from "./icons";

export function LibraryView({
  t,
  items,
  contentTypes,
  collectionCount,
  inboxItems,
  query,
  activeType,
  pinnedTypes,
  pathHealthFilter,
  pathScanInFlight,
  brokenPathCount,
  showBrokenPathFilter,
  selectedItemId,
  selectedItemIds,
  bulkCollection,
  bulkTags,
  onSelectType,
  onPinType,
  onScanBrokenPaths,
  onFocusInboxCleanup,
  onBulkCollectionChange,
  onBulkTagsChange,
  onApplyBulkEdits,
  onClearSelection,
  onSelectAllVisible,
  onToggleItemSelection,
  onSelectItem,
  onOpenItem,
  onAddContent,
  detailPanel,
}: {
  t: (key: MessageKey) => string;
  items: ContentItem[];
  contentTypes: ContentType[];
  collectionCount: number;
  inboxItems: ContentItem[];
  query: string;
  activeType: ContentType | "all";
  pinnedTypes: ContentType[];
  pathHealthFilter: boolean;
  pathScanInFlight: boolean;
  brokenPathCount: number;
  showBrokenPathFilter: boolean;
  selectedItemId: string;
  selectedItemIds: Set<string>;
  bulkCollection: string;
  bulkTags: string;
  onSelectType: (type: ContentType | "all") => void;
  onPinType: (type: ContentType) => void;
  onScanBrokenPaths: () => void;
  onFocusInboxCleanup: (notice: string) => void;
  onBulkCollectionChange: (value: string) => void;
  onBulkTagsChange: (value: string) => void;
  onApplyBulkEdits: () => void;
  onClearSelection: () => void;
  onSelectAllVisible: () => void;
  onToggleItemSelection: (itemId: string, selected: boolean) => void;
  onSelectItem: (item: ContentItem) => void;
  onOpenItem: (item: ContentItem) => void;
  onAddContent: () => void;
  detailPanel?: React.ReactNode;
}) {
  function handleItemKeyDown(event: React.KeyboardEvent<HTMLButtonElement>, item: ContentItem) {
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      event.preventDefault();
      onOpenItem(item);
    }
  }

  return (
    <>
      <section className="pageIntro">
        <div>
          <span className="eyebrow">{t("libraryEyebrow")}</span>
          <h1>{t("libraryTitle")}</h1>
        </div>
        <div className="pageIntroStats">
          <span>{items.length} {t("visible")}</span>
          <span>{collectionCount} {t("groups")}</span>
        </div>
      </section>
      <section className="lowerGrid">
        <div className="libraryPanel">
          <div className="sectionTitle">
            <h2>{t("library")}</h2>
            <span>{items.length} {t("visible")}</span>
          </div>
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
                <div className="filterChipGroup" key={type}>
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
          {inboxItems.length > 0 && !pathHealthFilter && query !== "collection:Inbox" && (
            <div className="cleanupBanner compactCleanupBanner">
              <p>{t("inboxPendingBanner").replace("{count}", String(inboxItems.length))}</p>
              <button type="button" onClick={() => onFocusInboxCleanup(t("inboxCleanupAction"))}>
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
          <div className="itemList">
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
              items.map((item) => (
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
                      {item.type === "link" && displayableImageSrc(item.previewImage) ? (
                        <img className="listFavicon" src={displayableImageSrc(item.previewImage) ?? ""} alt="" />
                      ) : (
                        typeIcons[item.type]
                      )}
                    </span>
                    <span>
                      <strong>{getItemTitle(item, t)}</strong>
                      <small>
                        {item.type === "link"
                          ? `${getLinkKindLabel(item.location, detectLinkPlatform(item.location), t)} · ${getCollectionLabel(item.collection, t)}`
                          : `${getCollectionLabel(item.collection, t)} / ${getItemLocation(item, t)}`}
                      </small>
                    </span>
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        {detailPanel}
      </section>
    </>
  );
}
