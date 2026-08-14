/** Rows the library draws beyond the viewport, above and below. */
export const defaultOverscan = 6;

/**
 * Which slice of a uniform-height list is worth rendering.
 *
 * The library drew every row it had. At a thousand items that is ten thousand
 * DOM nodes for the twelve rows a 720px window can show, and re-rendering them
 * blocked the main thread for over a tenth of a second on any keystroke that
 * widened the result set.
 *
 * Rows are a fixed height because their title and subtitle are both clipped to
 * one line, so the slice is arithmetic rather than measurement. The overscan
 * matters for more than smooth scrolling: the list draws its dividers with
 * `.listItemRow + .listItemRow`, so the first rendered row never has one, and
 * keeping rows above the fold rendered is what stops that showing.
 */
export function visibleRange({
  scrollTop,
  viewportHeight,
  rowHeight,
  count,
  overscan = defaultOverscan,
}: {
  scrollTop: number;
  viewportHeight: number;
  rowHeight: number;
  count: number;
  overscan?: number;
}): { start: number; end: number } {
  // A row height of zero would divide by nothing, and a list measured before
  // it has laid out reports one. Drawing everything is slow but correct, and
  // the next measurement fixes it.
  if (count <= 0 || rowHeight <= 0 || viewportHeight <= 0) {
    return { start: 0, end: Math.max(0, count) };
  }

  const firstVisible = Math.floor(scrollTop / rowHeight);
  const lastVisible = Math.ceil((scrollTop + viewportHeight) / rowHeight);

  const start = Math.min(Math.max(firstVisible - overscan, 0), count);
  const end = Math.min(Math.max(lastVisible + overscan, start), count);

  return { start, end };
}
