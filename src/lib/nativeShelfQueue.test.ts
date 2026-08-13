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

  it("collapses queued state saves down to the newest snapshot", async () => {
    const queue = new NativeShelfQueue();
    const written: string[] = [];
    let releaseFirst = () => {};
    const firstStarted = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });

    // Occupy the queue so the following writes have to wait behind it.
    const blocking = queue.enqueueSave(async () => {
      await firstStarted;
      written.push("blocking");
    });

    const stale = queue.enqueueStateSave(async () => {
      written.push("stale");
    });
    const newer = queue.enqueueStateSave(async () => {
      written.push("newer");
    });
    const newest = queue.enqueueStateSave(async () => {
      written.push("newest");
    });

    releaseFirst();
    await Promise.all([blocking, stale, newer, newest]);

    expect(written).toEqual(["blocking", "newest"]);
  });

  it("keeps state saves ordered against deletes", async () => {
    const queue = new NativeShelfQueue();
    const order: string[] = [];

    const save = queue.enqueueStateSave(async () => {
      await Promise.resolve();
      order.push("save");
    });
    const deletion = queue.runNativeDelete("item-1", {
      nativeRuntime: true,
      isReaderWindowOpen: async () => false,
      deleteItem: async () => {
        order.push("delete");
      },
    });

    await Promise.all([save, deletion]);
    queue.clearActiveDeletion();
    expect(order).toEqual(["save", "delete"]);
  });

  it("runs a later state save after an earlier batch has drained", async () => {
    const queue = new NativeShelfQueue();
    const written: string[] = [];

    await queue.enqueueStateSave(async () => {
      written.push("first");
    });
    await queue.enqueueStateSave(async () => {
      written.push("second");
    });

    expect(written).toEqual(["first", "second"]);
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
