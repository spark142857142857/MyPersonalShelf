import { describe, expect, it } from "vitest";
import { ItemOperationRegistry } from "./itemOperations";

describe("ItemOperationRegistry", () => {
  it("prevents deletion while an item is opening", () => {
    const operations = new ItemOperationRegistry();

    expect(operations.beginOpen("item-1")).toBe(true);
    expect(operations.beginDelete("item-1")).toBe(false);
    operations.endOpen("item-1");
    expect(operations.beginDelete("item-1")).toBe(true);
  });

  it("prevents opening and duplicate deletion while deletion is active", () => {
    const operations = new ItemOperationRegistry();

    expect(operations.beginDelete("item-1")).toBe(true);
    expect(operations.beginOpen("item-1")).toBe(false);
    expect(operations.beginDelete("item-1")).toBe(false);
    expect(operations.beginDelete("item-2")).toBe(false);
    expect(operations.isDeleting("item-1")).toBe(true);
    operations.endDelete("item-1");
    expect(operations.beginOpen("item-1")).toBe(true);
  });
});
