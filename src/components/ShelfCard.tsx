import type React from "react";
import { useRef } from "react";
import { GripVertical, Music2, Star } from "lucide-react";
import type { MessageKey } from "../lib/i18n";
import { detectLinkPlatform } from "../lib/linkMeta";
import {
  getCollectionLabel,
  getItemImageSrc,
  getItemSummary,
  getItemTitle,
  getLinkKindLabel,
  getTagLabel,
  getTypeLabel,
} from "../lib/shelfDisplay";
import type { ContentItem } from "../types";
import { typeIcons } from "./icons";

/**
 * Dashboard reordering is pointer-driven rather than HTML5 drag-and-drop, so
 * the drop target is resolved by hit-testing the rendered cards.
 */
export function findDashboardCardIdAtPoint(clientX: number, clientY: number, excludeId?: string) {
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

export function ShelfCard({
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
  const previewSrc = getItemImageSrc(item);
  const summary = getItemSummary(item, t);
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
            {platform ? getLinkKindLabel(item.location, platform, t) : getCollectionLabel(item.collection, t)}
          </div>
          <span className="cardType">{getTypeLabel(item.type, t)}</span>
        </div>
        <h2>{getItemTitle(item, t)}</h2>
        {summary && <p>{summary}</p>}
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
