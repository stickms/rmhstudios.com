/** Tier pick, the downscale-only DPR governor and the frame statistics (T25; spec §8.2–8.3, §11.3). */

import { describe, expect, it } from 'vitest';
import {
  GOVERNOR_DPR_FLOOR,
  GOVERNOR_MAX_STEPS,
  GOVERNOR_STEP,
  GOVERNOR_WARMUP_FRAMES,
  GOVERNOR_WINDOW,
} from '../constants';
import { DprGovernor, FrameStatsRecorder, governorTargetFps, pickTier } from '../gl/governor-tiers';

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

/** A governor past its warm-up frames (drawn at a comfortable 60 fps). */
function warm(startDpr: number, refreshHz?: number): DprGovernor {
  const g = new DprGovernor(startDpr, refreshHz);
  feed(g, 1000 / 60, GOVERNOR_WARMUP_FRAMES);
  return g;
}

describe('governorTargetFps', () => {
  it('holds 60 fps panels to ~57 fps and aims near the panel above that, capped at 144', () => {
    expect(governorTargetFps(60)).toBe(57);
    expect(governorTargetFps(120)).toBeCloseTo(114);
    expect(governorTargetFps(144)).toBeCloseTo(136.8);
    expect(governorTargetFps(240)).toBe(144);
  });

  it('a slower panel (or a throttled rAF) is not held to 60', () => {
    expect(governorTargetFps(50)).toBeCloseTo(47.5);
    expect(governorTargetFps(30)).toBeCloseTo(28.5);
  });

  it('an unknown rate is treated as 60 Hz', () => {
    expect(governorTargetFps(Number.NaN)).toBe(57);
    expect(governorTargetFps(0)).toBe(57);
  });
});

describe('DprGovernor', () => {
  it('does nothing at 60 fps', () => {
    const g = new DprGovernor(2);
    expect(feed(g, 1000 / 60, GOVERNOR_WINDOW * 4).every((r) => r === null)).toBe(true);
    expect(g.steps).toBe(0);
    expect(g.scale).toBe(1);
  });

  it('ignores the warm-up frames of a run, however slow', () => {
    const g = new DprGovernor(2);
    expect(feed(g, 50, GOVERNOR_WARMUP_FRAMES).every((r) => r === null)).toBe(true);
    // The window starts empty after them: one more window of good frames steps nothing.
    expect(feed(g, 1000 / 60, GOVERNOR_WINDOW).every((r) => r === null)).toBe(true);
    expect(g.steps).toBe(0);
  });

  it('waits for a full window, then steps by 0.75x', () => {
    const g = warm(2);
    const r = feed(g, 25, GOVERNOR_WINDOW);
    expect(r.slice(0, -1).every((x) => x === null)).toBe(true);
    expect(r.at(-1)).toBeCloseTo(GOVERNOR_STEP);
    expect(g.steps).toBe(1);
  });

  it('takes at most two steps and never goes below the DPR floor', () => {
    const g = warm(2);
    const steps = feed(g, 25, GOVERNOR_WINDOW * 6).filter((x) => x !== null);
    expect(steps).toHaveLength(GOVERNOR_MAX_STEPS);
    expect(g.scale).toBeCloseTo(GOVERNOR_STEP ** 2);
    expect(2 * g.scale).toBeGreaterThanOrEqual(GOVERNOR_DPR_FLOOR);
  });

  it('refuses a step that would cross the floor', () => {
    const g = warm(1);
    expect(feed(g, 25, GOVERNOR_WINDOW * 4).filter((x) => x !== null)).toEqual([GOVERNOR_STEP]);
    const tiny = warm(0.8);
    expect(feed(tiny, 25, GOVERNOR_WINDOW * 4).filter((x) => x !== null)).toEqual([]);
  });

  it('one long stall in a window is not load, nor are a few hitches', () => {
    const g = warm(2);
    feed(g, 1000 / 60, GOVERNOR_WINDOW - 1);
    expect(g.record(500)).toBeNull();
    // Three 50 ms hitches in a window of 60 fps frames: the trimmed mean leaves them out.
    const h = warm(2);
    const r = [...feed(h, 50, 3), ...feed(h, 1000 / 60, GOVERNOR_WINDOW * 2)];
    expect(r.every((x) => x === null)).toBe(true);
    expect(g.steps + h.steps).toBe(0);
  });

  it('a run that drops one frame in five does step', () => {
    const g = warm(2);
    let stepped = false;
    for (let i = 0; i < GOVERNOR_WINDOW * 2 && !stepped; i++)
      stepped = g.record(i % 5 === 0 ? 2000 / 60 : 1000 / 60) !== null;
    expect(stepped).toBe(true);
  });

  it('aims at the display: 70 fps on a 120 Hz panel steps, and does nothing on a 60 Hz one', () => {
    const fast = warm(2, 120);
    expect(feed(fast, 1000 / 70, GOVERNOR_WINDOW).at(-1)).toBeCloseTo(GOVERNOR_STEP);
    const slow = warm(2, 60);
    expect(feed(slow, 1000 / 60, GOVERNOR_WINDOW * 2).every((x) => x === null)).toBe(true);
    // A 120 Hz panel holding its rate is left alone.
    const held = warm(2, 120);
    expect(feed(held, 1000 / 120, GOVERNOR_WINDOW * 2).every((x) => x === null)).toBe(true);
  });

  it('restarts the window after a step, and reset() forgets everything', () => {
    const g = warm(2);
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
