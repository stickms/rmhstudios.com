/** Tier pick, the downscale-only DPR governor and the frame statistics (T25; spec §8.2–8.3, §11.3). */

import { describe, expect, it } from 'vitest';
import {
  GOVERNOR_DPR_FLOOR,
  GOVERNOR_MAX_STEPS,
  GOVERNOR_STEP,
  GOVERNOR_WINDOW,
} from '../constants';
import { DprGovernor, FrameStatsRecorder, pickTier } from '../gl/governor-tiers';

describe('pickTier', () => {
  it('maps the site tiers onto the effect tiers', () => {
    const base = { perfLite: false, isMobile: false } as const;
    expect(pickTier({ ...base, renderTier: 'low' })).toBe('low');
    expect(pickTier({ ...base, renderTier: 'medium' })).toBe('mid');
    expect(pickTier({ ...base, renderTier: 'high' })).toBe('high');
    expect(pickTier({ ...base, renderTier: 'ultra' })).toBe('high');
  });

  it('perf-lite forces low and phones are capped at mid', () => {
    expect(pickTier({ renderTier: 'ultra', perfLite: true, isMobile: false })).toBe('low');
    expect(pickTier({ renderTier: 'ultra', perfLite: false, isMobile: true })).toBe('mid');
    expect(pickTier({ renderTier: 'low', perfLite: false, isMobile: true })).toBe('low');
  });
});

function feed(g: DprGovernor, ms: number, n: number): (number | null)[] {
  return Array.from({ length: n }, () => g.record(ms));
}

describe('DprGovernor', () => {
  it('does nothing at 60 fps', () => {
    const g = new DprGovernor(2);
    expect(feed(g, 1000 / 60, GOVERNOR_WINDOW * 4).every((r) => r === null)).toBe(true);
    expect(g.steps).toBe(0);
    expect(g.scale).toBe(1);
  });

  it('waits for a full window, then steps by 0.75x', () => {
    const g = new DprGovernor(2);
    const r = feed(g, 25, GOVERNOR_WINDOW);
    expect(r.slice(0, -1).every((x) => x === null)).toBe(true);
    expect(r.at(-1)).toBeCloseTo(GOVERNOR_STEP);
    expect(g.steps).toBe(1);
  });

  it('takes at most two steps and never goes below the DPR floor', () => {
    const g = new DprGovernor(2);
    const steps = feed(g, 25, GOVERNOR_WINDOW * 6).filter((x) => x !== null);
    expect(steps).toHaveLength(GOVERNOR_MAX_STEPS);
    expect(g.scale).toBeCloseTo(GOVERNOR_STEP ** 2);
    expect(2 * g.scale).toBeGreaterThanOrEqual(GOVERNOR_DPR_FLOOR);
  });

  it('refuses a step that would cross the floor', () => {
    const g = new DprGovernor(1);
    expect(feed(g, 25, GOVERNOR_WINDOW * 4).filter((x) => x !== null)).toEqual([GOVERNOR_STEP]);
    const tiny = new DprGovernor(0.8);
    expect(feed(tiny, 25, GOVERNOR_WINDOW * 4).filter((x) => x !== null)).toEqual([]);
  });

  it('one long stall in a window is not load', () => {
    const g = new DprGovernor(2);
    feed(g, 1000 / 60, GOVERNOR_WINDOW - 1);
    expect(g.record(500)).toBeNull();
    expect(g.steps).toBe(0);
  });

  it('restarts the window after a step, and reset() forgets everything', () => {
    const g = new DprGovernor(2);
    feed(g, 25, GOVERNOR_WINDOW);
    expect(feed(g, 25, GOVERNOR_WINDOW - 1).every((x) => x === null)).toBe(true);
    g.reset();
    expect(g.steps).toBe(0);
    expect(g.scale).toBe(1);
  });
});

describe('FrameStatsRecorder', () => {
  it('counts frames, the first of which has no interval', () => {
    const s = new FrameStatsRecorder();
    s.recordFirst();
    for (let i = 0; i < 9; i++) s.record(16.7);
    expect(s.summary()).toEqual({ frames: 10, dropped: 0, p95: expect.closeTo(16.7, 3) });
  });

  it('flags intervals above 1.5x the median as dropped, and reads p95', () => {
    const s = new FrameStatsRecorder();
    for (let i = 0; i < 90; i++) s.record(16);
    for (let i = 0; i < 10; i++) s.record(40);
    const out = s.summary();
    expect(out.frames).toBe(100);
    expect(out.dropped).toBe(10);
    expect(out.p95).toBe(40);
  });

  it('is empty-safe and resettable', () => {
    const s = new FrameStatsRecorder();
    expect(s.summary()).toEqual({ frames: 0, dropped: 0, p95: 0 });
    s.record(20);
    s.reset();
    expect(s.summary().frames).toBe(0);
  });

  it('keeps counting past its buffer without allocating', () => {
    const s = new FrameStatsRecorder();
    for (let i = 0; i < 10_000; i++) s.record(16);
    expect(s.summary().frames).toBe(10_000);
  });
});
