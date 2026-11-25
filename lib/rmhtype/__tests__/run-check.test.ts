/**
 * The one check every scored RMHType run goes through (sprint 12 17): each reason a run is not ranked, the clamping of
 * a client's figures, live progress that only goes forward and never faster than a person types, and an honest run
 * that scores exactly as it did before the check existed.
 */
import { describe, expect, it } from 'vitest';
import { GHOST_STEP_MS, MAX_CHARS_PER_STEP, buildSamples } from '../ghost';
import { clampProgress, clampRunCounts, evaluateFinish } from '../run-check';
import * as challenges from '../challenges';
import { MAX_WPM } from '../typing-run';

/** A curve for a run that types one character every `msPerChar` ms. */
function curve(length: number, msPerChar: number): { samples: number[]; timeMs: number } {
  const marks: [number, number][] = [];
  for (let i = 1; i <= length; i++) marks.push([i * msPerChar, i]);
  const timeMs = length * msPerChar;
  return { samples: buildSamples(marks, timeMs), timeMs };
}

describe('evaluateFinish: the reason a run is not ranked', () => {
  const LENGTH = 200;

  it('has no reason for an honest full run, and scores it from the server clock', () => {
    const { samples, timeMs } = curve(LENGTH, 150); // 80 WPM
    const f = evaluateFinish({ passageLength: LENGTH, position: LENGTH, errors: 4, timeMs, samples });
    expect(f).toMatchObject({ finished: true, reason: null, position: LENGTH, errors: 4 });
    expect(f.wpm).toBeCloseTo(80, 6);
    expect(f.accuracy).toBeCloseTo(98, 6);
  });

  it('says `short` when the position does not reach the end, however good the curve', () => {
    const { samples, timeMs } = curve(LENGTH, 150);
    expect(evaluateFinish({ passageLength: LENGTH, position: LENGTH - 1, errors: 0, timeMs, samples })).toMatchObject({
      finished: false,
      reason: 'short',
    });
  });

  it('says `short` for no position at all, and for a time that is not positive', () => {
    expect(evaluateFinish({ passageLength: LENGTH, position: 0, errors: 0, timeMs: 5000, samples: [] }).reason).toBe(
      'short',
    );
    expect(
      evaluateFinish({ passageLength: LENGTH, position: 'many', errors: 0, timeMs: 5000, samples: [] }).reason,
    ).toBe('short');
    expect(evaluateFinish({ passageLength: LENGTH, position: LENGTH, errors: 0, timeMs: 0, samples: [] }).reason).toBe(
      'short',
    );
  });

  it('says `too-fast` for the whole passage one second in, even with a curve that fits the claim', () => {
    const f = evaluateFinish({
      passageLength: LENGTH,
      position: LENGTH,
      errors: 0,
      timeMs: 1000,
      samples: [50, 100, 150, LENGTH],
    });
    expect(f.finished).toBe(false);
    expect(f.reason).toBe('too-fast');
    expect(f.wpm).toBeGreaterThan(MAX_WPM);
  });

  it('says `too-fast` for a position far past the passage: it is clamped, then it is still too fast', () => {
    const f = evaluateFinish({ passageLength: LENGTH, position: 10 ** 9, errors: 0, timeMs: 2000, samples: [LENGTH] });
    expect(f.position).toBe(LENGTH);
    expect(f.reason).toBe('too-fast');
  });

  it('says `implausible` for a believable 120 WPM with no curve', () => {
    const timeMs = LENGTH * 100; // 120 WPM
    for (const samples of [undefined, null, [], 'nope', {}]) {
      const f = evaluateFinish({ passageLength: LENGTH, position: LENGTH, errors: 0, timeMs, samples });
      expect(f.reason).toBe('implausible');
      expect(f.wpm).toBeCloseTo(120, 6);
    }
  });

  it('says `implausible` for a flat curve that jumps to the end, and for one that goes backwards', () => {
    const timeMs = LENGTH * 100;
    const steps = Math.round(timeMs / GHOST_STEP_MS);
    const flat = Array.from({ length: steps }, (_, i) => (i === steps - 1 ? LENGTH : 0));
    expect(evaluateFinish({ passageLength: LENGTH, position: LENGTH, errors: 0, timeMs, samples: flat }).reason).toBe(
      'implausible',
    );
    const honest = curve(LENGTH, 100).samples;
    const backwards = honest.map((n, i) => (i === 10 ? n - 5 : n));
    expect(
      evaluateFinish({ passageLength: LENGTH, position: LENGTH, errors: 0, timeMs, samples: backwards }).reason,
    ).toBe('implausible');
  });

  it('says `implausible` for a curve whose length does not match the server clock', () => {
    const { samples } = curve(LENGTH, 150);
    expect(evaluateFinish({ passageLength: LENGTH, position: LENGTH, errors: 0, timeMs: 90_000, samples }).reason).toBe(
      'implausible',
    );
  });

  it('refuses a curve longer than the cap without walking it', () => {
    const huge = new Array(10 ** 6).fill(LENGTH);
    expect(
      evaluateFinish({ passageLength: LENGTH, position: LENGTH, errors: 0, timeMs: 30_000, samples: huge }).reason,
    ).toBe('implausible');
  });

  it('keeps the order: short before too-fast before implausible', () => {
    expect(evaluateFinish({ passageLength: LENGTH, position: 10, errors: 0, timeMs: 1, samples: [] }).reason).toBe(
      'short',
    );
    expect(
      evaluateFinish({ passageLength: LENGTH, position: LENGTH, errors: 0, timeMs: 1000, samples: [] }).reason,
    ).toBe('too-fast');
  });
});

describe('clamping a client’s figures', () => {
  it('keeps the position within the passage and the errors within the position, as whole numbers', () => {
    expect(clampRunCounts(500, 900, 200)).toEqual({ position: 200, errors: 200 });
    expect(clampRunCounts(-5, -5, 200)).toEqual({ position: 0, errors: 0 });
    expect(clampRunCounts(12.9, 3.9, 200)).toEqual({ position: 12, errors: 3 });
    expect(clampRunCounts('9', NaN, 200)).toEqual({ position: 0, errors: 0 });
    expect(clampRunCounts(Infinity, undefined, 200)).toEqual({ position: 0, errors: 0 });
  });

  it('clamps the errors the figures carry, so accuracy stays within 0 to 100', () => {
    const f = evaluateFinish({ passageLength: 200, position: 200, errors: 10 ** 9, timeMs: 30_000, samples: [] });
    expect(f.errors).toBe(200);
    expect(f.accuracy).toBe(0);
  });

  it('is the same function the challenge module exports', () => {
    expect(challenges.evaluateFinish).toBe(evaluateFinish);
    expect(challenges.clampRunCounts).toBe(clampRunCounts);
  });
});

describe('clampProgress: live room progress', () => {
  it('never goes backwards', () => {
    expect(clampProgress(80, 20, 200, 1000)).toBe(80);
    expect(clampProgress(80, -1, 200, 1000)).toBe(80);
  });

  it('never passes the passage, however long the gap', () => {
    expect(clampProgress(0, 10 ** 9, 200, 10 * 60_000)).toBe(200);
    expect(clampProgress(190, 10 ** 9, 200, 60_000)).toBe(200);
  });

  it('caps a step at MAX_CHARS_PER_STEP per 250 ms since the last event', () => {
    expect(clampProgress(0, 200, 10_000, GHOST_STEP_MS)).toBe(MAX_CHARS_PER_STEP);
    expect(clampProgress(0, 200, 10_000, 1000)).toBe(MAX_CHARS_PER_STEP * 4);
    expect(clampProgress(100, 10_000, 10_000, GHOST_STEP_MS)).toBe(100 + MAX_CHARS_PER_STEP);
  });

  it('lets a whole passage in one step only when the time has passed for it', () => {
    expect(clampProgress(0, 200, 200, 1000)).toBeLessThan(200);
    expect(clampProgress(0, 200, 200, 15_000)).toBe(200);
  });

  it('passes an honest step through untouched', () => {
    // 100 WPM is 8 characters in 0.4 s; the allowance for 400 ms is 10.
    expect(clampProgress(40, 48, 200, 400)).toBe(48);
    expect(clampProgress(0, 0, 200, 400)).toBe(0);
  });

  it('treats a non-number as no movement and a negative gap as none', () => {
    expect(clampProgress(30, 'far', 200, 1000)).toBe(30);
    expect(clampProgress(30, NaN, 200, 1000)).toBe(30);
    expect(clampProgress(30, 200, 200, -50)).toBe(30);
    expect(clampProgress(30, 200, 200, NaN)).toBe(30);
  });

  it('does its work in constant time', () => {
    const start = performance.now();
    for (let i = 0; i < 100_000; i++) clampProgress(i % 200, (i % 200) + 3, 200, 250);
    expect(performance.now() - start).toBeLessThan(1000);
  });
});

describe('an honest run scores exactly as before', () => {
  // A recorded run: 410 characters in 61.5 s with 9 errors, typed at an even pace.
  const recorded = { length: 410, errors: 9, msPerChar: 150 };

  it('returns the figures the hub computed before the check: position / 5 / minutes, and the error share', () => {
    const { samples, timeMs } = curve(recorded.length, recorded.msPerChar);
    const f = evaluateFinish({
      passageLength: recorded.length,
      position: recorded.length,
      errors: recorded.errors,
      timeMs,
      samples,
    });
    const before = {
      wpm: recorded.length / 5 / (timeMs / 60000),
      accuracy: ((recorded.length - recorded.errors) / recorded.length) * 100,
    };
    expect(f.finished).toBe(true);
    expect(f.reason).toBeNull();
    expect(f.wpm).toBe(before.wpm);
    expect(f.accuracy).toBe(before.accuracy);
    expect(f.timeMs).toBe(timeMs);
  });
});

describe('honest curves with bursts and pauses are not refused, at any speed up to MAX_WPM', () => {
  const LENGTH = 200;
  // A seeded jittery typist: log-normal gaps, a pause now and then. 160 WPM with heavy jitter and 230 WPM used to fail
  // the ghost's strict 6-characters-per-step bar in a share of runs.
  function run(wpm: number, sigma: number, length: number, seed: number) {
    let s = seed;
    const rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
    const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-9)) * Math.cos(2 * Math.PI * rnd());
    const mean = 60000 / (wpm * 5);
    let t = 0;
    const marks: [number, number][] = [];
    for (let i = 1; i <= length; i++) {
      t += mean * Math.exp(sigma * gauss() - (sigma * sigma) / 2) + (rnd() < 0.02 ? 400 + rnd() * 800 : 0);
      marks.push([t, i]);
    }
    return { samples: buildSamples(marks, t), timeMs: t + 250 };
  }

  it.each([
    [40, 0.4, 200],
    [90, 0.4, 400],
    [160, 0.5, 500],
    [200, 0.35, 500],
    [230, 0.3, 500],
  ])('%i WPM (jitter %f, %i characters)', (wpm, sigma, length) => {
    for (let seed = 1; seed <= 100; seed++) {
      const { samples, timeMs } = run(wpm, sigma, length, seed);
      const f = evaluateFinish({ passageLength: length, position: length, errors: 4, timeMs, samples });
      expect(f.reason).toBeNull();
    }
  });

  it('still refuses NaN, negative, fractional and non-monotone curves, and a whole passage in one step', () => {
    const base = curve(LENGTH, 120);
    const bad = (samples: unknown) =>
      evaluateFinish({ passageLength: LENGTH, position: LENGTH, errors: 0, timeMs: base.timeMs, samples }).reason;
    expect(bad(base.samples.map((n, i) => (i === 3 ? Number.NaN : n)))).toBe('implausible');
    expect(bad(base.samples.map((n, i) => (i === 3 ? -1 : n)))).toBe('implausible');
    expect(bad(base.samples.map((n, i) => (i === 3 ? n + 0.5 : n)))).toBe('implausible');
    expect(bad(base.samples.map((n, i) => (i === 5 ? n - 6 : n)))).toBe('implausible');
    expect(bad('nope')).toBe('implausible');
    expect(bad(base.samples.map((n, i) => (i < base.samples.length - 1 ? 0 : n)))).toBe('implausible');
  });
});
