import { describe, expect, it } from 'vitest';
import {
  GHOST_STEP_MS,
  MAX_CHARS_PER_STEP,
  MAX_GHOST_SAMPLES,
  aheadByMs,
  buildSamples,
  ghostPositionAt,
  isPlausibleGhost,
} from '@/lib/rmhtype/ghost';

/** A steady curve: `perStep` characters every 250 ms until `length`. */
function steady(length: number, perStep: number): number[] {
  const out: number[] = [];
  for (let at = perStep; ; at += perStep) {
    if (at >= length) {
      out.push(length);
      return out;
    }
    out.push(at);
  }
}

describe('isPlausibleGhost', () => {
  const length = 200;
  const samples = steady(length, 4); // 4 chars / 250 ms = 192 WPM
  const run = { passageLength: length, timeMs: samples.length * GHOST_STEP_MS };

  it('accepts an honest curve', () => {
    expect(isPlausibleGhost(samples, run)).toBe(true);
  });

  it('rejects a curve that goes backwards', () => {
    const bad = [...samples];
    bad[10] = bad[9]! - 1;
    expect(isPlausibleGhost(bad, run)).toBe(false);
  });

  it('rejects a curve that does not end at the passage length', () => {
    expect(isPlausibleGhost([...samples.slice(0, -1), length - 1], run)).toBe(false);
  });

  it('rejects a duration more than max(500 ms, 5%) from the server time', () => {
    const slack = Math.max(500, run.timeMs * 0.05);
    expect(isPlausibleGhost(samples, { ...run, timeMs: run.timeMs + slack + 100 })).toBe(false);
    expect(isPlausibleGhost(samples, { ...run, timeMs: run.timeMs + slack - 1 })).toBe(true);
  });

  it('rejects a fabricated 400 WPM curve', () => {
    // 400 WPM is 8.33 characters per 250 ms.
    const fast = steady(length, 9);
    expect(isPlausibleGhost(fast, { passageLength: length, timeMs: fast.length * GHOST_STEP_MS })).toBe(false);
  });

  it('allows a step at the speed limit', () => {
    const edge = steady(length, MAX_CHARS_PER_STEP);
    expect(isPlausibleGhost(edge, { passageLength: length, timeMs: edge.length * GHOST_STEP_MS })).toBe(true);
  });

  it('rejects non-integers, negatives, empty and oversized input', () => {
    expect(isPlausibleGhost([], run)).toBe(false);
    expect(isPlausibleGhost('nope', run)).toBe(false);
    expect(isPlausibleGhost([1.5, length], run)).toBe(false);
    expect(isPlausibleGhost([-1, length], run)).toBe(false);
    expect(isPlausibleGhost(new Array(MAX_GHOST_SAMPLES + 1).fill(1), run)).toBe(false);
  });
});

describe('ghostPositionAt', () => {
  const samples = [4, 8, 12];
  it('is 0 before the start and stays at the end after it', () => {
    expect(ghostPositionAt(samples, 0)).toBe(0);
    expect(ghostPositionAt(samples, 5000)).toBe(12);
  });
  it('interpolates between samples', () => {
    expect(ghostPositionAt(samples, 125)).toBeCloseTo(2);
    expect(ghostPositionAt(samples, 250)).toBeCloseTo(4);
    expect(ghostPositionAt(samples, 375)).toBeCloseTo(6);
  });
  it('is 0 for an empty curve', () => {
    expect(ghostPositionAt([], 1000)).toBe(0);
  });
});

describe('aheadByMs', () => {
  it('is positive when this run was faster than the ghost', () => {
    expect(aheadByMs(10_000, 8_600)).toBe(1400);
  });
  it('is negative when it was slower', () => {
    expect(aheadByMs(10_000, 10_800)).toBe(-800);
  });
});

describe('buildSamples', () => {
  it('samples the typed length at each 250 ms step and ends at the final length', () => {
    const out = buildSamples(
      [
        [100, 1],
        [300, 2],
        [520, 3],
      ],
      600,
    );
    expect(out).toEqual([1, 2, 3]);
  });
  it('carries the last length through a pause', () => {
    const out = buildSamples(
      [
        [100, 2],
        [900, 3],
      ],
      900,
    );
    expect(out).toEqual([2, 2, 2, 3]);
  });
});
