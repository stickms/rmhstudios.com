import { describe, expect, it } from 'vitest';
import { DECKS, deckCards, type Card } from '../content/decks';
import { isRight, stepFor, createFlashcardsMachine, type Answer } from './flashcards';

const byId = (id: string): Card => {
  const all = Object.values(DECKS).flatMap(deckCards);
  const c = all.find((x) => x.id === id);
  if (!c) throw new Error(`no card ${id}`);
  return c;
};

const letter = (l: string, accidental?: -1 | 0 | 1): Answer => ({
  kind: 'letter',
  letter: l,
  ...(accidental === undefined ? {} : { accidental }),
});
const midi = (m: number): Answer => ({ kind: 'midi', midi: m });
const pc = (n: number): Answer => ({ kind: 'pitch-class', pc: n });

describe('isRight on a natural card (unchanged)', () => {
  const e4 = byId('treble:64');
  it('takes the letter in any octave, or the exact note', () => {
    expect(isRight(e4, letter('E'))).toBe(true);
    expect(isRight(e4, letter('E', 0))).toBe(true);
    expect(isRight(e4, midi(64))).toBe(true);
    expect(isRight(e4, letter('F'))).toBe(false);
    expect(isRight(e4, midi(76))).toBe(false);
  });
  it('is wrong when an accidental is added to the right letter', () => {
    expect(isRight(e4, letter('E', 1))).toBe(false);
    expect(isRight(e4, letter('E', -1))).toBe(false);
  });
  it('takes a pitch class from a keyboard or a voice, and refuses a black key', () => {
    expect(isRight(e4, pc(4))).toBe(true);
    expect(isRight(e4, pc(5))).toBe(false);
    expect(isRight(e4, pc(3))).toBe(false);
  });
});

describe('isRight on an accidental card', () => {
  const fSharp = byId('treble:66:sharp');
  const gFlat = byId('treble:66:flat');
  it('wants the written letter and the sign', () => {
    expect(isRight(fSharp, letter('F', 1))).toBe(true);
    expect(isRight(gFlat, letter('G', -1))).toBe(true);
  });
  it('does not take the other spelling of the same key for a spelled answer', () => {
    expect(isRight(fSharp, letter('G', -1))).toBe(false);
    expect(isRight(gFlat, letter('F', 1))).toBe(false);
  });
  it('does not take the bare letter, or the wrong sign', () => {
    expect(isRight(fSharp, letter('F'))).toBe(false);
    expect(isRight(fSharp, letter('F', 0))).toBe(false);
    expect(isRight(fSharp, letter('F', -1))).toBe(false);
  });
  it('takes the black key that sounds, whichever way it is spelled', () => {
    expect(isRight(fSharp, midi(66))).toBe(true);
    expect(isRight(gFlat, midi(66))).toBe(true);
    expect(isRight(fSharp, midi(78))).toBe(false); // the octave above, from a MIDI controller
    expect(isRight(fSharp, pc(6))).toBe(true); // any octave, from the computer keys or the mic
    expect(isRight(gFlat, pc(6))).toBe(true);
    expect(isRight(fSharp, pc(5))).toBe(false);
  });
});

describe('isRight on a key card', () => {
  const fInG = byId('key:G:treble:66'); // F in G major sounds as F♯
  const gInG = byId('key:G:treble:67'); // G is left alone
  const bInF = byId('key:F:treble:70'); // B in F major sounds as B♭
  it('wants the sign the key puts on the note', () => {
    expect(isRight(fInG, letter('F', 1))).toBe(true);
    expect(isRight(fInG, letter('F'))).toBe(false); // the natural F the signature forbids
    expect(isRight(bInF, letter('B', -1))).toBe(true);
    expect(isRight(bInF, letter('B'))).toBe(false);
  });
  it('wants a plain letter where the key does nothing', () => {
    expect(isRight(gInG, letter('G'))).toBe(true);
    expect(isRight(gInG, letter('G', 1))).toBe(false);
  });
  it('takes the note that sounds', () => {
    expect(isRight(fInG, midi(66))).toBe(true);
    expect(isRight(fInG, midi(65))).toBe(false);
    expect(isRight(gInG, pc(7))).toBe(true);
  });
});

describe('a session over spelled cards', () => {
  it('scores a right spelled answer and, in Learning mode, brings back a miss', () => {
    const cards = [byId('key:G:treble:66'), byId('treble:70:flat')];
    const m = createFlashcardsMachine(cards, true);
    const step = stepFor(true);
    let s = m.initial;
    s = step(s, { type: 'answer', answer: letter('F') }).state; // forgot the key
    expect(s).toMatchObject({ kind: 'feedback', right: false });
    s = step(s, { type: 'next' }).state;
    expect(s).toMatchObject({ kind: 'asking', index: 0, misses: 1 });
    s = step(s, { type: 'answer', answer: letter('F', 1) }).state;
    expect(s).toMatchObject({ kind: 'feedback', right: true, correct: 0 });
    s = step(s, { type: 'next' }).state;
    s = step(s, { type: 'answer', answer: letter('B', -1) }).state;
    expect(s).toMatchObject({ kind: 'feedback', right: true, correct: 1 });
  });
});
