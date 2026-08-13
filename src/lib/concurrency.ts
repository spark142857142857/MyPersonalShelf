/**
 * Runs `work` over every entry with at most `limit` in flight at once.
 *
 * Importing a bookmark file can add hundreds of links at a time; firing one
 * request per link simultaneously floods the network and the remote services.
 * Rejections from `work` are swallowed so a single failure cannot abort the
 * rest of the batch.
 */
export async function runWithConcurrency<T>(
  entries: readonly T[],
  limit: number,
  work: (entry: T) => Promise<void>,
): Promise<void> {
  if (entries.length === 0) return;

  const workerCount = Math.max(1, Math.min(Math.floor(limit) || 1, entries.length));
  let nextIndex = 0;

  async function runWorker() {
    while (nextIndex < entries.length) {
      const index = nextIndex;
      nextIndex += 1;
      try {
        await work(entries[index]);
      } catch {
        // One failed entry must not stop the rest of the batch.
      }
    }
  }

  await Promise.all(Array.from({ length: workerCount }, runWorker));
}
