import { describe, it, expect } from 'vitest';

import {
  applySelection,
  intentFromModifiers,
  pruneSelection,
  rangeIds,
  type SelectionState,
} from '@/hooks/useMultiSelect';

/**
 * B9 — the range/anchor arithmetic behind shift-click and shift-arrow, which is
 * the part of a multi-select that is quietly easy to get wrong (anchor drift,
 * off-by-one at the ends, a stale id surviving a delete and inflating the
 * action bar's count).
 *
 * The reducer is pure by design so this suite needs no DOM: the React hook is a
 * thin `useState` around exactly these functions.
 */

const IDS = ['a', 'b', 'c', 'd', 'e'];
const empty: SelectionState = { selected: new Set(), anchorIndex: null };

function sorted(state: SelectionState): string[] {
  return IDS.filter((id) => state.selected.has(id));
}

describe('intentFromModifiers', () => {
  it('reads plain / ctrl / cmd / shift the way every file manager does', () => {
    expect(intentFromModifiers({})).toBe('replace');
    expect(intentFromModifiers({ ctrlKey: true })).toBe('toggle');
    expect(intentFromModifiers({ metaKey: true })).toBe('toggle');
    expect(intentFromModifiers({ shiftKey: true })).toBe('range');
  });

  it('lets shift win when both modifiers are held', () => {
    expect(intentFromModifiers({ shiftKey: true, metaKey: true })).toBe('range');
  });
});

describe('rangeIds', () => {
  it('is inclusive and direction-agnostic', () => {
    expect(rangeIds(IDS, 1, 3)).toEqual(['b', 'c', 'd']);
    expect(rangeIds(IDS, 3, 1)).toEqual(['b', 'c', 'd']);
    expect(rangeIds(IDS, 2, 2)).toEqual(['c']);
  });

  it('clamps to the list rather than returning undefined slots', () => {
    expect(rangeIds(IDS, -5, 1)).toEqual(['a', 'b']);
    expect(rangeIds(IDS, 3, 99)).toEqual(['d', 'e']);
    expect(rangeIds([], 0, 2)).toEqual([]);
  });
});

describe('applySelection', () => {
  it('replaces the selection on a plain click', () => {
    const first = applySelection(empty, IDS, 1, 'replace');
    expect(sorted(first)).toEqual(['b']);
    const second = applySelection(first, IDS, 3, 'replace');
    expect(sorted(second)).toEqual(['d']);
  });

  it('toggles one row on ctrl/cmd click and keeps the rest', () => {
    let state = applySelection(empty, IDS, 0, 'replace');
    state = applySelection(state, IDS, 2, 'toggle');
    expect(sorted(state)).toEqual(['a', 'c']);
    state = applySelection(state, IDS, 0, 'toggle');
    expect(sorted(state)).toEqual(['c']);
  });

  it('extends a range from the anchor, in both directions', () => {
    let state = applySelection(empty, IDS, 3, 'replace');
    state = applySelection(state, IDS, 1, 'range');
    expect(sorted(state)).toEqual(['b', 'c', 'd']);
    // Pivoting back past the anchor re-derives the range rather than growing it.
    state = applySelection(state, IDS, 4, 'range');
    expect(sorted(state)).toEqual(['d', 'e']);
  });

  it('does not move the anchor while ranging, so shift can pivot', () => {
    const anchored = applySelection(empty, IDS, 2, 'replace');
    const ranged = applySelection(anchored, IDS, 4, 'range');
    expect(ranged.anchorIndex).toBe(2);
  });

  it('treats a range with no anchor as a plain pick', () => {
    const state = applySelection(empty, IDS, 2, 'range');
    expect(sorted(state)).toEqual(['c']);
    expect(state.anchorIndex).toBe(2);
  });

  it('ignores an index outside the list', () => {
    expect(applySelection(empty, IDS, 99, 'replace')).toBe(empty);
    expect(applySelection(empty, IDS, -1, 'toggle')).toBe(empty);
  });
});

describe('pruneSelection', () => {
  it('drops ids that are no longer in the list', () => {
    const state: SelectionState = { selected: new Set(['a', 'c', 'zz']), anchorIndex: 2 };
    const pruned = pruneSelection(state, IDS);
    expect([...pruned.selected].sort()).toEqual(['a', 'c']);
  });

  it('returns the same object when nothing changed (no re-render churn)', () => {
    const state: SelectionState = { selected: new Set(['a']), anchorIndex: 0 };
    expect(pruneSelection(state, IDS)).toBe(state);
  });

  it('drops an anchor that now points past the end of the list', () => {
    const state: SelectionState = { selected: new Set(['a', 'gone']), anchorIndex: 7 };
    expect(pruneSelection(state, IDS).anchorIndex).toBeNull();
  });
});
