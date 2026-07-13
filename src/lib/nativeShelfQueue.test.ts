import { describe, expect, it, vi } from "vitest";
import { NativeShelfQueue } from "./nativeShelfQueue";

describe("NativeShelfQueue", () => {
  it("runs saves in order", async () => {
    const queue = new NativeShelfQueue();
    const order: number[] = [];

    const first = queue.enqueueSave(async () => {
      await Promise.resolve();
      order.push(1);
    });
    const second = queue.enqueueSave(async () => {
      order.push(2);
    });

    await Promise.all([first, second]);
    expect(order).toEqual([1, 2]);
  });

  it("exposes active deletion until cleared", async () => {
    const queue = new NativeShelfQueue();
    const deleteItem = vi.fn(async () => undefined);

    const promise = queue.runNativeDelete("item-1", {
      nativeRuntime: true,
      isReaderWindowOpen: async () => false,
      deleteItem,
    });

    expect(queue.getActiveDeletion()?.itemId).toBe("item-1");
    await expect(promise).resolves.toBe(true);
    expect(deleteItem).toHaveBeenCalledWith("item-1");
    queue.clearActiveDeletion();
    expect(queue.getActiveDeletion()).toBeNull();
  });

  it("returns false when a reader window is open", async () => {
    const queue = new NativeShelfQueue();
    const deleteItem = vi.fn(async () => undefined);

    await expect(
      queue.runNativeDelete("item-1", {
        nativeRuntime: true,
        isReaderWindowOpen: async () => true,
        deleteItem,
      }),
    ).resolves.toBe(false);
    expect(deleteItem).not.toHaveBeenCalled();
    queue.clearActiveDeletion();
  });
});
