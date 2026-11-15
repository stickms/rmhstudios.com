import { describe, expect, it } from 'vitest';
import { fretMidi } from '../theory/fretboard';
import { fingerFor } from './fingering';

describe('fingerFor', () => {
  it('plays open strings open', () => {
    expect(fingerFor(40)).toEqual({ string: 0, fret: 0 });
    expect(fingerFor(45)).toEqual({ string: 1, fret: 0 });
    expect(fingerFor(50)).toEqual({ string: 2, fret: 0 });
    expect(fingerFor(55)).toEqual({ string: 3, fret: 0 });
    expect(fingerFor(59)).toEqual({ string: 4, fret: 0 });
    expect(fingerFor(64)).toEqual({ string: 5, fret: 0 });
  });

  it('stays in open position: B3 is the open B string, not the G string at the 4th fret', () => {
    expect(fingerFor(59)).toEqual({ string: 4, fret: 0 });
    expect(fingerFor(48)).toEqual({ string: 1, fret: 3 }); // C3
    expect(fingerFor(57)).toEqual({ string: 3, fret: 2 }); // A3
    expect(fingerFor(60)).toEqual({ string: 4, fret: 1 }); // C4
    expect(fingerFor(66)).toEqual({ string: 5, fret: 2 }); // F#4
    expect(fingerFor(67)).toEqual({ string: 5, fret: 3 }); // G4
    expect(fingerFor(43)).toEqual({ string: 0, fret: 3 }); // G2
  });

  it('goes up the neck only when it must (A4 is the high E string, 5th fret)', () => {
    expect(fingerFor(69)).toEqual({ string: 5, fret: 5 });
    expect(fingerFor(76)).toEqual({ string: 5, fret: 12 });
  });

  it('every position it gives sounds the note, and open position is used whenever it can be', () => {
    for (let m = 40; m <= 88; m++) {
      const p = fingerFor(m);
      expect(p, String(m)).not.toBeNull();
      if (!p) continue;
      expect(fretMidi(p.string, p.fret)).toBe(m);
      if (m <= 68) expect(p.fret, String(m)).toBeLessThanOrEqual(4);
    }
  });

  it('has no fingering below the low E, past the last fret, or for a non-integer', () => {
    expect(fingerFor(39)).toBeNull();
    expect(fingerFor(89)).toBeNull();
    expect(fingerFor(60.5)).toBeNull();
    expect(fingerFor(Number.NaN)).toBeNull();
  });
});
