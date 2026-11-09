import { describe, expect, it } from 'vitest';
import { CARD_LOW_MIN_STEP, CARD_MAX_STEP } from '../staff-card-layout';
import { clefStep } from '../theory/clef';
import { createRunner } from './runner';
import { targetStaff } from './find-note';
import {
  MATCH_TARGETS,
  MATCH_TRIES,
  SAME_TICK_MS,
  createMatchNoteMachine,
  matchNoteMachine,
  matchNotePool,
  step,
  type Effect,
  type Event,
  type State,
  type Target,
} from './match-note';

const target = (midi: number): Target => ({ midi });
const MIDIS = [60, 62, 64, 65, 67, 60, 62, 64, 65, 67];
const ten = MIDIS.map(target);

/** A note played at `time` ms (each test spaces its notes well apart unless it means one tick). */
let clock = 0;
const on = (midi: number, cents?: number, time = (clock += 1000)): Event => ({
  type: 'answer',
  answer: { type: 'on', midi, cents, time },
});
const off = (midi: number, time = (clock += 1000)): Event => ({
  type: 'answer',
  answer: { type: 'off', midi, time },
});
const hear: Event = { type: 'hear' };
const next: Event = { type: 'next' };
const retry: Event = { type: 'retry' };
const answered = (
  outcome: 'saved' | 'failed' | 'unauthorized' | 'invalid',
  attempt = 1,
): Event => ({ type: 'answered', attempt, outcome });

function run(events: Event[], start: State = matchNoteMachine.initial(ten)) {
  let state = start;
  const effects: Effect[] = [];
  for (const e of events) {
    const r = step(state, e);
    state = r.state;
    effects.push(...r.effects);
  }
  return { state, effects };
}

/** Every target matched on the first try for the first `right`, the rest missed three times. */
function play(right: number): { state: State; effects: Effect[] } {
  const events: Event[] = [];
  for (let i = 0; i < ten.length; i++) {
    if (i < right) events.push(on(ten[i].midi));
    else events.push(on(ten[i].midi + 1), on(ten[i].midi + 2), on(ten[i].midi + 3));
    events.push(next);
  }
  return run(events);
}

describe('match-note machine: tries', () => {
  it('starts asking the first target with no tries', () => {
    expect(matchNoteMachine.initial(ten)).toEqual({
      kind: 'asking',
      cards: ten,
      index: 0,
      correct: 0,
      points: [],
      tries: [],
    });
    expect(createMatchNoteMachine(ten).initial).toEqual(matchNoteMachine.initial(ten));
    expect(MATCH_TRIES).toBe(3);
    expect(MATCH_TARGETS).toBe(10);
  });

  it('a spot-on first try ends the target at 100', () => {
    const { state, effects } = run([on(60, 4)]);
    expect(state).toMatchObject({
      kind: 'feedback',
      index: 0,
      correct: 1,
      right: true,
      best: 100,
      points: [100],
    });
    expect(effects).toEqual([]);
  });

  it('a miss keeps asking, with the try recorded, until the third', () => {
    const one = run([on(67)]).state;
    expect(one).toMatchObject({ kind: 'asking', index: 0, points: [] });
    expect(one.kind === 'asking' && one.tries.map((t) => t.points)).toEqual([0]);
    const three = run([on(67), on(62), on(64)]).state;
    expect(three).toMatchObject({
      kind: 'feedback',
      correct: 0,
      right: false,
      best: 0,
      points: [0],
    });
  });

  it('the best of the tries is the target’s points', () => {
    // 30 cents flat (≈ 77.8), then 70 cents sharp (≈ 33.3), then a wrong note.
    const { state } = run([on(60, -30), on(61, -30), on(65)]);
    expect(state.kind).toBe('feedback');
    if (state.kind !== 'feedback') return;
    expect(state.best).toBeCloseTo(77.78, 1);
    expect(state.points[0]).toBeCloseTo(77.78, 1);
    expect(state.right).toBe(false);
    expect(state.answer).toMatchObject({ midi: 65 });
  });

  it('a later try can beat an earlier one, and a spot-on try ends early', () => {
    const { state } = run([on(62), on(60, 5)]);
    expect(state).toMatchObject({ kind: 'feedback', best: 100, right: true, correct: 1 });
    expect(state.kind === 'feedback' && state.tries.length).toBe(2);
  });

  it('the fourth try is ignored', () => {
    const fb = run([on(61), on(62), on(63)]).state;
    expect(fb.kind).toBe('feedback');
    const r = step(fb, on(60));
    expect(r.state).toBe(fb);
    expect(r.effects).toEqual([]);
  });

  it('a note-off is ignored', () => {
    const asking = matchNoteMachine.initial(ten);
    expect(step(asking, off(60))).toEqual({ state: asking, effects: [] });
    const once = run([on(62)]).state;
    expect(step(once, off(62)).state).toBe(once);
  });

  it('two notes in one tick count as one try (a double tap, a chord, two sources)', () => {
    const m = createRunner(createMatchNoteMachine(ten));
    m.send(on(62, undefined, 5000));
    const after = m.get();
    expect(m.send(on(62, undefined, 5000))).toEqual([]);
    expect(m.get()).toBe(after);
    // Another pitch inside the same tick window is part of the same strike, too.
    m.send(on(60, undefined, 5000 + SAME_TICK_MS - 1));
    expect(m.get()).toBe(after);
    expect(after.kind === 'asking' && after.tries.length).toBe(1);
    // Past the window it is a new try.
    m.send(on(60, undefined, 5000 + SAME_TICK_MS));
    expect(m.get()).toMatchObject({ kind: 'feedback', right: true });
  });

  it('a spot-on and a wrong note in one tick end the target once, on the first', () => {
    const m = createRunner(createMatchNoteMachine(ten));
    m.send(on(60, undefined, 9000));
    const after = m.get();
    m.send(on(64, undefined, 9000));
    expect(m.get()).toBe(after);
    expect(after).toMatchObject({ kind: 'feedback', correct: 1, right: true });
  });

  it('a non-finite pitch is not a try', () => {
    const asking = matchNoteMachine.initial(ten);
    expect(step(asking, on(Number.NaN)).state).toBe(asking);
    expect(step(asking, on(60, undefined, Number.NaN)).state).toBe(asking);
  });
});

describe('match-note machine: hearing the target', () => {
  it('hear plays the target and never counts as a try, as often as asked', () => {
    const asking = matchNoteMachine.initial(ten);
    for (let i = 0; i < 5; i++) {
      expect(step(asking, hear)).toEqual({
        state: asking,
        effects: [{ type: 'play', midi: 60 }],
      });
    }
  });

  it('hear works after a try and in feedback, and plays the current target', () => {
    const once = run([on(62)]).state;
    expect(step(once, hear)).toEqual({ state: once, effects: [{ type: 'play', midi: 60 }] });
    const fb = run([on(60), next, on(61), on(63), on(64)]).state;
    expect(fb).toMatchObject({ kind: 'feedback', index: 1 });
    expect(step(fb, hear)).toEqual({ state: fb, effects: [{ type: 'play', midi: 62 }] });
  });

  it('hear does nothing once the session is over', () => {
    const { state } = play(10);
    expect(step(state, hear)).toEqual({ state, effects: [] });
  });
});

describe('match-note machine: moving on', () => {
  it('next is ignored while asking; it moves to the next target with fresh tries', () => {
    const asking = run([on(62)]).state;
    expect(step(asking, next)).toEqual({ state: asking, effects: [] });
    const fb = run([on(60)]).state;
    expect(step(fb, next)).toEqual({
      state: { kind: 'asking', cards: ten, index: 1, correct: 1, points: [100], tries: [] },
      effects: [],
    });
  });

  it('the next target’s first note is never taken for the last one’s (same tick across Next)', () => {
    // A try right after Next counts: the tick guard is per target.
    const a = run([on(60, undefined, 20_000), next]).state;
    expect(step(a, on(62, undefined, 20_000 + 1)).state).toMatchObject({
      kind: 'feedback',
      index: 1,
      right: true,
    });
  });
});

describe('match-note machine: finishing', () => {
  it('next after the last target saves once, with the mean score and its stars', () => {
    expect(play(8)).toEqual({
      state: { kind: 'saving', correct: 8, total: 10, score: 80, attempt: 1 },
      effects: [{ type: 'complete', attempt: 1, score: 80, stars: 2 }],
    });
    expect(play(10).effects).toEqual([{ type: 'complete', attempt: 1, score: 100, stars: 3 }]);
    expect(play(0).effects).toEqual([{ type: 'complete', attempt: 1, score: 0, stars: 0 }]);
  });

  it('partial points from the mic count toward the mean', () => {
    // Nine spot on, one 30 cents flat (≈ 77.8): mean ≈ 97.8 → 98, three stars; 9 matched.
    const events: Event[] = [];
    for (let i = 0; i < 9; i++) events.push(on(ten[i].midi), next);
    events.push(on(ten[9].midi, -30), on(ten[9].midi + 1), on(ten[9].midi + 2), next);
    expect(run(events)).toEqual({
      state: { kind: 'saving', correct: 9, total: 10, score: 98, attempt: 1 },
      effects: [{ type: 'complete', attempt: 1, score: 98, stars: 3 }],
    });
  });

  it('a repeated next after the last target does not save twice', () => {
    const { state } = play(10);
    expect(step(state, next)).toEqual({ state, effects: [] });
    expect(step(state, on(60))).toEqual({ state, effects: [] });
  });

  it('saved keeps the result and its stars', () => {
    expect(step(play(9).state, answered('saved')).state).toEqual({
      kind: 'saved',
      correct: 9,
      total: 10,
      score: 90,
      stars: 2,
    });
  });

  it('a failed save keeps the result and Retry saves again as a new attempt', () => {
    const failed = step(play(7).state, answered('failed')).state;
    expect(failed).toEqual({ kind: 'failed', correct: 7, total: 10, score: 70, attempt: 1 });
    expect(step(play(7).state, answered('invalid')).state).toEqual(failed);
    const again = step(failed, retry);
    expect(again).toEqual({
      state: { kind: 'saving', correct: 7, total: 10, score: 70, attempt: 2 },
      effects: [{ type: 'complete', attempt: 2, score: 70, stars: 1 }],
    });
    // A late answer to the first attempt is stale.
    expect(step(again.state, answered('saved', 1)).state).toBe(again.state);
    expect(step(again.state, answered('saved', 2)).state).toMatchObject({ kind: 'saved' });
  });

  it('retry is ignored unless failed; a sign-out keeps the result', () => {
    const saving = play(6).state;
    expect(step(saving, retry)).toEqual({ state: saving, effects: [] });
    expect(step(saving, answered('unauthorized')).state).toEqual({
      kind: 'signed-out',
      correct: 6,
      total: 10,
      score: 60,
    });
  });

  it('one complete effect per attempt across a whole run', () => {
    const m = createRunner(createMatchNoteMachine(ten));
    const fx: Effect[] = [];
    for (let i = 0; i < ten.length; i++) {
      fx.push(...m.send(on(ten[i].midi)), ...m.send(on(ten[i].midi)), ...m.send(next));
      fx.push(...m.send(next));
    }
    expect(fx.filter((f) => f.type === 'complete')).toHaveLength(1);
    fx.push(...m.send(answered('failed')), ...m.send(retry), ...m.send(retry));
    expect(fx.filter((f) => f.type === 'complete')).toHaveLength(2);
  });
});

describe('matchNotePool', () => {
  it('match-c is C4 to G4; match-white-keys is the naturals C4 to C5', () => {
    expect(matchNotePool('match-c')).toEqual([60, 62, 64, 65, 67]);
    expect(matchNotePool('match-white-keys')).toEqual([60, 62, 64, 65, 67, 69, 71, 72]);
    expect(matchNotePool('anything-else')).toEqual([60, 62, 64, 65, 67]);
  });

  it('every target fits the low staff card on both instruments without clamping', () => {
    for (const id of ['match-c', 'match-white-keys']) {
      for (const instrument of ['piano', 'guitar'] as const) {
        for (const midi of matchNotePool(id)) {
          const staff = targetStaff(midi, instrument);
          const s = clefStep(staff.clef, staff.midi);
          expect(s, `${id} ${instrument} ${midi}`).toBeGreaterThanOrEqual(CARD_LOW_MIN_STEP);
          expect(s, `${id} ${instrument} ${midi}`).toBeLessThanOrEqual(CARD_MAX_STEP);
        }
      }
    }
  });
});
