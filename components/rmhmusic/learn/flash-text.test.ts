/**
 * The sentences a wrong flashcard answer says, under a real i18next instance with no catalog (every
 * string is its `t()` default), as `sprint/sprint-miss-text.test.ts` does.
 */
import { describe, expect, it } from 'vitest';
import { createInstance } from 'i18next';
import { DECKS, deckCards, type Card } from '@/lib/rmhmusic/learn/content/decks';
import { LANDMARKS, landmarkHint } from '@/lib/rmhmusic/learn/landmarks';
import type { Answer } from '@/lib/rmhmusic/learn/machines/flashcards';
import { describeMiss } from '@/lib/rmhmusic/learn/miss';
import { cardAlteration, cardWritten } from '@/lib/rmhmusic/learn/content/spelling';
import {
  answerName,
  cardNoteName,
  keySentence,
  landmarkName,
  landmarkSentence,
  missSentences,
  wrongAnswerSentences,
  type Translate,
} from './flash-text';

const i18n = createInstance();
void i18n.init({
  lng: 'en',
  fallbackLng: 'en',
  resources: {},
  initAsync: false,
  interpolation: { escapeValue: false },
});
const t = i18n.t.bind(i18n) as unknown as Translate;

const card = (id: string): Card => {
  const c = Object.values(DECKS)
    .flatMap(deckCards)
    .find((x) => x.id === id);
  if (!c) throw new Error(`no card ${id}`);
  return c;
};
const letter = (l: string, accidental?: -1 | 0 | 1): Answer => ({
  kind: 'letter',
  letter: l,
  ...(accidental === undefined ? {} : { accidental }),
});
const midi = (m: number): Answer => ({ kind: 'midi', midi: m });

/** The sentences for answering `answer` to card `id`. */
function said(id: string, answer: Answer): string[] {
  const c = card(id);
  const spell = cardAlteration(c) < 0 ? -1 : 1;
  return wrongAnswerSentences(t, c, describeMiss(c.midi, answer, { written: cardWritten(c), spell }), answer);
}

describe('answerName', () => {
  it('speaks a letter with its sign, a pitch class as a sharp, a played note with its octave', () => {
    expect(answerName(letter('F', 1))).toBe('F♯');
    expect(answerName(letter('B', -1))).toBe('B♭');
    expect(answerName(letter('E'))).toBe('E');
    expect(answerName({ kind: 'pitch-class', pc: 6 })).toBe('F♯');
    expect(answerName(midi(61))).toBe('C♯4');
    expect(answerName(midi(60))).toBe('C4');
  });
});

describe('a wrong answer to a natural card', () => {
  it('says what was played, how far off, and where the right note sits from a landmark', () => {
    expect(said('treble:67', midi(65))).toEqual([
      'You played F4, not G4.',
      'One step below the right note.',
      'G4 is the G on the second line.',
    ]);
  });
  it('counts from the nearest landmark above or below', () => {
    expect(said('treble:69', letter('C'))[2]).toBe('A4 is one step above the G on the second line.');
    expect(said('treble:71', letter('C'))[2]).toBe('B4 is one step below the C in the third space.');
    expect(said('treble:74', letter('C'))[2]).toBe('D5 is one step above the C in the third space.');
    expect(said('bass:50', letter('A'))[2]).toBe('D3 is one step above the C in the second space.');
    expect(said('bass:57', letter('C'))[2]).toBe('A3 is 2 steps above the F on the fourth line.');
    expect(said('bass:52', letter('A'))[2]).toBe('E3 is one step below the F on the fourth line.');
  });
  it('names a letter answer as named, and a played note as played', () => {
    expect(said('treble:64', letter('C'))[0]).toBe('You named C, not E4.');
    expect(said('treble:64', midi(60))[0]).toBe('You played C4, not E4.');
  });
});

describe('a wrong answer to an accidental card', () => {
  it('names the right note with its sign, and counts from the natural it is written on', () => {
    expect(said('treble:66:sharp', letter('F'))).toEqual([
      'You named F, not F♯4.',
      'Right line or space, wrong accidental.',
      'F♯4 is one step below the G on the second line.',
    ]);
  });
  it('says G♭ is not F♯ when the spelling is what was missed', () => {
    const s = said('treble:66:sharp', letter('G', -1));
    expect(s[0]).toBe('You named G♭, not F♯4.');
    expect(s[1]).toBe('One step above the right note.');
  });
  it('spells a flat card with its sign and counts from its written letter', () => {
    expect(cardNoteName(card('treble:70:flat'))).toBe('B♭4');
    expect(said('treble:70:flat', letter('B'))[2]).toBe('B♭4 is one step below the C in the third space.');
  });
  it('draws a black key played wrong with the card’s own spelling', () => {
    const c = card('treble:70:flat');
    const miss = describeMiss(c.midi, midi(68), { written: cardWritten(c), spell: -1 });
    expect(miss?.name).toBe('A♭4');
  });
});

describe('a wrong answer to a key card', () => {
  it('says what the key does to the letter instead of how far off', () => {
    expect(said('key:G:treble:66', letter('F'))).toEqual([
      'You named F, not F♯4.',
      'F is sharp in G major.',
      'F♯4 is one step below the G on the second line.',
    ]);
  });
  it('says a flat key flattens its letters, and a letter it leaves alone is natural', () => {
    expect(keySentence(t, card('key:Bb:treble:70'))).toBe('B is flat in B♭ major.');
    expect(keySentence(t, card('key:Eb:treble:63'))).toBe('E is flat in E♭ major.');
    expect(keySentence(t, card('key:G:treble:67'))).toBe('G is natural in G major.');
  });
  it('has no key sentence on a card with no key', () => {
    expect(keySentence(t, card('treble:64'))).toBeNull();
    expect(keySentence(t, card('treble:66:sharp'))).toBeNull();
  });
});

describe('landmark sentences', () => {
  it('name every landmark', () => {
    const names = Object.values(LANDMARKS)
      .flat()
      .map((a) => landmarkName(t, a.id));
    expect(names).toEqual([
      'middle C, on the ledger line below the staff',
      'the G on the second line',
      'the C in the third space',
      'the F on the top line',
      'the G on the bottom line',
      'the C in the second space',
      'the F on the fourth line',
      'middle C, on the ledger line above the staff',
    ]);
  });
  it('say a note on a landmark is that landmark', () => {
    expect(landmarkSentence(t, landmarkHint('bass', 53), 'F3')).toBe('F3 is the F on the fourth line.');
    expect(landmarkSentence(t, landmarkHint('bass', 60), 'C4')).toBe(
      'C4 is middle C, on the ledger line above the staff.',
    );
  });
});

describe('missSentences (the distance sentences Sprint shares keys with)', () => {
  it('reads as before', () => {
    const miss = describeMiss(60, { kind: 'midi', midi: 64 });
    expect(miss && missSentences(t, miss, true, 'C4', 'E4')).toEqual([
      'You played E4, not C4.',
      '2 steps above the right note.',
    ]);
    const octave = describeMiss(60, { kind: 'midi', midi: 72 });
    expect(octave && missSentences(t, octave, true, 'C4', 'C5')[1]).toBe('An octave above the right note.');
  });
});
