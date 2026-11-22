import { describe, expect, it } from 'vitest';
import type { Card } from '../content/decks';
import { createFlashcardsMachine, stepFor, type State } from './flashcards';

const CARDS: Card[] = [
  { id: 'treble:64', clef: 'treble', midi: 64 },
  { id: 'treble:67', clef: 'treble', midi: 67 },
];
const E = { kind: 'letter', letter: 'E' } as const;
const D = { kind: 'letter', letter: 'D' } as const;
const G = { kind: 'letter', letter: 'G' } as const;

function run(learning: boolean, events: Parameters<ReturnType<typeof stepFor>>[1][]): State {
  const step = stepFor(learning);
  let s = createFlashcardsMachine(CARDS, learning).initial;
  for (const e of events) s = step(s, e).state;
  return s;
}

describe('Learning mode', () => {
  it('stays on a card after a wrong answer, asking it again with the miss remembered', () => {
    const s = run(true, [{ type: 'answer', answer: D }, { type: 'next' }]);
    expect(s).toMatchObject({ kind: 'asking', index: 0, correct: 0, misses: 1 });
  });

  it('keeps asking until it is right, and counts nothing for a card that took a retry', () => {
    const s = run(true, [
      { type: 'answer', answer: D },
      { type: 'next' },
      { type: 'answer', answer: D },
      { type: 'next' },
      { type: 'answer', answer: E },
    ]);
    expect(s).toMatchObject({ kind: 'feedback', index: 0, right: true, correct: 0, misses: 2 });
    expect(run(true, [{ type: 'answer', answer: D }, { type: 'next' }, { type: 'answer', answer: E }, { type: 'next' }]))
      .toMatchObject({ kind: 'asking', index: 1, correct: 0 });
  });

  it('scores a right first answer and then the next card starts clean', () => {
    const s = run(true, [{ type: 'answer', answer: E }, { type: 'next' }]);
    expect(s).toMatchObject({ kind: 'asking', index: 1, correct: 1 });
    expect((s as { misses?: number }).misses).toBeUndefined();
  });

  it('saves only once every card was finally answered right, with the first-try score', () => {
    const step = stepFor(true);
    let s = createFlashcardsMachine(CARDS, true).initial;
    const send = (e: Parameters<typeof step>[1]) => {
      const r = step(s, e);
      s = r.state;
      return r.effects;
    };
    send({ type: 'answer', answer: E });
    send({ type: 'next' });
    send({ type: 'answer', answer: D });
    expect(send({ type: 'next' })).toEqual([]); // wrong: no save, the card comes back
    send({ type: 'answer', answer: G });
    const fx = send({ type: 'next' });
    expect(fx).toHaveLength(1);
    expect(fx[0]).toMatchObject({ type: 'complete', attempt: 1 });
    expect(s).toMatchObject({ kind: 'saving', correct: 1, total: 2 });
  });
});

describe('Test mode', () => {
  it('moves on after a wrong answer, as it always did', () => {
    const s = run(false, [{ type: 'answer', answer: D }, { type: 'next' }]);
    expect(s).toMatchObject({ kind: 'asking', index: 1, correct: 0 });
    expect('misses' in s).toBe(false);
  });

  it('follows a mode getter read at every event', () => {
    let learning = false;
    const m = createFlashcardsMachine(CARDS, () => learning);
    let s = m.initial;
    s = m.step(s, { type: 'answer', answer: D }).state;
    s = m.step(s, { type: 'next' }).state;
    expect(s).toMatchObject({ kind: 'asking', index: 1 }); // Test mode: on to the next card
    learning = true;
    s = m.step(s, { type: 'answer', answer: D }).state;
    s = m.step(s, { type: 'next' }).state;
    expect(s).toMatchObject({ kind: 'asking', index: 1, misses: 1 }); // Learning from here: same card
  });
});
