/**
 * The three things that can be wrong with a shelf, gathered into one place.
 *
 * Each was already tracked and each surfaced somewhere different: broken paths
 * behind a filter chip in the library, Inbox in a tinted banner across the top
 * of two views, duplicates in a section of the settings page that nothing
 * pointed at. Three chores, three volumes, and no single answer to "is there
 * anything to do".
 */
export type ShelfHealthKind = "brokenPaths" | "duplicates" | "inbox";

export interface ShelfHealthEntry {
  kind: ShelfHealthKind;
  count: number;
}

export interface ShelfHealthCounts {
  /** Only meaningful once a path scan has run, so zero elsewhere. */
  brokenPathCount: number;
  duplicateGroupCount: number;
  inboxCount: number;
}

/**
 * Ordered by what each one costs its reader. A broken path means the item
 * cannot be opened at all; a duplicate means the shelf holds the same thing
 * twice; Inbox means only that something has not been filed yet, which is
 * where everything starts and is not a fault.
 *
 * Zero counts are dropped rather than shown as "0", so an empty result means
 * there is nothing to say and the line does not appear.
 */
export function collectShelfHealth(counts: ShelfHealthCounts): ShelfHealthEntry[] {
  const ordered: ShelfHealthEntry[] = [
    { kind: "brokenPaths", count: counts.brokenPathCount },
    { kind: "duplicates", count: counts.duplicateGroupCount },
    { kind: "inbox", count: counts.inboxCount },
  ];
  return ordered.filter((entry) => entry.count > 0);
}
