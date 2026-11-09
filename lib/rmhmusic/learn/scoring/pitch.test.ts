import { describe, expect, it } from 'vitest';
import { centsOff, pitchPoints, pitchVerdict } from './pitch';

describe('pitchPoints', () => {
  it('scores the exact pitch within 10 cents as 100', () => {
    expect(pitchPoints(60, { midi: 60 })).toBe(100);
    expect(pitchPoints(60, { midi: 60, cents: 3 })).toBe(100);
    expect(pitchPoints(60, { midi: 60, cents: -10 })).toBe(100);
    expect(pitchPoints(60, { midi: 60, cents: 10 })).toBe(100);
  });

  it('scores a neighbouring semitone, and anything further, as 0', () => {
    expect(pitchPoints(60, { midi: 61 })).toBe(0);
    expect(pitchPoints(60, { midi: 59 })).toBe(0);
    expect(pitchPoints(60, { midi: 60, cents: 100 })).toBe(0);
    expect(pitchPoints(60, { midi: 67 })).toBe(0);
  });

  it('scores a different octave as 0, even sung in tune', () => {
    expect(pitchPoints(60, { midi: 72 })).toBe(0);
    expect(pitchPoints(60, { midi: 48 })).toBe(0);
    expect(pitchPoints(60, { midi: 72, cents: -2 })).toBe(0);
  });

  it('falls linearly from 100 at 10 cents to 0 at 100 cents', () => {
    expect(pitchPoints(60, { midi: 60, cents: -50 })).toBeGreaterThan(0);
    expect(pitchPoints(60, { midi: 60, cents: -50 })).toBeLessThan(100);
    expect(pitchPoints(60, { midi: 60, cents: 55 })).toBeCloseTo(50, 10);
    expect(pitchPoints(60, { midi: 60, cents: -91 })).toBeCloseTo(10, 10);
  });

  it('is monotone in |cents| between 10 and 100, and the same flat or sharp', () => {
    let previous = 101;
    for (let c = 10; c <= 100; c++) {
      const sharp = pitchPoints(60, { midi: 60, cents: c });
      const flat = pitchPoints(60, { midi: 60, cents: -c });
      expect(flat).toBe(sharp);
      expect(sharp).toBeLessThan(previous);
      expect(sharp).toBeGreaterThanOrEqual(0);
      expect(sharp).toBeLessThanOrEqual(100);
      previous = sharp;
    }
  });

  it('measures across the note boundary: B3 +95 cents is 5 cents flat of C4', () => {
    expect(centsOff(60, { midi: 59, cents: 95 })).toBe(-5);
    expect(pitchPoints(60, { midi: 59, cents: 95 })).toBe(100);
    // B3 +50 is 50 cents flat: the same as C4 −50.
    expect(pitchPoints(60, { midi: 59, cents: 50 })).toBe(
      pitchPoints(60, { midi: 60, cents: -50 }),
    );
    // C#4 −60 is 40 cents sharp.
    expect(centsOff(60, { midi: 61, cents: -60 })).toBe(40);
    expect(pitchPoints(60, { midi: 61, cents: -60 })).toBeCloseTo(66.667, 2);
  });

  it('treats a missing or non-finite cents as 0 and a non-finite pitch as a miss', () => {
    expect(pitchPoints(60, { midi: 60, cents: Number.NaN })).toBe(100);
    expect(pitchPoints(60, { midi: 61, cents: Number.POSITIVE_INFINITY })).toBe(0);
    expect(pitchPoints(60, { midi: Number.NaN })).toBe(0);
    expect(pitchPoints(Number.NaN, { midi: 60 })).toBe(0);
  });
});

describe('pitchVerdict', () => {
  it('says spot on within 10 cents', () => {
    expect(pitchVerdict(60, { midi: 60 })).toEqual({ kind: 'spot-on', heard: 60 });
    expect(pitchVerdict(60, { midi: 59, cents: 95 })).toEqual({ kind: 'spot-on', heard: 60 });
  });

  it('says a little flat or sharp up to 50 cents, and flat or sharp below a semitone', () => {
    expect(pitchVerdict(60, { midi: 60, cents: -30 }).kind).toBe('a-little-flat');
    expect(pitchVerdict(60, { midi: 60, cents: 50 }).kind).toBe('a-little-sharp');
    expect(pitchVerdict(60, { midi: 59, cents: 30 }).kind).toBe('flat');
    expect(pitchVerdict(60, { midi: 61, cents: -40 }).kind).toBe('sharp');
  });

  it('names a wrong note by the nearest semitone it was heard as', () => {
    expect(pitchVerdict(60, { midi: 67 })).toEqual({ kind: 'wrong', heard: 67 });
    expect(pitchVerdict(60, { midi: 61 })).toEqual({ kind: 'wrong', heard: 61 });
    expect(pitchVerdict(60, { midi: 62, cents: -45 })).toEqual({ kind: 'wrong', heard: 62 });
  });

  it('tells a different octave apart from a wrong note', () => {
    expect(pitchVerdict(60, { midi: 72 })).toEqual({ kind: 'octave', heard: 72 });
    expect(pitchVerdict(60, { midi: 71, cents: 95 })).toEqual({ kind: 'octave', heard: 72 });
    expect(pitchVerdict(60, { midi: 48, cents: 20 })).toEqual({ kind: 'octave', heard: 48 });
  });
});

describe('pitchVerdict: boundaries', () => {
  it('is spot on at 10 cents and a little off just past it', () => {
    expect(pitchVerdict(60, { midi: 60, cents: 10 }).kind).toBe('spot-on');
    expect(pitchVerdict(60, { midi: 60, cents: 10.01 }).kind).toBe('a-little-sharp');
    expect(pitchVerdict(60, { midi: 60, cents: -10 }).kind).toBe('spot-on');
    expect(pitchVerdict(60, { midi: 60, cents: -10.01 }).kind).toBe('a-little-flat');
  });

  it('is a little off up to 50 cents and quite off just past it', () => {
    expect(pitchVerdict(60, { midi: 60, cents: 50 }).kind).toBe('a-little-sharp');
    expect(pitchVerdict(60, { midi: 60, cents: 50.01 }).kind).toBe('sharp');
    expect(pitchVerdict(60, { midi: 60, cents: -50 }).kind).toBe('a-little-flat');
    expect(pitchVerdict(60, { midi: 60, cents: -50.01 }).kind).toBe('flat');
  });

  it('is quite off up to 99.99 cents and a wrong note from a semitone', () => {
    expect(pitchVerdict(60, { midi: 60, cents: 99.99 }).kind).toBe('sharp');
    expect(pitchVerdict(60, { midi: 60, cents: -99.99 }).kind).toBe('flat');
    expect(pitchVerdict(60, { midi: 60, cents: 100 })).toEqual({ kind: 'wrong', heard: 61 });
    expect(pitchVerdict(60, { midi: 60, cents: -100 })).toEqual({ kind: 'wrong', heard: 59 });
  });

  it('names an octave exactly at 1200 cents and not a note short of it', () => {
    expect(pitchVerdict(60, { midi: 72 }).kind).toBe('octave');
    expect(pitchVerdict(60, { midi: 60, cents: 1200 }).kind).toBe('octave');
    expect(pitchVerdict(60, { midi: 71 }).kind).toBe('wrong');
  });

  it('an infinite or NaN error is a wrong note, never spot on', () => {
    expect(centsOff(60, { midi: Number.POSITIVE_INFINITY })).toBe(Number.POSITIVE_INFINITY);
    expect(centsOff(60, { midi: Number.NEGATIVE_INFINITY })).toBe(Number.NEGATIVE_INFINITY);
    expect(centsOff(60, { midi: Number.NaN })).toBeNaN();
    for (const midi of [Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NaN]) {
      expect(pitchVerdict(60, { midi }).kind).toBe('wrong');
      expect(pitchPoints(60, { midi })).toBe(0);
    }
    // A non-finite `cents` is read as 0, so the note itself decides.
    expect(centsOff(60, { midi: 60, cents: Number.POSITIVE_INFINITY })).toBe(0);
    expect(pitchVerdict(60, { midi: 60, cents: Number.POSITIVE_INFINITY }).kind).toBe('spot-on');
    expect(pitchVerdict(60, { midi: 61, cents: Number.NEGATIVE_INFINITY }).kind).toBe('wrong');
  });
});

describe('pitchVerdict and pitchPoints agree', () => {
  it('"spot on" is exactly the notes worth 100, across every offset', () => {
    for (const midi of [48, 59, 60, 61, 72]) {
      for (let c = -1300; c <= 1300; c += 0.25) {
        const played = { midi, cents: c };
        const spot = pitchVerdict(60, played).kind === 'spot-on';
        expect(spot).toBe(pitchPoints(60, played) === 100);
      }
    }
  });
});
