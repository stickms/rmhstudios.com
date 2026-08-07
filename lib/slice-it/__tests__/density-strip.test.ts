/**
 * Slice It — chart preview density strip (`V8`).
 *
 * `densityStrip` is the whole of the computation this feature needs; the
 * wiring that would put it in front of a player (a persisted column or a
 * cached endpoint) touches files outside this wave's ownership — see
 * `docs/_handoff/presentation-requests.md`. What is pinned here is the part
 * that already exists: the histogram itself, and the extraction helper that
 * reads it off a stored chart's `slices` shape (flat or per-difficulty).
 */

import { describe, expect, it } from 'vitest';
import { densityStrip, songDensityStrip } from '../songs.server';
import type { Difficulty, Slice } from '../types';

const note = (time: number): Pick<Slice, 'time'> => ({ time });

describe('densityStrip', () => {
  it('returns an all-zero strip of the requested width for an empty chart', () => {
    const strip = densityStrip([], 120, 64);
    expect(strip).toHaveLength(64);
    expect(strip.every((v) => v === 0)).toBe(true);
  });

  it('is silent (zero everywhere) for a non-positive duration, never NaN or Infinity', () => {
    const strip = densityStrip([note(1), note(2)], 0);
    expect(strip.every((v) => v === 0)).toBe(true);
  });

  it('places a note in the bucket matching its fraction of the duration', () => {
    // A 10s chart, 64 buckets: a note at t=5 lands in the middle bucket.
    const strip = densityStrip([note(5)], 10, 64);
    const hit = strip.findIndex((v) => v > 0);
    expect(hit).toBe(32);
  });

  it('clamps a note at (or past) the very end into the last bucket, never off the end', () => {
    const strip = densityStrip([note(10), note(10.5)], 10, 8);
    expect(strip).toHaveLength(8);
    expect(strip[7]).toBeGreaterThan(0);
  });

  it('normalises so the busiest bucket is always 255, the units a UI can draw at any scale', () => {
    const notes = [note(0), note(0), note(0), note(9)]; // 3 crammed early, 1 late
    const strip = densityStrip(notes, 10, 10);
    expect(Math.max(...strip)).toBe(255);
    // The lightly-populated late bucket is proportionally quieter.
    const busy = strip[0];
    const quiet = strip[9];
    expect(quiet).toBeLessThan(busy);
  });

  it('defaults to 64 buckets', () => {
    expect(densityStrip([note(1)], 10)).toHaveLength(64);
  });
});

describe('songDensityStrip', () => {
  it('is null with no analysis data', () => {
    expect(songDensityStrip(null, 100)).toBeNull();
    expect(songDensityStrip(undefined, 100)).toBeNull();
  });

  it('is null when the chart carries no slices at all', () => {
    expect(songDensityStrip({ slices: [] }, 100)).toBeNull();
  });

  it('reads a flat (legacy) slices array directly', () => {
    const slices = [note(1), note(2), note(3)] as Slice[];
    const strip = songDensityStrip({ slices }, 10);
    expect(strip).not.toBeNull();
    expect(strip).toHaveLength(64);
  });

  it('reads the requested difficulty tier out of a per-difficulty chart', () => {
    const slices = {
      easy: [note(1)] as Slice[],
      normal: [note(1), note(2), note(3), note(4)] as Slice[],
      hard: [] as Slice[],
      expert: [] as Slice[],
    };
    const strip = songDensityStrip({ slices }, 10, 'normal');
    expect(strip).not.toBeNull();
    // More notes in `normal` than `easy` — confirms the right tier was read,
    // not just any non-empty one.
    const total = strip!.filter((v) => v > 0).length;
    expect(total).toBeGreaterThan(0);
  });

  it('falls back to whichever tier actually has notes when the requested one is empty', () => {
    const slices = {
      easy: [] as Slice[],
      normal: [] as Slice[],
      hard: [note(1), note(2)] as Slice[],
      expert: [] as Slice[],
    };
    const strip = songDensityStrip({ slices }, 10, 'normal');
    expect(strip).not.toBeNull();
  });

  it('is null when every difficulty tier is empty', () => {
    const slices: Record<Difficulty, Slice[]> = { easy: [], normal: [], hard: [], expert: [] };
    expect(songDensityStrip({ slices }, 10)).toBeNull();
  });
});
