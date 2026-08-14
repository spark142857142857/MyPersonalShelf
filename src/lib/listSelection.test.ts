import { describe, expect, it } from "vitest";
import { nextSelectionAfterRemoval } from "./listSelection";

const rows = [{ id: "a" }, { id: "b" }, { id: "c" }];

describe("nextSelectionAfterRemoval", () => {
  it("takes the row below the one removed", () => {
    expect(nextSelectionAfterRemoval(rows, "b")).toBe("c");
  });

  it("takes the row above when the last one is removed", () => {
    expect(nextSelectionAfterRemoval(rows, "c")).toBe("b");
  });

  it("takes the row below when the first one is removed", () => {
    expect(nextSelectionAfterRemoval(rows, "a")).toBe("b");
  });

  it("stays where it is rather than jumping to the top", () => {
    const long = ["a", "b", "c", "d", "e", "f"].map((id) => ({ id }));
    expect(nextSelectionAfterRemoval(long, "e")).toBe("f");
    expect(nextSelectionAfterRemoval(long, "e")).not.toBe("a");
  });

  it("falls back to the top when the removed row is not on screen", () => {
    expect(nextSelectionAfterRemoval(rows, "missing")).toBe("a");
  });

  it("clears the selection when nothing is left", () => {
    expect(nextSelectionAfterRemoval([{ id: "only" }], "only")).toBe("");
    expect(nextSelectionAfterRemoval([], "any")).toBe("");
  });
});
