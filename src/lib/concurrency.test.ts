import { describe, expect, it } from "vitest";
import { runWithConcurrency } from "./concurrency";

describe("runWithConcurrency", () => {
  it("never exceeds the requested number of in-flight tasks", async () => {
    const entries = Array.from({ length: 20 }, (_, index) => index);
    let inFlight = 0;
    let peak = 0;

    await runWithConcurrency(entries, 4, async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 1));
      inFlight -= 1;
    });

    expect(peak).toBeLessThanOrEqual(4);
    expect(peak).toBeGreaterThan(1);
  });

  it("visits every entry exactly once", async () => {
    const entries = ["a", "b", "c", "d", "e"];
    const seen: string[] = [];

    await runWithConcurrency(entries, 2, async (entry) => {
      seen.push(entry);
    });

    expect(seen.sort()).toEqual([...entries].sort());
  });

  it("keeps going when an entry rejects", async () => {
    const completed: number[] = [];

    await runWithConcurrency([1, 2, 3], 2, async (entry) => {
      if (entry === 2) throw new Error("boom");
      completed.push(entry);
    });

    expect(completed.sort()).toEqual([1, 3]);
  });

  it("handles an empty batch and a limit below one", async () => {
    const seen: number[] = [];

    await runWithConcurrency([], 4, async () => {
      seen.push(0);
    });
    await runWithConcurrency([1, 2], 0, async (entry) => {
      seen.push(entry);
    });

    expect(seen).toEqual([1, 2]);
  });
});
