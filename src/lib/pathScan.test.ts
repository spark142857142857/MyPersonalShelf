import { describe, expect, it } from "vitest";
import { collectFailures } from "./pathScan";

const idOf = (item: { id: string }) => item.id;

function items(count: number) {
  return Array.from({ length: count }, (_, index) => ({ id: `item-${index}` }));
}

describe("collectFailures", () => {
  it("returns only the items whose check threw", async () => {
    const failures = await collectFailures(items(5), idOf, async (item) => {
      if (item.id === "item-1" || item.id === "item-4") {
        throw new Error("missing");
      }
    });

    expect([...failures].sort()).toEqual(["item-1", "item-4"]);
  });

  it("checks every item exactly once", async () => {
    const seen: string[] = [];
    await collectFailures(items(20), idOf, async (item) => {
      seen.push(item.id);
    }, 4);

    expect(seen).toHaveLength(20);
    expect(new Set(seen).size).toBe(20);
  });

  it("never runs more checks at once than the limit allows", async () => {
    let inFlight = 0;
    let peak = 0;

    await collectFailures(items(30), idOf, async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 1));
      inFlight -= 1;
    }, 5);

    expect(peak).toBe(5);
  });

  it("does not spawn more workers than there are items", async () => {
    let inFlight = 0;
    let peak = 0;

    await collectFailures(items(2), idOf, async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 1));
      inFlight -= 1;
    }, 8);

    expect(peak).toBe(2);
  });

  it("keeps going after a failure rather than stopping the pool", async () => {
    const seen: string[] = [];
    const failures = await collectFailures(items(6), idOf, async (item) => {
      seen.push(item.id);
      throw new Error("all missing");
    }, 2);

    expect(seen).toHaveLength(6);
    expect(failures.size).toBe(6);
  });

  it("handles an empty shelf without running anything", async () => {
    let calls = 0;
    const failures = await collectFailures([], idOf, async () => {
      calls += 1;
    });

    expect(calls).toBe(0);
    expect(failures.size).toBe(0);
  });
});
