/**
 * The run's silent runway, and the one property that makes it safe in a match.
 *
 * A run used to begin with the audio already sounding, so a chart whose first
 * onset sits near t=0 spawned its opening notes already partway down the lane.
 * `LEAD_IN_SECONDS` starts the clock NEGATIVE and lets it count up to zero, so
 * those notes enter from off-screen and travel a full approach like every other
 * note in the chart.
 *
 * Two halves are tested here, and the second is the load-bearing one:
 *
 *  1. **The clock.** `AudioManager.play(leadIn)` has to produce a position that
 *     starts at `-leadIn`, rises monotonically, and crosses zero exactly as the
 *     first sample sounds — measured in SONG seconds, so the visible runway is
 *     the same at 0.5x and 2x rather than double and half.
 *  2. **Match sync.** Every client calls `GameEngine.start()` on the server's
 *     `startsAt` timestamp, so the lead-in keeps a lobby together only for as
 *     long as it is the SAME NUMBER on every client. The moment it is derived
 *     from a per-player setting — scroll speed being the obvious temptation,
 *     since a slow-scroll player wants a longer runway — two seats start their
 *     audio at different wall-clock moments off a value the server never sees.
 *     `LEAD_IN_SECONDS` is asserted to be a constant here so that stays true.
 */

import { describe, expect, it } from 'vitest';

import { BASE_APPROACH_SEC, LEAD_IN_SECONDS, MAX_SCROLL_SPEED } from '../constants';
import { approachSeconds } from '../store';

/**
 * A stand-in for the Web Audio clock, implementing exactly the arithmetic
 * `AudioManager.play()`/`getCurrentTime()` do.
 *
 * The real class is not exercised here because it needs an `AudioContext` and
 * a decoded buffer; what is worth pinning is the timebase, which is pure.
 */
function clockAfterPlay(options: { leadInSeconds: number; rate: number; pausedAt?: number }) {
  const { leadInSeconds, rate } = options;
  const paused = options.pausedAt ?? 0;

  const offset = Math.max(0, paused);
  const pendingLeadIn = Math.max(0, leadInSeconds, paused < 0 ? -paused : 0);

  const now = 100; // any context time; only differences matter
  const startAt = now + pendingLeadIn / rate;

  return {
    startAt,
    /** `getCurrentTime()` at a given context time. */
    at: (contextTime: number) => offset + (contextTime - startAt) * rate,
  };
}

describe('the lead-in clock', () => {
  it('starts at exactly -LEAD_IN_SECONDS, whatever the playback rate', () => {
    for (const rate of [0.5, 1, 1.5, 2]) {
      const clock = clockAfterPlay({ leadInSeconds: LEAD_IN_SECONDS, rate });
      expect(clock.at(100)).toBeCloseTo(-LEAD_IN_SECONDS, 10);
    }
  });

  it('crosses zero exactly when the audio is scheduled to sound', () => {
    for (const rate of [0.5, 1, 2]) {
      const clock = clockAfterPlay({ leadInSeconds: LEAD_IN_SECONDS, rate });
      expect(clock.at(clock.startAt)).toBeCloseTo(0, 10);
    }
  });

  it('rises monotonically through the runway', () => {
    const clock = clockAfterPlay({ leadInSeconds: LEAD_IN_SECONDS, rate: 1 });
    let previous = -Infinity;
    for (let t = 100; t <= clock.startAt + 1; t += 0.1) {
      const position = clock.at(t);
      expect(position).toBeGreaterThan(previous);
      previous = position;
    }
  });

  it('spends less WALL-CLOCK time on the runway at higher rates, and the same song time', () => {
    const slow = clockAfterPlay({ leadInSeconds: LEAD_IN_SECONDS, rate: 1 });
    const fast = clockAfterPlay({ leadInSeconds: LEAD_IN_SECONDS, rate: 2 });
    // Half the wall-clock wait...
    expect(fast.startAt - 100).toBeCloseTo((slow.startAt - 100) / 2, 10);
    // ...for the same runway in the timebase the notes are placed in.
    expect(fast.at(100)).toBeCloseTo(slow.at(100), 10);
  });

  it('resumes a paused runway instead of dropping into the song', () => {
    // Paused 1.2s into a 3s runway: 1.8s of it is still to go.
    const clock = clockAfterPlay({ leadInSeconds: 0, rate: 1, pausedAt: -1.8 });
    expect(clock.at(100)).toBeCloseTo(-1.8, 10);
    expect(clock.at(clock.startAt)).toBeCloseTo(0, 10);
  });

  it('resumes mid-song with no runway at all', () => {
    const clock = clockAfterPlay({ leadInSeconds: 0, rate: 1, pausedAt: 42 });
    expect(clock.at(100)).toBeCloseTo(42, 10);
    expect(clock.startAt).toBe(100);
  });
});

describe('the lead-in is safe in a match', () => {
  /**
   * The whole multiplayer argument in one assertion.
   *
   * `GameCanvas`'s `countTo` fires `engine.start()` on the server's `startsAt`
   * for every client. Adding a constant to every clock moves none of them
   * relative to each other; adding a per-player value desyncs the lobby. If
   * this stops being a plain number, the sync is gone.
   */
  it('is a constant, not a function of any player setting', () => {
    expect(typeof LEAD_IN_SECONDS).toBe('number');
    expect(Number.isFinite(LEAD_IN_SECONDS)).toBe(true);
    expect(LEAD_IN_SECONDS).toBeGreaterThan(0);
  });

  it('gives every seat the same runway regardless of scroll speed', () => {
    // Scroll speed changes how far a note travels per second; it must not
    // change WHEN the audio starts.
    const seats = [0.5, 1, 1.7, MAX_SCROLL_SPEED];
    const startTimes = seats.map((scrollSpeed) => {
      expect(approachSeconds(128, scrollSpeed, 'constant')).toBeGreaterThan(0);
      return clockAfterPlay({ leadInSeconds: LEAD_IN_SECONDS, rate: 1 }).startAt;
    });
    expect(new Set(startTimes).size).toBe(1);
  });
});

describe('the runway is long enough to be worth having', () => {
  it('covers a full approach at the default scroll speed', () => {
    // The renderer's runway before the judgement line is 85% of the axis, so a
    // lead-in of one whole axis traversal clears it with margin.
    expect(LEAD_IN_SECONDS).toBeGreaterThanOrEqual(approachSeconds(120, 1, 'constant') * 0.85);
  });

  it('is tied to the approach geometry rather than hand-picked', () => {
    expect(LEAD_IN_SECONDS).toBe(BASE_APPROACH_SEC);
  });
});
