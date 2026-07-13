import { describe, expect, it } from "vitest";
import { reorderDashboardLayouts } from "./dashboardLayouts";
import type { DashboardLayoutItem } from "../types";

function layout(itemId: string, order: number): DashboardLayoutItem {
  return { itemId, order, size: "standard", hidden: false };
}

describe("reorderDashboardLayouts", () => {
  it("moves an item before another item and reindexes order", () => {
    const layouts = [layout("a", 0), layout("b", 1), layout("c", 2)];
    expect(reorderDashboardLayouts(layouts, "c", "a").map((entry) => entry.itemId)).toEqual([
      "c",
      "a",
      "b",
    ]);
  });

  it("returns the same order when ids match or are missing", () => {
    const layouts = [layout("a", 0), layout("b", 1)];
    expect(reorderDashboardLayouts(layouts, "a", "a")).toEqual(layouts);
    expect(reorderDashboardLayouts(layouts, "a", "missing")).toEqual(layouts);
  });
});
