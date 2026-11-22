import { describe, expect, it } from 'vitest';
import { LANDMARKS, landmarkHint } from './landmarks';
import { clefStep } from './theory/clef';

describe('landmarks', () => {
  it('sit where the staff says they do', () => {
    const steps = (clef: 'treble' | 'bass') => LANDMARKS[clef].map((a) => [a.id, clefStep(clef, a.midi)]);
    expect(steps('treble')).toEqual([
      ['treble-middle-c', -2], // the first ledger line below
      ['treble-g', 2], // the second line
      ['treble-c', 5], // the third space
      ['treble-f', 8], // the top line
    ]);
    expect(steps('bass')).toEqual([
      ['bass-g', 0], // the bottom line
      ['bass-c', 3], // the second space
      ['bass-f', 6], // the fourth line
      ['bass-middle-c', 10], // the first ledger line above
    ]);
  });

  it('are listed lowest first, so a tie goes to the lower anchor', () => {
    for (const clef of ['treble', 'bass'] as const) {
      const ms = LANDMARKS[clef].map((a) => a.midi);
      expect(ms).toEqual([...ms].sort((a, b) => a - b));
    }
  });

  it('say a note on an anchor is on it', () => {
    expect(landmarkHint('treble', 67)).toMatchObject({ direction: 'on', steps: 0 });
    expect(landmarkHint('treble', 67).landmark.id).toBe('treble-g');
    expect(landmarkHint('bass', 53).landmark.id).toBe('bass-f');
    expect(landmarkHint('bass', 60)).toMatchObject({ direction: 'on' });
  });

  it('count from the nearest anchor, above or below', () => {
    // A4 is one step above the treble G; D5 one above the third-space C; B4 one below it.
    expect(landmarkHint('treble', 69)).toMatchObject({ direction: 'above', steps: 1 });
    expect(landmarkHint('treble', 69).landmark.id).toBe('treble-g');
    expect(landmarkHint('treble', 74)).toMatchObject({ direction: 'above', steps: 1 });
    expect(landmarkHint('treble', 74).landmark.id).toBe('treble-c');
    expect(landmarkHint('treble', 71)).toMatchObject({ direction: 'below', steps: 1 });
    expect(landmarkHint('treble', 71).landmark.id).toBe('treble-c');
    // Bass: E3 is one below F3, B2 one below C3... counted from the nearest.
    expect(landmarkHint('bass', 52)).toMatchObject({ direction: 'below', steps: 1 });
    expect(landmarkHint('bass', 52).landmark.id).toBe('bass-f');
    expect(landmarkHint('bass', 47)).toMatchObject({ direction: 'below', steps: 1 });
    expect(landmarkHint('bass', 47).landmark.id).toBe('bass-c');
  });

  it('send a tie to the lower anchor', () => {
    // E4 (the treble's bottom line) is two steps from middle C below and two from the G above.
    expect(landmarkHint('treble', 64)).toMatchObject({ direction: 'above', steps: 2 });
    expect(landmarkHint('treble', 64).landmark.id).toBe('treble-middle-c');
  });

  it('always find an anchor, even for a note far off the staff', () => {
    expect(landmarkHint('treble', 96).landmark.id).toBe('treble-f');
    expect(landmarkHint('treble', 96).steps).toBeGreaterThan(5);
    expect(landmarkHint('bass', 24).landmark.id).toBe('bass-g');
  });

  it('measures a card by the natural it is written on', () => {
    // B♭4 sounds as 70 and is written on B4 (71): one step below the third-space C, not the A♯ a sharp spelling suggests.
    expect(landmarkHint('treble', 71)).toMatchObject({ direction: 'below', steps: 1 });
  });
});
