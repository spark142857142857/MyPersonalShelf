/**
 * The row that should take the selection when the selected one is removed.
 *
 * The neighbour below it, or the one above when it was last. Deleting used to
 * fall back to the first item on the shelf, which sent the reader to the top
 * of the library from wherever they had been working, and did so by way of a
 * filter -- `find(item => item.id !== removedId)` over a list the removed item
 * had already been taken out of -- that could only ever return the first
 * entry.
 *
 * Takes the list as displayed rather than the shelf's own order, because the
 * neighbour that matters is the one the reader can see. Pass the list still
 * containing the removed item; its position is what decides the answer.
 */
export function nextSelectionAfterRemoval<T extends { id: string }>(
  visible: readonly T[],
  removedId: string,
): string {
  const index = visible.findIndex((item) => item.id === removedId);
  if (index < 0) {
    // Not on screen -- deleted from somewhere the library filter hides. Fall
    // back to the top rather than guessing at a neighbour it has no place in.
    return visible[0]?.id ?? "";
  }

  const neighbour = visible[index + 1] ?? visible[index - 1];
  return neighbour?.id ?? "";
}
