import { describe, expect, it } from 'vitest';
import { focusAfterRemoval } from '../focus-after-removal';

describe('focusAfterRemoval', () => {
  const ids = ['a', 'b', 'c'];

  it("hands focus to the row that took the removed row's place", () => {
    expect(focusAfterRemoval(ids, 'a')).toEqual({ kind: 'row', id: 'b' });
    expect(focusAfterRemoval(ids, 'b')).toEqual({ kind: 'row', id: 'c' });
  });

  it('steps back when the last row was removed', () => {
    expect(focusAfterRemoval(ids, 'c')).toEqual({ kind: 'row', id: 'b' });
  });

  it('the LAST remaining row: focus goes to the empty state (the list is replaced)', () => {
    expect(focusAfterRemoval(['only'], 'only')).toEqual({ kind: 'empty' });
  });

  it('a row that is already gone (stale 404) falls back to the first row, or the empty state', () => {
    expect(focusAfterRemoval(ids, 'zzz')).toEqual({ kind: 'row', id: 'a' });
    expect(focusAfterRemoval([], 'zzz')).toEqual({ kind: 'empty' });
  });
});
