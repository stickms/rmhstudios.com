/**
 * M1 — Mirror.
 *
 * `applyMirror` is the reference transform documented in `chart.ts` as not
 * wired into `prepareChart` this wave (the live game applies the equivalent
 * flip at the render/input boundary instead — see `GameCanvas.tsx`
 * `mirrorLane`). These tests pin the transform itself: an involution that
 * swaps lanes and touches nothing else, so a future caller — an engine change,
 * a replay, a server-side render — can reach for it with confidence.
 */

import { describe, expect, it } from 'vitest';
import { applyMirror } from '../chart';
import type { Slice } from '../types';

const slice = (lane: number, overrides: Partial<Slice> = {}): Slice => ({
  id: `s-${lane}-${Math.random()}`,
  time: 1,
  type: 'STANDARD',
  lane,
  ...overrides,
});

describe('applyMirror', () => {
  it('swaps lane 0 and lane 1 in a 2K chart', () => {
    const out = applyMirror([slice(0), slice(1)], 2);
    expect(out.map((s) => s.lane)).toEqual([1, 0]);
  });

  it('is its own inverse', () => {
    const original = [slice(0), slice(1), slice(0)];
    const twice = applyMirror(applyMirror(original, 2), 2);
    expect(twice.map((s) => s.lane)).toEqual(original.map((s) => s.lane));
  });

  it('does not mutate the input and returns fresh slice objects', () => {
    const original = [slice(0)];
    const out = applyMirror(original, 2);
    expect(original[0].lane).toBe(0);
    expect(out).not.toBe(original);
    expect(out[0]).not.toBe(original[0]);
  });

  it('generalises beyond 2K (G2 4K, if it ever ships)', () => {
    const out = applyMirror([slice(0), slice(3)], 4);
    expect(out.map((s) => s.lane)).toEqual([3, 0]);
  });

  it('changes lane and nothing else', () => {
    const out = applyMirror([slice(0, { type: 'BOMB', quant: 2, duration: 0.5 })], 2);
    expect(out[0]).toMatchObject({ type: 'BOMB', quant: 2, duration: 0.5, lane: 1 });
  });

  it('preserves note order', () => {
    const original = [slice(0), slice(1), slice(0), slice(1)];
    const out = applyMirror(original, 2);
    expect(out.map((s) => s.id)).toEqual(original.map((s) => s.id));
  });
});
