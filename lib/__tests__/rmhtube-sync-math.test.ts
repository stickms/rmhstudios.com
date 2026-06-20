/**
 * Unit tests for the RmhTube sync timeline math.
 *
 * These pure helpers are the heart of the robustness work: the server uses them
 * to advance the playhead even when the leader's reports stall, and the client
 * uses them to compute its correction target.
 */

import { describe, it, expect } from 'vitest';
import { extrapolate, reanchor } from '@/lib/rmhtube/sync-math';
import type { VideoState } from '@/lib/rmhtube/types';

const base = (over: Partial<VideoState> = {}): VideoState => ({
  playing: true,
  currentTime: 100,
  playbackRate: 1,
  updatedAt: 10_000,
  ...over,
});

describe('extrapolate', () => {
  it('advances by elapsed wall-clock while playing', () => {
    // 5s later at 1x → +5s
    expect(extrapolate(base(), 15_000)).toBeCloseTo(105, 5);
  });

  it('scales by playback rate', () => {
    // 5s later at 2x → +10s
    expect(extrapolate(base({ playbackRate: 2 }), 15_000)).toBeCloseTo(110, 5);
  });

  it('does not advance while paused', () => {
    expect(extrapolate(base({ playing: false }), 999_999)).toBe(100);
  });

  it('never goes backwards if serverNow precedes updatedAt (clock skew)', () => {
    // A momentarily-bad clock must not rewind the playhead.
    expect(extrapolate(base(), 9_000)).toBe(100);
  });
});

describe('reanchor', () => {
  it('moves currentTime to the effective position and re-stamps updatedAt', () => {
    const r = reanchor(base(), 15_000);
    expect(r.currentTime).toBeCloseTo(105, 5);
    expect(r.updatedAt).toBe(15_000);
    expect(r.playing).toBe(true);
    expect(r.playbackRate).toBe(1);
  });

  it('is idempotent in value for a paused state', () => {
    const r = reanchor(base({ playing: false }), 20_000);
    expect(r.currentTime).toBe(100);
    expect(r.updatedAt).toBe(20_000);
  });
});
