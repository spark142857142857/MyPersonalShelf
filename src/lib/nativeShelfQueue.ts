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
  private pendingStateSave: (() => Promise<void>) | null = null;
  private pendingStateSavePromise: Promise<void> | null = null;

  getActiveDeletion() {
    return this.activeDeletion;
  }

  enqueueSave(save: () => Promise<void>): Promise<void> {
    this.saveQueue = this.saveQueue.catch(() => undefined).then(save);
    return this.saveQueue;
  }

  /**
   * Queues a whole-shelf state write. Successive calls that arrive before the
   * queue drains replace each other: only the newest snapshot is worth writing,
   * and writing every intermediate one costs a full serialize per keystroke.
   * Ordering against deletes is preserved because both share `saveQueue`.
   */
  enqueueStateSave(save: () => Promise<void>): Promise<void> {
    if (this.pendingStateSavePromise) {
      this.pendingStateSave = save;
      return this.pendingStateSavePromise;
    }

    this.pendingStateSave = save;
    const runPending = () => {
      const next = this.pendingStateSave;
      this.pendingStateSave = null;
      this.pendingStateSavePromise = null;
      return next ? next() : Promise.resolve();
    };

    this.pendingStateSavePromise = this.saveQueue.catch(() => undefined).then(runPending);
    this.saveQueue = this.pendingStateSavePromise.catch(() => undefined);
    return this.pendingStateSavePromise;
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
