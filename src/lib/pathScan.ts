/**
 * Runs a check over many items and collects the ones that failed.
 *
 * The path scan used to be a plain `for … await`, which meant one IPC round
 * trip to the Rust side at a time: a shelf of a few hundred local files spent
 * most of the scan waiting rather than working. Nothing about checking whether
 * a file exists needs to be ordered, so a small pool of workers shares the
 * queue instead.
 *
 * `next` is read and incremented between awaits, which is atomic here — the
 * event loop cannot interleave two workers inside that expression — so each
 * index is handed out exactly once.
 */
export async function collectFailures<T>(
  items: readonly T[],
  keyOf: (item: T) => string,
  check: (item: T) => Promise<unknown>,
  limit = 8,
): Promise<Set<string>> {
  const failures = new Set<string>();
  if (items.length === 0) {
    return failures;
  }

  let next = 0;
  const workerCount = Math.max(1, Math.min(limit, items.length));

  async function worker() {
    let index = next++;
    while (index < items.length) {
      const item = items[index];
      try {
        await check(item);
      } catch {
        failures.add(keyOf(item));
      }
      index = next++;
    }
  }

  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return failures;
}
