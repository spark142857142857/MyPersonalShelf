import type { ContentItem } from "../types";

/**
 * Past this, a document counts as read rather than half-read. Scrolling to the
 * very bottom does not reliably land on 100 — the reader derives progress from
 * scrollTop against scrollable height — so the last few per cent are treated
 * as the end.
 */
export const finishedProgressThreshold = 95;

/**
 * Documents the reader is part-way through, most recently opened first.
 *
 * This is the one thing the shelf knows that its owner might not: what they
 * meant to come back to. The number already existed and was only ever shown
 * inside the reader, which is to say after the item had been found and opened.
 *
 * Media is deliberately absent. Nothing writes an end-of-playback marker and
 * the item does not store a duration, so a finished video keeps its position
 * at the end and would sit here permanently. The media viewer avoids the same
 * trap by comparing against the duration it has loaded, which is not available
 * here. Storing a duration would let media join.
 */
export function findUnfinishedItems(items: readonly ContentItem[], limit = 4): ContentItem[] {
  return items
    .filter((item) => {
      if (item.type !== "document") return false;
      const progress = item.readerProgress;
      // Progress comes out as NaN when a document is too short to scroll,
      // which passes a naive `> 0` check and reads as "0%" on screen.
      return (
        typeof progress === "number" &&
        Number.isFinite(progress) &&
        progress > 0 &&
        progress < finishedProgressThreshold
      );
    })
    .sort((left, right) => (right.lastOpenedAt ?? "").localeCompare(left.lastOpenedAt ?? ""))
    .slice(0, limit);
}
