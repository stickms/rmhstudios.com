import { describe, expect, it } from 'vitest';
import { createRunner } from './runner';
import {
  BEATS,
  BPM,
  COUNT_IN,
  MAX_TAIL_MS,
  TAIL_MS,
  createTapBeatMachine,
  finishEvent,
  runStillWanted,
  tailMs,
  type Effect,
  type Event,
  type State,
} from './tap-beat';

/** The scored beats, 750 ms apart from t = 10 s (80 bpm). */
const GRID = Array.from({ length: BEATS }, (_, i) => 10_000 + i * 750);

function start(latencyMs = 0) {
  const machine = createTapBeatMachine(latencyMs);
  const runner = createRunner(machine);
  const effects: Effect[] = [];
  const send = (e: Event) => {
    effects.push(...runner.send(e));
    return runner.get();
  };
  return { runner, send, effects, state: () => runner.get() };
}

/** Through Start, the audio waking and the count-in, to the tapping state. */
function toTapping(latencyMs = 0) {
  const t = start(latencyMs);
  t.send({ type: 'start' });
  t.send({ type: 'prepared', token: 1, ok: true });
  for (let i = 0; i < COUNT_IN; i++) t.send({ type: 'beat', token: 1, beat: i });
  return t;
}

describe('tap-beat machine', () => {
  it('waits for Start, then prepares audio under a token', () => {
    const t = start();
    expect(t.state().kind).toBe('ready');
    t.send({ type: 'start' });
    expect(t.state()).toMatchObject({ kind: 'preparing', token: 1 });
    expect(t.effects).toEqual([{ type: 'prepare', token: 1 }]);
  });

  it('a second Start while preparing does nothing', () => {
    const t = start();
    t.send({ type: 'start' });
    const s = t.state();
    t.send({ type: 'start' });
    expect(t.state()).toBe(s);
    expect(t.effects).toHaveLength(1);
  });

  it('sound that cannot start is a plain state, and Start tries again with a new token', () => {
    const t = start();
    t.send({ type: 'start' });
    t.send({ type: 'prepared', token: 1, ok: false });
    expect(t.state().kind).toBe('no-audio');
    t.send({ type: 'start' });
    expect(t.state()).toMatchObject({ kind: 'preparing', token: 2 });
    // The first attempt answering late changes nothing.
    t.send({ type: 'prepared', token: 1, ok: true });
    expect(t.state().kind).toBe('preparing');
    t.send({ type: 'prepared', token: 2, ok: true });
    expect(t.state().kind).toBe('counting-in');
  });

  it('taps while counting in are ignored', () => {
    const t = start();
    t.send({ type: 'start' });
    t.send({ type: 'prepared', token: 1, ok: true });
    t.send({ type: 'tap', time: 9000 });
    t.send({ type: 'beat', token: 1, beat: 0 });
    t.send({ type: 'tap', time: 9100 });
    t.send({ type: 'beat', token: 1, beat: 1 });
    t.send({ type: 'tap', time: 9200 });
    expect(t.state().kind).toBe('counting-in');
    t.send({ type: 'beat', token: 1, beat: COUNT_IN - 1 });
    const s = t.state();
    expect(s.kind).toBe('tapping');
    expect(s.kind === 'tapping' && s.taps).toEqual([]);
  });

  it('the window opens on the last count-in click so an early first tap is kept', () => {
    const t = toTapping();
    t.send({ type: 'tap', time: GRID[0] - 40 });
    const s = t.state();
    expect(s.kind === 'tapping' && s.taps).toEqual([GRID[0] - 40]);
  });

  it('records taps while tapping and ignores non-finite times', () => {
    const t = toTapping();
    t.send({ type: 'beat', token: 1, beat: COUNT_IN });
    t.send({ type: 'tap', time: GRID[0] });
    t.send({ type: 'tap', time: Number.NaN });
    t.send({ type: 'tap', time: GRID[1] });
    const s = t.state();
    expect(s.kind === 'tapping' && s.taps).toEqual([GRID[0], GRID[1]]);
    expect(s.kind === 'tapping' && s.beat).toBe(0);
  });

  it('beats only move forward, and a stale token is ignored', () => {
    const t = toTapping();
    t.send({ type: 'beat', token: 1, beat: COUNT_IN + 3 });
    t.send({ type: 'beat', token: 1, beat: COUNT_IN + 1 });
    t.send({ type: 'beat', token: 9, beat: COUNT_IN + 8 });
    const s = t.state();
    expect(s.kind === 'tapping' && s.beat).toBe(3);
  });

  it('finishing scores the taps against the beats and saves once', () => {
    const t = toTapping();
    for (const b of GRID) t.send({ type: 'tap', time: b });
    t.send({ type: 'finished', token: 1, beats: GRID });
    expect(t.state()).toMatchObject({ kind: 'saving', result: { score: 100 }, attempt: 1 });
    expect(t.effects.filter((e) => e.type === 'complete')).toEqual([
      { type: 'complete', attempt: 1, score: 100, stars: 3 },
    ]);
    expect(t.effects).toContainEqual({ type: 'stop-audio' });
  });

  it('finishing twice, or a tap after finishing, completes the lesson exactly once', () => {
    const t = toTapping();
    for (const b of GRID) t.send({ type: 'tap', time: b });
    t.send({ type: 'finished', token: 1, beats: GRID });
    t.send({ type: 'finished', token: 1, beats: GRID });
    t.send({ type: 'tap', time: GRID[3] });
    t.send({ type: 'beat', token: 1, beat: 99 });
    expect(t.effects.filter((e) => e.type === 'complete')).toHaveLength(1);
    t.send({ type: 'answered', attempt: 1, outcome: 'saved' });
    t.send({ type: 'finished', token: 1, beats: GRID });
    expect(t.state().kind).toBe('saved');
    expect(t.effects.filter((e) => e.type === 'complete')).toHaveLength(1);
  });

  it('finishing before the tapping window opened does nothing', () => {
    const t = start();
    t.send({ type: 'start' });
    t.send({ type: 'prepared', token: 1, ok: true });
    t.send({ type: 'finished', token: 1, beats: GRID });
    expect(t.state().kind).toBe('counting-in');
  });

  it('allows for the learner’s latency when it scores', () => {
    const t = toTapping(80);
    for (const b of GRID) t.send({ type: 'tap', time: b + 80 });
    t.send({ type: 'finished', token: 1, beats: GRID });
    expect(t.state()).toMatchObject({ kind: 'saving', result: { score: 100 } });
  });

  it('no taps at all is a score of 0 and 0 stars, still saved', () => {
    const t = toTapping();
    t.send({ type: 'finished', token: 1, beats: GRID });
    expect(t.effects).toContainEqual({ type: 'complete', attempt: 1, score: 0, stars: 0 });
  });

  it('a save failure keeps the result for Retry; a sign-out keeps it for the sign-in link', () => {
    const a = toTapping();
    for (const b of GRID) a.send({ type: 'tap', time: b });
    a.send({ type: 'finished', token: 1, beats: GRID });
    a.send({ type: 'answered', attempt: 1, outcome: 'failed' });
    expect(a.state()).toMatchObject({ kind: 'failed', result: { score: 100 }, attempt: 1 });
    a.send({ type: 'retry' });
    expect(a.state()).toMatchObject({ kind: 'saving', attempt: 2 });
    expect(a.effects.filter((e) => e.type === 'complete').at(-1)).toMatchObject({ attempt: 2 });
    a.send({ type: 'answered', attempt: 1, outcome: 'saved' });
    expect(a.state().kind).toBe('saving');
    a.send({ type: 'answered', attempt: 2, outcome: 'saved' });
    expect(a.state()).toMatchObject({ kind: 'saved', stars: 3 });

    const b = toTapping();
    b.send({ type: 'finished', token: 1, beats: GRID });
    b.send({ type: 'answered', attempt: 1, outcome: 'unauthorized' });
    expect(b.state().kind).toBe('signed-out');
  });

  it('sound lost mid-run stops the run (no score) and Start begins again', () => {
    const t = toTapping();
    t.send({ type: 'tap', time: GRID[0] });
    t.send({ type: 'lost', token: 1 });
    expect(t.state().kind).toBe('no-audio');
    expect(t.effects).toContainEqual({ type: 'stop-audio' });
    expect(t.effects.filter((e) => e.type === 'complete')).toHaveLength(0);
    // The metronome's last timers cannot finish a run that was abandoned.
    t.send({ type: 'finished', token: 1, beats: GRID });
    expect(t.state().kind).toBe('no-audio');
    t.send({ type: 'start' });
    expect(t.state()).toMatchObject({ kind: 'preparing', token: 2 });
  });

  it('sound lost while preparing drops the run; a late "prepared: ok" for it changes nothing', () => {
    const t = start();
    t.send({ type: 'start' });
    t.send({ type: 'lost', token: 1 });
    expect(t.state()).toMatchObject({ kind: 'no-audio', lost: true, token: 1 });
    expect(t.effects).toContainEqual({ type: 'stop-audio' });
    const s = t.state();
    t.send({ type: 'prepared', token: 1, ok: true });
    expect(t.state()).toBe(s);
    t.send({ type: 'beat', token: 1, beat: 0 });
    expect(t.state()).toBe(s);
  });

  it('sound lost while counting in drops the run', () => {
    const t = start();
    t.send({ type: 'start' });
    t.send({ type: 'prepared', token: 1, ok: true });
    t.send({ type: 'beat', token: 1, beat: 0 });
    t.send({ type: 'lost', token: 1 });
    expect(t.state()).toMatchObject({ kind: 'no-audio', lost: true });
    // The count-in's later clicks and the finish of the abandoned run do nothing.
    t.send({ type: 'beat', token: 1, beat: COUNT_IN - 1 });
    t.send({ type: 'finished', token: 1, beats: GRID });
    expect(t.state().kind).toBe('no-audio');
    expect(t.effects.filter((e) => e.type === 'complete')).toHaveLength(0);
  });

  it('a lost run, started again, ignores the first run’s "prepared: ok" (second one after lost)', () => {
    const t = start();
    t.send({ type: 'start' });
    t.send({ type: 'prepared', token: 1, ok: true });
    t.send({ type: 'lost', token: 1 });
    t.send({ type: 'start' });
    expect(t.state()).toMatchObject({ kind: 'preparing', token: 2 });
    // A second "prepared" for the dropped run, arriving now, is not the new run’s.
    t.send({ type: 'prepared', token: 1, ok: true });
    expect(t.state()).toMatchObject({ kind: 'preparing', token: 2 });
    t.send({ type: 'prepared', token: 2, ok: true });
    expect(t.state()).toMatchObject({ kind: 'counting-in', token: 2 });
    // And a repeat of the right one adds nothing.
    const s = t.state();
    t.send({ type: 'prepared', token: 2, ok: true });
    expect(t.state()).toBe(s);
  });

  it('a run that finishes with fewer than 16 beats is a lost run, not a score', () => {
    for (const beats of [
      GRID.slice(0, 15),
      [],
      [...GRID, 99_999],
      GRID.map((b, i) => (i === 3 ? NaN : b)),
    ]) {
      const t = toTapping();
      for (const b of GRID) t.send({ type: 'tap', time: b });
      t.send({ type: 'finished', token: 1, beats });
      expect(t.state()).toMatchObject({ kind: 'no-audio', lost: true });
      expect(t.effects).toContainEqual({ type: 'stop-audio' });
      expect(t.effects.filter((e) => e.type === 'complete')).toHaveLength(0);
    }
  });

  it('the finishing tail is bounded below one beat at the run’s tempo', () => {
    expect(tailMs(0)).toBe(TAIL_MS + 40);
    expect(tailMs(80)).toBe(TAIL_MS + 80);
    expect(tailMs(-50)).toBe(TAIL_MS);
    // A wild saved latency cannot push the stop past the next click.
    expect(tailMs(500)).toBe(MAX_TAIL_MS);
    expect(tailMs(Number.NaN)).toBeLessThanOrEqual(MAX_TAIL_MS);
    expect(MAX_TAIL_MS).toBeLessThan(60_000 / BPM);
  });

  it('finishEvent is a finish for all sixteen beats and a lost run for anything less', () => {
    expect(finishEvent(2, GRID, 0)).toEqual({ type: 'finished', token: 2, beats: GRID });
    expect(finishEvent(2, GRID.slice(1), 0)).toEqual({ type: 'lost', token: 2 });
    // A beat the metronome skipped makes the times a different run than the grid.
    expect(finishEvent(2, GRID, 1)).toEqual({ type: 'lost', token: 2 });
  });

  it('a run that was prepared after the screen left (unmounted, or no longer this run) is not wanted', () => {
    const preparing = { kind: 'preparing', token: 3 } as const;
    expect(runStillWanted({ mounted: true, state: preparing, token: 3 })).toBe(true);
    expect(runStillWanted({ mounted: false, state: preparing, token: 3 })).toBe(false);
    expect(runStillWanted({ mounted: true, state: preparing, token: 2 })).toBe(false);
    expect(runStillWanted({ mounted: true, state: { kind: 'ready' }, token: 3 })).toBe(false);
    expect(
      runStillWanted({
        mounted: true,
        state: { kind: 'no-audio', token: 3, lost: true },
        token: 3,
      }),
    ).toBe(false);
    expect(
      runStillWanted({
        mounted: true,
        state: { kind: 'counting-in', token: 3, beat: -1 },
        token: 3,
      }),
    ).toBe(false);
  });

  it('is a plain Machine value the runner can hold', () => {
    const m = createTapBeatMachine(0);
    const s: State = m.initial;
    expect(s.kind).toBe('ready');
  });
});
