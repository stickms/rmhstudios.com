import { describe, expect, it } from 'vitest';
import { rhythmReadingPatterns, RHYTHM_READ_BPM } from '../content/rhythm-patterns';
import { beatMs, meterBeats, onsetTimesMs, type RhythmPattern } from '../theory/rhythm';
import { createRunner } from './runner';
import {
  PASS_SCORE,
  createRhythmReadingMachine,
  finishEvent,
  lessonScore,
  runClicks,
  runStillWanted,
  type Effect,
  type Event,
  type State,
} from './rhythm-reading';

const PATTERNS = rhythmReadingPatterns('rhythm-read-dotted') as readonly RhythmPattern[];
const BAR_START = 10_000;
const BEAT = beatMs(RHYTHM_READ_BPM);

function start({ learning = false, latencyMs = 0, patterns = PATTERNS } = {}) {
  const runner = createRunner(createRhythmReadingMachine(patterns, latencyMs, learning));
  const effects: Effect[] = [];
  const send = (e: Event) => {
    effects.push(...runner.send(e));
    return runner.get();
  };
  return { runner, send, effects, state: () => runner.get() };
}
type Run = ReturnType<typeof start>;

const tokenOf = (s: State): number => s.token;
const patternAt = (r: Run) => PATTERNS[(r.state() as Extract<State, { index: number }>).index]!;

/** Listen, hear it. */
function hear(r: Run) {
  r.send({ type: 'listen' });
  r.send({ type: 'played', token: tokenOf(r.state()), ok: true });
}
/** Begin and run the count-in to the tapping state. */
function toTapping(r: Run) {
  r.send({ type: 'begin' });
  const token = tokenOf(r.state());
  r.send({ type: 'prepared', token, ok: true });
  const n = meterBeats(patternAt(r).meter);
  for (let i = 0; i < n; i++) r.send({ type: 'beat', token, beat: i });
  return token;
}
/** Tap exactly the pattern's onsets (or `taps`), finish the bar. */
function tapBar(r: Run, taps?: number[]) {
  const token = toTapping(r);
  const times = taps ?? onsetTimesMs(patternAt(r), RHYTHM_READ_BPM, BAR_START);
  for (const time of times) r.send({ type: 'tap', time });
  r.send({ type: 'finished', token, barStart: BAR_START });
}
/** A whole lesson: every pattern heard and tapped exactly. */
function playAll(r: Run) {
  for (let i = 0; i < PATTERNS.length; i++) {
    hear(r);
    tapBar(r);
    r.send({ type: 'next' });
  }
}

describe('listening first', () => {
  it('starts on the first pattern, unheard, and will not begin until it has been heard', () => {
    const r = start();
    expect(r.state()).toMatchObject({ kind: 'asking', index: 0, heard: false, notice: null });
    r.send({ type: 'begin' });
    expect(r.state().kind).toBe('asking');
    expect(r.effects).toEqual([]);
  });

  it('plays the pattern on Listen, and may begin once it has been heard', () => {
    const r = start();
    r.send({ type: 'listen' });
    expect(r.state()).toMatchObject({ kind: 'listening', token: 1 });
    expect(r.effects).toEqual([{ type: 'play', token: 1, index: 0 }]);
    // Not yet heard: still no count-in.
    r.send({ type: 'begin' });
    expect(r.state().kind).toBe('listening');
    r.send({ type: 'played', token: 1, ok: true });
    expect(r.state()).toMatchObject({ kind: 'asking', heard: true });
    r.send({ type: 'begin' });
    expect(r.state()).toMatchObject({ kind: 'preparing', token: 2 });
    expect(r.effects.at(-1)).toEqual({ type: 'prepare', token: 2, index: 0 });
  });

  it('lets the pattern be heard again, without touching the score', () => {
    const r = start();
    hear(r);
    r.send({ type: 'listen' });
    expect(r.state()).toMatchObject({ kind: 'listening', heard: true, index: 0 });
    r.send({ type: 'played', token: tokenOf(r.state()), ok: true });
    expect(r.state()).toMatchObject({ kind: 'asking', heard: true, scores: [] });
  });

  it('says so when sound cannot start, and the pattern stays unheard', () => {
    const r = start();
    r.send({ type: 'listen' });
    r.send({ type: 'played', token: 1, ok: false });
    expect(r.state()).toMatchObject({ kind: 'asking', notice: 'no-audio', heard: false });
    r.send({ type: 'begin' });
    expect(r.state().kind).toBe('asking');
  });

  it('ignores a second Listen while the first is sounding', () => {
    const r = start();
    r.send({ type: 'listen' });
    r.send({ type: 'listen' });
    expect(r.effects.filter((e) => e.type === 'play')).toHaveLength(1);
  });
});

describe('the count-in and the taps', () => {
  it('counts in a bar of the pattern’s meter, then takes taps from the last count-in click', () => {
    const r = start();
    hear(r);
    r.send({ type: 'begin' });
    const token = tokenOf(r.state());
    r.send({ type: 'tap', time: 1 });
    r.send({ type: 'prepared', token, ok: true });
    expect(r.state()).toMatchObject({ kind: 'counting-in', beat: -1 });
    r.send({ type: 'tap', time: 2 });
    for (let i = 0; i < 3; i++) r.send({ type: 'beat', token, beat: i });
    expect(r.state()).toMatchObject({ kind: 'counting-in', beat: 2 });
    r.send({ type: 'beat', token, beat: 3 });
    expect(r.state()).toMatchObject({ kind: 'tapping', beat: -1, taps: [] });
    r.send({ type: 'tap', time: 5 });
    r.send({ type: 'tap', time: Number.NaN });
    r.send({ type: 'beat', token, beat: 4 });
    expect(r.state()).toMatchObject({ kind: 'tapping', beat: 0, taps: [5] });
    r.send({ type: 'beat', token, beat: 99 });
    expect(r.state()).toMatchObject({ kind: 'tapping', beat: 3 });
  });

  it('counts three clicks in for a bar of 3/4', () => {
    const r = start({ patterns: rhythmReadingPatterns('rhythm-read-ties-34') as RhythmPattern[] });
    // Walk to the first 3/4 pattern (the fifth), passing each.
    const all = rhythmReadingPatterns('rhythm-read-ties-34') as RhythmPattern[];
    for (let i = 0; i < 4; i++) {
      hear(r);
      const token = toTapping(r);
      const p = all[i]!;
      for (const time of onsetTimesMs(p, RHYTHM_READ_BPM, BAR_START)) r.send({ type: 'tap', time });
      r.send({ type: 'finished', token, barStart: BAR_START });
      r.send({ type: 'next' });
    }
    hear(r);
    r.send({ type: 'begin' });
    const token = tokenOf(r.state());
    r.send({ type: 'prepared', token, ok: true });
    r.send({ type: 'beat', token, beat: 2 });
    expect(r.state().kind).toBe('tapping');
  });

  it('scores a bar tapped on time as passed, and shows it on the bar', () => {
    const r = start();
    hear(r);
    tapBar(r);
    const s = r.state();
    expect(s.kind).toBe('feedback');
    if (s.kind !== 'feedback') throw new Error('unreachable');
    expect(s.attempt).toMatchObject({ score: 100, hits: 2, missed: 0, passed: true, extras: [], extraBeats: [] });
    expect(s.scores).toEqual([100]);
    expect(r.effects.at(-1)).toEqual({ type: 'stop-audio' });
  });

  it('fails a dotted-quarter-and-eighth bar tapped evenly, and reports the stray taps by beat', () => {
    const r = start();
    hear(r);
    // Pattern 1 is the dotted half and a quarter (onsets 0 and 3): tapping four even beats misses it.
    tapBar(
      r,
      [0, 1, 2, 3].map((b) => BAR_START + b * BEAT),
    );
    const s = r.state();
    if (s.kind !== 'feedback') throw new Error('not feedback');
    expect(s.attempt.passed).toBe(false);
    expect(s.attempt.score).toBeLessThan(PASS_SCORE);
    expect(s.attempt.extraBeats.map((b) => Math.round(b))).toEqual([1, 2]);
  });

  it('passes dotted-quarter-eighth on time and fails it tapped evenly (the lesson’s own pattern)', () => {
    const idx = PATTERNS.findIndex(
      (p) => p.notes[0]?.dotted && p.notes[0]?.value === 'quarter' && p.notes.length === 4,
    );
    expect(idx).toBeGreaterThanOrEqual(0);
    const play = (taps: (p: RhythmPattern) => number[]) => {
      const r = start();
      for (let i = 0; i < idx; i++) {
        hear(r);
        tapBar(r);
        r.send({ type: 'next' });
      }
      hear(r);
      tapBar(r, taps(PATTERNS[idx]!));
      const s = r.state();
      if (s.kind !== 'feedback') throw new Error('not feedback');
      return s.attempt;
    };
    expect(play((p) => onsetTimesMs(p, RHYTHM_READ_BPM, BAR_START)).passed).toBe(true);
    const evenly = play(() => [0, 1, 2, 3].map((b) => BAR_START + b * BEAT));
    expect(evenly.passed).toBe(false);
  });

  it('takes the learner’s latency off the taps', () => {
    const r = start({ latencyMs: 80 });
    hear(r);
    tapBar(
      r,
      onsetTimesMs(patternAt(r), RHYTHM_READ_BPM, BAR_START).map((t) => t + 80),
    );
    const s = r.state();
    expect(s.kind === 'feedback' && s.attempt.score).toBe(100);
  });

  it('counts a tap in a rest as extra', () => {
    const rests = rhythmReadingPatterns('rhythm-read-rests') as RhythmPattern[];
    const r = start({ patterns: rests });
    hear(r);
    // Pattern 1: q q qr q (onsets 0, 1, 3). Tap the rest at beat 2 as well.
    // The learner's setup adds its latency (40 ms unless calibrated) to every tap.
    const taps = [0, 1, 2, 3].map((b) => BAR_START + b * BEAT + 40);
    const token = toTapping(r);
    for (const time of taps) r.send({ type: 'tap', time });
    r.send({ type: 'finished', token, barStart: BAR_START });
    const s = r.state();
    if (s.kind !== 'feedback') throw new Error('not feedback');
    expect(s.attempt.extras).toHaveLength(1);
    expect(s.attempt.extraBeats[0]).toBeCloseTo(2, 6);
  });
});

describe('Learning and Test mode', () => {
  const missed = (r: Run) => {
    hear(r);
    tapBar(r, []);
  };

  it('repeats a missed pattern in Learning mode, already heard, and scores only the first attempt', () => {
    const r = start({ learning: true });
    missed(r);
    expect(r.state()).toMatchObject({ kind: 'feedback', scores: [0] });
    r.send({ type: 'next' });
    expect(r.state()).toMatchObject({ kind: 'asking', index: 0, misses: 1, heard: true, scores: [0] });
    // Tapped right the second time: it passes and moves on, and the first score stands.
    tapBar(r);
    const s = r.state();
    expect(s).toMatchObject({ kind: 'feedback', index: 0, scores: [0] });
    r.send({ type: 'next' });
    expect(r.state()).toMatchObject({ kind: 'asking', index: 1, misses: 0, heard: false, scores: [0] });
  });

  it('does not repeat in Test mode', () => {
    const r = start({ learning: false });
    missed(r);
    r.send({ type: 'next' });
    expect(r.state()).toMatchObject({ kind: 'asking', index: 1, misses: 0, scores: [0] });
  });

  it('follows a mode getter read at each Next', () => {
    let learning = false;
    const runner = createRunner(createRhythmReadingMachine(PATTERNS, 0, () => learning));
    const send = (e: Event) => runner.send(e);
    send({ type: 'listen' });
    send({ type: 'played', token: 1, ok: true });
    send({ type: 'begin' });
    send({ type: 'prepared', token: 2, ok: true });
    for (let i = 0; i < 4; i++) send({ type: 'beat', token: 2, beat: i });
    send({ type: 'finished', token: 2, barStart: BAR_START });
    learning = true;
    send({ type: 'next' });
    expect(runner.get()).toMatchObject({ kind: 'asking', index: 0, misses: 1 });
  });

  it('accepts Next only in feedback, so a double press moves on once', () => {
    const r = start();
    r.send({ type: 'next' });
    expect(r.state()).toMatchObject({ kind: 'asking', index: 0 });
    hear(r);
    tapBar(r);
    r.send({ type: 'next' });
    r.send({ type: 'next' });
    expect(r.state()).toMatchObject({ kind: 'asking', index: 1 });
  });
});

describe('saving', () => {
  it('completes exactly once, after the last pattern, with the mean of the first attempts', () => {
    const r = start();
    playAll(r);
    const completes = r.effects.filter((e) => e.type === 'complete');
    expect(completes).toEqual([{ type: 'complete', attempt: 1, score: 100, stars: 3 }]);
    expect(r.state()).toMatchObject({ kind: 'saving', attempt: 1, score: 100 });
    // Nothing else moves a saved lesson into a second save.
    r.send({ type: 'next' });
    r.send({ type: 'finished', token: 99, barStart: BAR_START });
    expect(r.effects.filter((e) => e.type === 'complete')).toHaveLength(1);
  });

  it('scores a lesson as the mean of its patterns', () => {
    expect(lessonScore([100, 0], 2)).toBe(50);
    expect(lessonScore([100, 50, 0, 0], 8)).toBe(19);
    expect(lessonScore([], 0)).toBe(0);
    expect(lessonScore([Number.NaN, 100], 2)).toBe(50);
  });

  it('saved, failed with Retry, and signed out; a stale answer is ignored', () => {
    const r = start();
    playAll(r);
    r.send({ type: 'answered', attempt: 7, outcome: 'saved' });
    expect(r.state().kind).toBe('saving');
    r.send({ type: 'answered', attempt: 1, outcome: 'failed' });
    expect(r.state()).toMatchObject({ kind: 'failed', attempt: 1 });
    r.send({ type: 'retry' });
    expect(r.state()).toMatchObject({ kind: 'saving', attempt: 2 });
    expect(r.effects.filter((e) => e.type === 'complete')).toHaveLength(2);
    r.send({ type: 'answered', attempt: 1, outcome: 'saved' });
    expect(r.state().kind).toBe('saving');
    r.send({ type: 'answered', attempt: 2, outcome: 'saved' });
    expect(r.state()).toMatchObject({ kind: 'saved', stars: 3 });

    const s = start();
    playAll(s);
    s.send({ type: 'answered', attempt: 1, outcome: 'unauthorized' });
    expect(s.state().kind).toBe('signed-out');
    s.send({ type: 'retry' });
    expect(s.state().kind).toBe('signed-out');
  });
});

describe('an abandoned run', () => {
  it('ignores every late event of a run that was dropped and begun again', () => {
    const r = start();
    hear(r);
    r.send({ type: 'begin' });
    const old = tokenOf(r.state());
    r.send({ type: 'prepared', token: old, ok: true });
    r.send({ type: 'lost', token: old });
    expect(r.state()).toMatchObject({ kind: 'asking', notice: 'lost', heard: true });
    expect(r.effects.at(-1)).toEqual({ type: 'stop-audio' });
    r.send({ type: 'begin' });
    const fresh = tokenOf(r.state());
    expect(fresh).toBeGreaterThan(old);
    const before = r.state();
    r.send({ type: 'prepared', token: old, ok: true });
    r.send({ type: 'beat', token: old, beat: 3 });
    r.send({ type: 'finished', token: old, barStart: BAR_START });
    r.send({ type: 'lost', token: old });
    expect(r.state()).toBe(before);
  });

  it('ignores a late finish after the learner pressed Listen again', () => {
    const r = start();
    hear(r);
    const token = toTapping(r);
    r.send({ type: 'lost', token });
    r.send({ type: 'listen' });
    const effects = r.effects.length;
    r.send({ type: 'finished', token, barStart: BAR_START });
    r.send({ type: 'played', token, ok: true });
    expect(r.state().kind).toBe('listening');
    expect(r.effects).toHaveLength(effects);
    expect(r.effects.filter((e) => e.type === 'complete')).toHaveLength(0);
  });

  it('finishes once: a second finish for the same run changes nothing', () => {
    const r = start();
    hear(r);
    const token = toTapping(r);
    r.send({ type: 'finished', token, barStart: BAR_START });
    const after = r.state();
    r.send({ type: 'finished', token, barStart: BAR_START });
    r.send({ type: 'tap', time: BAR_START });
    expect(r.state()).toBe(after);
  });

  it('drops a finish with no bar start as a lost run, never scored', () => {
    const r = start();
    hear(r);
    const token = toTapping(r);
    r.send({ type: 'finished', token, barStart: Number.NaN });
    expect(r.state()).toMatchObject({ kind: 'asking', notice: 'lost' });
  });

  it('drops a run lost while listening, and a late `played` from it', () => {
    const r = start();
    r.send({ type: 'listen' });
    r.send({ type: 'lost', token: 1 });
    expect(r.state()).toMatchObject({ kind: 'asking', notice: 'lost', heard: false });
    r.send({ type: 'played', token: 1, ok: true });
    expect(r.state()).toMatchObject({ heard: false });
  });
});

describe('the screen’s helpers', () => {
  it('treats a run missing clicks, or skipping one, as lost', () => {
    const n = 4;
    const grid = Array.from({ length: 2 * n }, (_, i) => 5_000 + i * BEAT);
    expect(finishEvent(3, grid, 0, '4/4')).toEqual({ type: 'finished', token: 3, barStart: grid[n] });
    expect(finishEvent(3, grid, 1, '4/4')).toEqual({ type: 'lost', token: 3 });
    expect(finishEvent(3, grid.slice(1), 0, '4/4')).toEqual({ type: 'lost', token: 3 });
    expect(finishEvent(3, [...grid.slice(1), Number.NaN], 0, '4/4')).toEqual({ type: 'lost', token: 3 });
    expect(finishEvent(3, grid.slice(0, 6), 0, '3/4')).toEqual({ type: 'finished', token: 3, barStart: grid[3] });
    expect(runClicks('4/4')).toBe(8);
    expect(runClicks('3/4')).toBe(6);
  });

  it('wants a run only while mounted and still on that token', () => {
    const r = start();
    r.send({ type: 'listen' });
    const state = r.state();
    expect(runStillWanted({ mounted: true, state, token: 1, kind: 'listening' })).toBe(true);
    expect(runStillWanted({ mounted: false, state, token: 1, kind: 'listening' })).toBe(false);
    expect(runStillWanted({ mounted: true, state, token: 2, kind: 'listening' })).toBe(false);
    expect(runStillWanted({ mounted: true, state, token: 1, kind: 'preparing' })).toBe(false);
  });
});
