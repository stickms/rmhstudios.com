/**
 * Where keyboard focus should go after a list row is removed (approved, denied,
 * revoked). The removed row's own button unmounts, which would otherwise drop
 * focus to <body>: hand it to the row that took its place, else the previous
 * one, else - when the list is now empty and swaps to an EmptyState - to that.
 */
export type FocusTarget = { kind: 'row'; id: string } | { kind: 'empty' };

export function focusAfterRemoval(ids: readonly string[], removedId: string): FocusTarget {
  const at = ids.indexOf(removedId);
  const remaining = ids.filter((id) => id !== removedId);
  if (remaining.length === 0) return { kind: 'empty' };
  // `at` is the removed row's slot: the next row now sits there; at the end, step back.
  const pick = at === -1 ? 0 : Math.min(at, remaining.length - 1);
  return { kind: 'row', id: remaining[pick] };
}
