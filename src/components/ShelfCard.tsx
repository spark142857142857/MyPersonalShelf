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
  onActivate,
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
  /** What a click on the card body does. See the hit area below. */
  onActivate: () => void;
  onFilterTag: (tag: string) => void;
  onToggleFavorite: () => void;
  onReorderStart?: (itemId: string) => void;
  onReorderHover?: (overItemId: string) => void;
  onReorderEnd?: (activeItemId: string, overItemId: string | null) => void;
}) {
  const pointerIdRef = useRef<number | null>(null);
  const dragOriginRef = useRef<{ x: number; y: number } | null>(null);
  const reorderActiveRef = useRef(false);

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
      {/* One click, one thing. It used to select on a click and open on a
        * double, which could not work anywhere the card is actually used: its
        * only surface is the dashboard, and selecting there navigates to the
        * library, so the card was unmounted before the second click landed.
        * The open handler was never passed either, so both halves were dead.
        *
        * A plain button also means Enter and Space activate it for free,
        * instead of the keydown handler that used to reimplement them. */}
      <button className="cardHitArea" type="button" onClick={onActivate}>
        {previewSrc && (
          <div className="cardMedia" aria-hidden="true">
            <img src={previewSrc} alt="" />
          </div>
        )}
        <h2>{getItemTitle(item, t)}</h2>
        {summary && <p>{summary}</p>}
        {/* One line of metadata at the foot, the way a list row reads: the icon
          * carries the type, so the text never repeats it. Links name what they
          * point at, which is more use than the word "link"; everything else
          * names its collection, which the icon cannot say. */}
        <div className="cardInfo">
          <span className="cardInfoIcon" style={{ color: item.accent }}>
            {platform === "youtube-music" ? <Music2 size={18} /> : typeIcons[item.type]}
          </span>
          {platform
            ? `${getLinkKindLabel(item.location, platform, t)} · ${getCollectionLabel(item.collection, t)}`
            : getCollectionLabel(item.collection, t)}
        </div>
      </button>
      <div className="tagRow">
        {item.tags.map((tag) => (
          <button type="button" key={tag} onClick={() => onFilterTag(tag)}>
            #{getTagLabel(tag, t)}
          </button>
        ))}
      </div>
      {/* Both controls overlay the card instead of holding space in it, and
        * stay out of sight until the pointer or the keyboard arrives. */}
      <div className="cardActions">
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
      </div>
    </article>
  );
}
