import { describe, expect, it } from 'vitest';
import { MAX_SHARE, MIN_SHARE, clampShare, dividers, parseSplits, shareFromPointer, splitVars } from '../split';

describe('split sizing', () => {
  it('clamps so a pane can never be dragged shut', () => {
    expect(clampShare(0)).toBe(MIN_SHARE);
    expect(clampShare(1)).toBe(MAX_SHARE);
    expect(clampShare(0.4)).toBe(0.4);
    expect(clampShare(NaN)).toBe(0.5);
  });
  it('turns a pointer position into a share, accounting for padding and the gap', () => {
    // 1000px wide, 4px padding, 4px gap: inner = 988; the boundary centre for 0.5 is 4 + 494 + 2 = 500.
    expect(shareFromPointer(500, 0, 1000, 4, 4)).toBeCloseTo(0.5, 3);
    expect(shareFromPointer(-50, 0, 1000, 4, 4)).toBe(MIN_SHARE);
    expect(shareFromPointer(5000, 0, 1000, 4, 4)).toBe(MAX_SHARE);
    expect(shareFromPointer(10, 0, 0, 4, 4)).toBe(0.5);
  });
  it('knows which dividers each layout has', () => {
    expect(dividers('1')).toEqual({ col: false, row: false, rowsOnRight: false });
    expect(dividers('2h').col).toBe(true);
    expect(dividers('2v').row).toBe(true);
    expect(dividers('3l')).toEqual({ col: true, row: true, rowsOnRight: true });
    expect(dividers('4')).toEqual({ col: true, row: true, rowsOnRight: false });
  });
  it('parses saved sizes defensively', () => {
    expect(parseSplits('nope')).toEqual({});
    expect(parseSplits(JSON.stringify({ '4': { c: 0.3, r: 0.9 }, '2h': { c: 'x', r: 1 }, bogus: { c: 1, r: 1 } }))).toEqual({ '4': { c: 0.3, r: MAX_SHARE } });
  });
  it('emits track weights that always sum well above 1', () => {
    expect(splitVars({ c: 0.62, r: 0.5 })).toMatchObject({ '--cA': '620fr', '--cB': '380fr', '--rA': '500fr', '--rB': '500fr' });
  });
});

import { DEFAULT_LOOK, lookVars, nudgeId, orderPanes, parseLook, swapIds } from '../split';

describe('look and pane order', () => {
  it('parses and clamps saved looks, and turns them into CSS variables (none really is zero)', () => {
    expect(parseLook('junk')).toEqual(DEFAULT_LOOK);
    expect(parseLook(JSON.stringify({ space: 0, border: 0 }))).toEqual({ space: 0, border: 0 });
    expect(parseLook(JSON.stringify({ space: 9, border: -1 }))).toEqual(DEFAULT_LOOK);
    expect(lookVars({ space: 0, border: 0 })).toEqual({ '--el-room-pad': '0px', '--el-room-gap': '0px', '--el-room-bw': '0px' });
    expect(lookVars({ space: 3, border: 3 })).toEqual({ '--el-room-pad': '10px', '--el-room-gap': '10px', '--el-room-bw': '4px' });
  });
  it('applies a saved order, ignoring vanished ids and appending new panes', () => {
    const panes = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    expect(orderPanes(panes, ['c', 'zz', 'a']).map((p) => p.id)).toEqual(['c', 'a', 'b']);
    expect(orderPanes(panes, undefined)).toBe(panes);
  });
  it('swaps and nudges', () => {
    expect(swapIds(['a', 'b', 'c'], 'a', 'c')).toEqual(['c', 'b', 'a']);
    expect(swapIds(['a', 'b'], 'a', 'x')).toEqual(['a', 'b']);
    expect(nudgeId(['a', 'b', 'c'], 'b', -1)).toEqual(['b', 'a', 'c']);
    expect(nudgeId(['a', 'b', 'c'], 'a', -1)).toEqual(['a', 'b', 'c']);
    expect(nudgeId(['a', 'b', 'c'], 'c', 1)).toEqual(['a', 'b', 'c']);
  });
});
