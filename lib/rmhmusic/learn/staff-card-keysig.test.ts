import { describe, expect, it } from 'vitest';
import { KEY_CARD_KEYS } from './content/spelling';
import { CARD_ACC_X, CARD_NOTE_X, HEAD_RX, cardY, keySignatureLayout } from './staff-card-layout';
import { clefStep } from './theory/clef';

describe('keySignatureLayout', () => {
  it('draws as many signs as the key has accidentals, sharps for G D A and flats for F B♭ E♭', () => {
    const counts = Object.fromEntries(KEY_CARD_KEYS.map((k) => [k, keySignatureLayout('treble', k).length]));
    expect(counts).toEqual({ G: 1, D: 2, A: 3, F: 1, Bb: 2, Eb: 3 });
    for (const k of ['G', 'D', 'A'] as const) {
      expect(
        keySignatureLayout('treble', k).every((s) => s.kind === 'sharp'),
        k,
      ).toBe(true);
    }
    for (const k of ['F', 'Bb', 'Eb'] as const) {
      expect(
        keySignatureLayout('bass', k).every((s) => s.kind === 'flat'),
        k,
      ).toBe(true);
    }
  });

  it('puts the signs in the conventional places', () => {
    // Treble sharps: F5 then C5 then G5; flats: B4 then E5 then A4.
    const y = (clef: 'treble' | 'bass', midi: number) => cardY(clefStep(clef, midi));
    expect(keySignatureLayout('treble', 'A').map((s) => s.y)).toEqual([
      y('treble', 77),
      y('treble', 72),
      y('treble', 79),
    ]);
    expect(keySignatureLayout('treble', 'Eb').map((s) => s.y)).toEqual([
      y('treble', 71),
      y('treble', 76),
      y('treble', 69),
    ]);
    // Bass sharps: F3 then C3 then G3.
    expect(keySignatureLayout('bass', 'A').map((s) => s.y)).toEqual([y('bass', 53), y('bass', 48), y('bass', 55)]);
  });

  it('runs left to right after the clef and ends well before the note’s own sign', () => {
    for (const clef of ['treble', 'bass'] as const) {
      for (const k of KEY_CARD_KEYS) {
        const xs = keySignatureLayout(clef, k).map((s) => s.x);
        expect(xs).toEqual([...xs].sort((a, b) => a - b));
        expect(xs[0]).toBeGreaterThan(38); // the clef ends near 38
        expect(xs.at(-1)).toBeLessThan(CARD_ACC_X - 20);
      }
    }
    expect(CARD_ACC_X).toBe(CARD_NOTE_X - (HEAD_RX + 7));
  });
});
