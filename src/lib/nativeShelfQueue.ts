export type ActiveDeletion = {
  itemId: string;
  promise: Promise<boolean>;
};

/**
 * Serializes native save/delete work and exposes the in-flight deletion
 * so close handlers and pre-open persists can avoid resurrecting items.
 */
export class NativeShelfQueue {
  private saveQueue: Promise<void> = Promise.resolve();
  private activeDeletion: ActiveDeletion | null = null;

  getActiveDeletion() {
    return this.activeDeletion;
  }

  enqueueSave(save: () => Promise<void>): Promise<void> {
    this.saveQueue = this.saveQueue.catch(() => undefined).then(save);
    return this.saveQueue;
  }

  /**
   * Queues a native delete (or no-ops in browser). Resolves false when a
   * reader window is still open for the item.
   */
  runNativeDelete(
    itemId: string,
    options: {
      nativeRuntime: boolean;
      isReaderWindowOpen: (itemId: string) => Promise<boolean>;
      deleteItem: (itemId: string) => Promise<void>;
    },
  ): Promise<boolean> {
    const promise = (async () => {
      if (!options.nativeRuntime) return true;
      if (await options.isReaderWindowOpen(itemId)) return false;
      await this.enqueueSave(() => options.deleteItem(itemId));
      return true;
    })();
    this.activeDeletion = { itemId, promise };
    return promise;
  }

  clearActiveDeletion() {
    this.activeDeletion = null;
  }

  async awaitActiveDeletion() {
    const active = this.activeDeletion;
    if (active) {
      await active.promise;
    }
  }
}
