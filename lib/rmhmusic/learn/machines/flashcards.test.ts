import { describe, expect, it } from 'vitest';
import type { Card } from '../content/decks';
import { createRunner } from './runner';
import {
  createFlashcardsMachine,
  flashcardsMachine,
  step,
  type Effect,
  type Event,
  type State,
} from './flashcards';

const card = (midi: number): Card => ({ id: `treble:${midi}`, clef: 'treble', midi });
// E4 G4 B4 D5 F5 (the treble lines), then repeated: ten cards.
const MIDIS = [64, 67, 71, 74, 77, 64, 67, 71, 74, 77];
const ten = MIDIS.map(card);

const letter = (l: string): Event => ({ type: 'answer', answer: { kind: 'letter', letter: l } });
const midi = (m: number): Event => ({ type: 'answer', answer: { kind: 'midi', midi: m } });
const next: Event = { type: 'next' };
const retry: Event = { type: 'retry' };
const answered = (
  outcome: 'saved' | 'failed' | 'unauthorized' | 'invalid',
  attempt = 1,
): Event => ({ type: 'answered', attempt, outcome });

/** The right letter for a card of ten above. */
const LETTER: Record<number, string> = { 64: 'E', 67: 'G', 71: 'B', 74: 'D', 77: 'F' };

/** Drive a machine through all of `ten`, answering right for the first `right` cards. */
function play(right: number): { state: State; effects: Effect[] } {
  const m = createFlashcardsMachine(ten);
  let state = m.initial;
  let effects: Effect[] = [];
  for (let i = 0; i < ten.length; i++) {
    const a = m.step(state, i < right ? letter(LETTER[ten[i].midi]) : letter('C'));
    const n = m.step(a.state, next);
    state = n.state;
    effects = n.effects;
  }
  return { state, effects };
}

describe('flashcards machine: asking and feedback', () => {
  it('starts asking the first card with nothing correct', () => {
    expect(flashcardsMachine.initial(ten)).toEqual({
      kind: 'asking',
      cards: ten,
      index: 0,
      correct: 0,
    });
    expect(createFlashcardsMachine(ten).initial).toEqual(flashcardsMachine.initial(ten));
  });

  it('a right letter answer gives feedback{right:true} and counts one', () => {
    const { state, effects } = step(flashcardsMachine.initial(ten), letter('E'));
    expect(state).toEqual({
      kind: 'feedback',
      cards: ten,
      index: 0,
      correct: 1,
      right: true,
      answer: { kind: 'letter', letter: 'E' },
    });
    expect(effects).toEqual([]);
  });

  it('a wrong letter answer is feedback{right:false} and counts nothing', () => {
    const { state } = step(flashcardsMachine.initial(ten), letter('F'));
    expect(state).toMatchObject({ kind: 'feedback', right: false, correct: 0 });
  });

  it('two answers in a row count once: the second is ignored', () => {
    const m = createRunner(createFlashcardsMachine(ten));
    m.send(letter('E'));
    const after = m.get();
    expect(m.send(letter('E'))).toEqual([]);
    expect(m.get()).toBe(after);
    expect(after).toMatchObject({ kind: 'feedback', correct: 1 });
    // Even a different (wrong) second answer does not change the first.
    m.send(letter('C'));
    expect(m.get()).toBe(after);
  });

  it('a letter answer is right in any octave: E is right for E4 and for E5', () => {
    expect(step(flashcardsMachine.initial([card(64)]), letter('E')).state).toMatchObject({
      right: true,
    });
    expect(step(flashcardsMachine.initial([card(76)]), letter('E')).state).toMatchObject({
      right: true,
    });
    expect(step(flashcardsMachine.initial([card(76)]), letter('e')).state).toMatchObject({
      right: false,
    });
  });

  it('a midi answer is right only on the exact note: one octave off is wrong', () => {
    const start = flashcardsMachine.initial([card(64)]);
    expect(step(start, midi(64)).state).toMatchObject({ kind: 'feedback', right: true });
    expect(step(start, midi(76)).state).toMatchObject({ kind: 'feedback', right: false });
    expect(step(start, midi(52)).state).toMatchObject({ kind: 'feedback', right: false });
    expect(step(start, midi(65)).state).toMatchObject({ kind: 'feedback', right: false });
    expect(step(start, midi(Number.NaN)).state).toMatchObject({ right: false });
  });

  it('next moves to the next card, keeping the count', () => {
    const fb = step(flashcardsMachine.initial(ten), letter('E')).state;
    const { state, effects } = step(fb, next);
    expect(state).toEqual({ kind: 'asking', cards: ten, index: 1, correct: 1 });
    expect(effects).toEqual([]);
  });

  it('next is ignored while asking, and answer is ignored in feedback', () => {
    const asking = flashcardsMachine.initial(ten);
    expect(step(asking, next)).toEqual({ state: asking, effects: [] });
    const fb = step(asking, letter('C')).state;
    expect(step(fb, letter('E')).state).toBe(fb);
  });

  it('ignores answered and retry outside saving and failed', () => {
    const asking = flashcardsMachine.initial(ten);
    expect(step(asking, answered('saved')).state).toBe(asking);
    expect(step(asking, retry).state).toBe(asking);
    const fb = step(asking, letter('E')).state;
    expect(step(fb, answered('saved')).state).toBe(fb);
    expect(step(fb, retry).state).toBe(fb);
  });
});

describe('flashcards machine: finishing', () => {
  it('next after the last card saves once, with score and stars (7 of 10 is 70, one star)', () => {
    const { state, effects } = play(7);
    expect(state).toEqual({ kind: 'saving', correct: 7, total: 10, attempt: 1 });
    expect(effects).toEqual([{ type: 'complete', attempt: 1, score: 70, stars: 1 }]);
  });

  it('emits exactly one complete across the whole session', () => {
    const m = createRunner(createFlashcardsMachine(ten));
    const all: Effect[] = [];
    for (const c of ten) {
      all.push(...m.send(letter(LETTER[c.midi])));
      all.push(...m.send(letter(LETTER[c.midi])));
      all.push(...m.send(next));
      all.push(...m.send(next));
    }
    // A double tap on the last "next" or on a late answer does nothing more.
    all.push(...m.send(next), ...m.send(letter('E')));
    expect(all.filter((e) => e.type === 'complete')).toHaveLength(1);
    expect(all).toEqual([{ type: 'complete', attempt: 1, score: 100, stars: 3 }]);
  });

  it('scores the star thresholds', () => {
    expect(play(10).effects).toEqual([{ type: 'complete', attempt: 1, score: 100, stars: 3 }]);
    expect(play(8).effects).toEqual([{ type: 'complete', attempt: 1, score: 80, stars: 2 }]);
    expect(play(5).effects).toEqual([{ type: 'complete', attempt: 1, score: 50, stars: 0 }]);
    expect(play(0).effects).toEqual([{ type: 'complete', attempt: 1, score: 0, stars: 0 }]);
  });

  const saving: State = { kind: 'saving', correct: 7, total: 10, attempt: 1 };

  it('answered saved gives saved{stars}', () => {
    expect(step(saving, answered('saved')).state).toEqual({
      kind: 'saved',
      correct: 7,
      total: 10,
      stars: 1,
    });
    expect(step({ ...saving, correct: 10 }, answered('saved')).state).toMatchObject({ stars: 3 });
  });

  it('answered unauthorized gives signed-out, keeping the result', () => {
    expect(step(saving, answered('unauthorized')).state).toEqual({
      kind: 'signed-out',
      correct: 7,
      total: 10,
    });
  });

  it('answered failed or invalid gives failed, keeping the result and attempt', () => {
    const failed: State = { kind: 'failed', correct: 7, total: 10, attempt: 1 };
    expect(step(saving, answered('failed')).state).toEqual(failed);
    expect(step(saving, answered('invalid')).state).toEqual(failed);
  });

  it('retry from failed saves again as attempt 2, with the same score', () => {
    const failed: State = { kind: 'failed', correct: 7, total: 10, attempt: 1 };
    expect(step(failed, retry)).toEqual({
      state: { kind: 'saving', correct: 7, total: 10, attempt: 2 },
      effects: [{ type: 'complete', attempt: 2, score: 70, stars: 1 }],
    });
    // And a second failure retries as attempt 3.
    const again = step(step(failed, retry).state, answered('failed', 2)).state;
    expect(step(again, retry).effects).toEqual([
      { type: 'complete', attempt: 3, score: 70, stars: 1 },
    ]);
  });

  it('retry is ignored anywhere but failed (no double payment)', () => {
    expect(step(saving, retry)).toEqual({ state: saving, effects: [] });
    const saved: State = { kind: 'saved', correct: 7, total: 10, stars: 1 };
    expect(step(saved, retry)).toEqual({ state: saved, effects: [] });
    const out: State = { kind: 'signed-out', correct: 7, total: 10 };
    expect(step(out, retry)).toEqual({ state: out, effects: [] });
  });

  it('ignores a stale answered (an older attempt) and a late one after the result', () => {
    const failed: State = { kind: 'failed', correct: 7, total: 10, attempt: 1 };
    const second = step(failed, retry).state; // saving, attempt 2
    expect(step(second, answered('saved', 1))).toEqual({ state: second, effects: [] });
    expect(step(second, answered('saved', 2)).state).toMatchObject({ kind: 'saved' });
    expect(step(failed, answered('saved', 1)).state).toBe(failed);
    const saved: State = { kind: 'saved', correct: 7, total: 10, stars: 1 };
    expect(step(saved, answered('failed', 1)).state).toBe(saved);
  });

  it('answers and next do nothing once saving or later', () => {
    const states: State[] = [
      { kind: 'saving', correct: 7, total: 10, attempt: 1 },
      { kind: 'saved', correct: 7, total: 10, stars: 1 },
      { kind: 'failed', correct: 7, total: 10, attempt: 1 },
      { kind: 'signed-out', correct: 7, total: 10 },
    ];
    for (const s of states) {
      expect(step(s, letter('E'))).toEqual({ state: s, effects: [] });
      expect(step(s, midi(64))).toEqual({ state: s, effects: [] });
      expect(step(s, next)).toEqual({ state: s, effects: [] });
    }
  });
});

describe('flashcards machine: edges', () => {
  it('a one-card session saves after its only card', () => {
    const m = createFlashcardsMachine([card(60)]);
    const fb = m.step(m.initial, letter('C')).state;
    expect(m.step(fb, next)).toEqual({
      state: { kind: 'saving', correct: 1, total: 1, attempt: 1 },
      effects: [{ type: 'complete', attempt: 1, score: 100, stars: 3 }],
    });
  });

  it('an empty session has nothing to answer or finish', () => {
    const m = createFlashcardsMachine([]);
    expect(m.step(m.initial, letter('C'))).toEqual({ state: m.initial, effects: [] });
    expect(m.step(m.initial, next)).toEqual({ state: m.initial, effects: [] });
  });

  it('works through the runner: the result stays after a failed save', () => {
    const r = createRunner(createFlashcardsMachine([card(60)]));
    r.send(letter('C'));
    const effects = r.send(next);
    expect(effects).toHaveLength(1);
    r.send(answered('failed'));
    expect(r.get()).toEqual({ kind: 'failed', correct: 1, total: 1, attempt: 1 });
  });
});
