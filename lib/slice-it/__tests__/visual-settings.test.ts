/**
 * G9 (scroll speed) and V10 (lane cover) — the pure math, plus the store
 * defaults and clamps every settings UI (`MainMenu.tsx`, `GameCanvas.tsx`)
 * relies on.
 *
 * `store.ts`'s `migrate` itself isn't exported (it never has been, for any of
 * the v1→v2 or v2→v3 steps either — see `scoring.test.ts`'s note on why that's
 * tested by construction rather than by simulating a rehydrate), so what's
 * pinned here is the CONTRACT the v3→v4 step promises: every new field has a
 * default that reproduces today's fixed behaviour, so a fresh store (no
 * persisted blob at all, the same shape `migrate` fills a v3 blob in with)
 * plays identically to before this wave.
 */

import { describe, expect, it } from 'vitest';
import { approachSeconds, reactionWindowMs, useSliceItStore } from '../store';
import { BASE_APPROACH_SEC, MAX_LANE_COVER, MAX_SCROLL_SPEED, MIN_SCROLL_SPEED } from '../constants';
import {
  DEFAULT_LINE_POSITION,
  MAX_LINE_POSITION,
  MIN_LINE_POSITION,
  clampLinePosition,
} from '../constants';

describe('approachSeconds (G9)', () => {
  it('reproduces the old fixed ~3-second window at the default setting', () => {
    expect(approachSeconds(140, 1.0, 'constant')).toBe(BASE_APPROACH_SEC);
  });

  it('constant mode is independent of BPM', () => {
    expect(approachSeconds(90, 1.5, 'constant')).toBe(approachSeconds(300, 1.5, 'constant'));
  });

  it('bpm mode scales inversely with tempo — double the BPM, half the lead time', () => {
    const at120 = approachSeconds(120, 1.0, 'bpm');
    const at240 = approachSeconds(240, 1.0, 'bpm');
    expect(at240).toBeCloseTo(at120 / 2, 5);
  });

  it('falls back to the constant-mode value for a missing or invalid BPM', () => {
    expect(approachSeconds(0, 1.0, 'bpm')).toBe(BASE_APPROACH_SEC);
    expect(approachSeconds(-10, 1.0, 'bpm')).toBe(BASE_APPROACH_SEC);
  });

  it('higher scroll speed means less lead time, in both modes', () => {
    expect(approachSeconds(120, 2.0, 'constant')).toBeLessThan(
      approachSeconds(120, 1.0, 'constant'),
    );
    expect(approachSeconds(120, 2.0, 'bpm')).toBeLessThan(approachSeconds(120, 1.0, 'bpm'));
  });

  it('never divides by zero for a non-finite or zero speed input', () => {
    expect(Number.isFinite(approachSeconds(120, 0, 'constant'))).toBe(true);
  });
});

describe('reactionWindowMs (V10 — the "green number")', () => {
  it('is the whole approach window with no cover', () => {
    expect(reactionWindowMs(3.0, 0)).toBe(3000);
  });

  it('shrinks proportionally with the cover fraction', () => {
    expect(reactionWindowMs(3.0, 0.5)).toBe(1500);
  });

  it('rounds to the nearest millisecond', () => {
    expect(reactionWindowMs(1.0, 0.333)).toBe(667);
  });

  it('is never negative even at the maximum lane cover', () => {
    expect(reactionWindowMs(3.0, MAX_LANE_COVER)).toBeGreaterThanOrEqual(0);
  });
});

describe('store v3→v4 defaults', () => {
  it('ships mirror off and fadeOut visibility — the pre-wave experience, unchanged', () => {
    const state = useSliceItStore.getState();
    expect(state.mirror).toBe(false);
    expect(state.scrollSpeed).toBe(1.0);
    expect(state.scrollMode).toBe('constant');
    expect(state.visibilityMode).toBe('fadeOut');
    expect(state.laneCoverHeight).toBeGreaterThanOrEqual(0);
    expect(state.laneCoverHeight).toBeLessThanOrEqual(MAX_LANE_COVER);
  });

  it('a default store reproduces the old fixed approach window exactly', () => {
    const state = useSliceItStore.getState();
    expect(approachSeconds(120, state.scrollSpeed, state.scrollMode)).toBe(BASE_APPROACH_SEC);
  });

  it('setScrollSpeed clamps to [MIN_SCROLL_SPEED, MAX_SCROLL_SPEED]', () => {
    useSliceItStore.getState().setScrollSpeed(99);
    expect(useSliceItStore.getState().scrollSpeed).toBe(MAX_SCROLL_SPEED);
    useSliceItStore.getState().setScrollSpeed(-5);
    expect(useSliceItStore.getState().scrollSpeed).toBe(MIN_SCROLL_SPEED);
    useSliceItStore.getState().setScrollSpeed(1.0);
  });

  it('setLaneCoverHeight clamps to [0, MAX_LANE_COVER]', () => {
    useSliceItStore.getState().setLaneCoverHeight(5);
    expect(useSliceItStore.getState().laneCoverHeight).toBe(MAX_LANE_COVER);
    useSliceItStore.getState().setLaneCoverHeight(-1);
    expect(useSliceItStore.getState().laneCoverHeight).toBe(0);
    useSliceItStore.getState().setLaneCoverHeight(0.3);
  });

  it('setMirror / setVisibilityMode / setScrollMode round-trip', () => {
    useSliceItStore.getState().setMirror(true);
    expect(useSliceItStore.getState().mirror).toBe(true);
    useSliceItStore.getState().setVisibilityMode('flashlight');
    expect(useSliceItStore.getState().visibilityMode).toBe('flashlight');
    useSliceItStore.getState().setScrollMode('bpm');
    expect(useSliceItStore.getState().scrollMode).toBe('bpm');

    // Restore defaults — this store is a module-level singleton shared with
    // every other test file that imports it in the same run.
    useSliceItStore.getState().setMirror(false);
    useSliceItStore.getState().setVisibilityMode('fadeOut');
    useSliceItStore.getState().setScrollMode('constant');
  });
});

/* ─── G11 — judgement-line position ──────────────────────────────────────── */

describe('clampLinePosition', () => {
  it('reproduces the shipped geometry at its default', () => {
    // The renderer used `h * 0.85` in portrait and `w * 0.15` in landscape.
    // Both are "15% of the axis remains after the line", which is why one
    // number expresses both orientations.
    expect(DEFAULT_LINE_POSITION).toBe(0.15);
    expect(1 - DEFAULT_LINE_POSITION).toBeCloseTo(0.85, 5);
  });

  it('clamps to a range a player can still read', () => {
    expect(clampLinePosition(0)).toBe(MIN_LINE_POSITION);
    expect(clampLinePosition(1)).toBe(MAX_LINE_POSITION);
    expect(clampLinePosition(0.25)).toBe(0.25);
  });

  it('falls back rather than propagating a NaN into the geometry', () => {
    // A NaN here would put the judgement line at NaN pixels and blank the
    // playfield — the failure would look like the renderer dying, not like a
    // bad setting.
    expect(clampLinePosition(Number.NaN)).toBe(DEFAULT_LINE_POSITION);
  });
});
