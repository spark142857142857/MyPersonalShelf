import { describe, expect, it } from "vitest";
import { visibleRange } from "./virtualList";

const base = { rowHeight: 61, count: 1000, viewportHeight: 720, overscan: 6 };

describe("visibleRange", () => {
  it("covers the viewport plus the overscan at the top of the list", () => {
    const { start, end } = visibleRange({ ...base, scrollTop: 0 });

    expect(start).toBe(0);
    // 720 / 61 rounds up to 12 rows on screen, plus six drawn below.
    expect(end).toBe(18);
  });

  it("keeps rows behind the fold so the divider rule still has a sibling", () => {
    const { start, end } = visibleRange({ ...base, scrollTop: 61 * 100 });

    expect(start).toBe(94);
    expect(end).toBe(118);
    // Every row the window actually shows sits inside the slice.
    expect(start).toBeLessThan(100);
    expect(end).toBeGreaterThan(100 + Math.ceil(720 / 61));
  });

  it("never runs past the end of the list", () => {
    const { start, end } = visibleRange({ ...base, scrollTop: 61 * 1000 });

    expect(end).toBe(1000);
    expect(start).toBeLessThanOrEqual(end);
  });

  it("clamps a negative scroll offset, which is what a list below the fold reports", () => {
    const { start, end } = visibleRange({ ...base, scrollTop: -400 });

    expect(start).toBe(0);
    expect(end).toBeGreaterThan(0);
  });

  it("draws everything when the row height is not known yet", () => {
    expect(visibleRange({ ...base, scrollTop: 0, rowHeight: 0 })).toEqual({ start: 0, end: 1000 });
  });

  it("draws everything when the viewport has no height yet", () => {
    expect(visibleRange({ ...base, scrollTop: 0, viewportHeight: 0 })).toEqual({ start: 0, end: 1000 });
  });

  it("handles an empty list", () => {
    expect(visibleRange({ ...base, scrollTop: 0, count: 0 })).toEqual({ start: 0, end: 0 });
  });

  it("returns the whole of a list shorter than the viewport", () => {
    const { start, end } = visibleRange({ ...base, scrollTop: 0, count: 5 });

    expect(start).toBe(0);
    expect(end).toBe(5);
  });

  it("renders far fewer rows than the list holds", () => {
    const { start, end } = visibleRange({ ...base, scrollTop: 61 * 500 });

    expect(end - start).toBeLessThan(30);
  });
});
