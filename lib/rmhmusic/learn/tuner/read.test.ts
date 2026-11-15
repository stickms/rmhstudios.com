import {
  describe,
  expect,
  it,
} from 'vitest';
import {
  CARD_LOW_MIN_STEP,
  CARD_MAX_STEP,
} from '../staff-card-layout';
import {
  READ_MAX_STEP,
  READ_MIN_STEP,
  readName,
  readPlacement,
} from './read';

describe('note reader placement', () => {
  it('uses the low card the reader draws on', () => {
    expect(
      READ_MIN_STEP,
    ).toBe(
      CARD_LOW_MIN_STEP,
    );
    expect(
      READ_MAX_STEP,
    ).toBe(
      CARD_MAX_STEP,
    );
  });

  it('piano: treble from middle C, bass below, sharps on the natural below', () => {
    expect(
      readPlacement(
        60,
        'piano',
      ),
    ).toEqual(
      {
        clef: 'treble',
        note: {
          written: 60,
          accidental: 0,
        },
        octaveClef: false,
      },
    );
    expect(
      readPlacement(
        59,
        'piano',
      ),
    ).toEqual(
      {
        clef: 'bass',
        note: {
          written: 59,
          accidental: 0,
        },
        octaveClef: false,
      },
    );
    expect(
      readPlacement(
        61,
        'piano',
      ),
    ).toEqual(
      {
        clef: 'treble',
        note: {
          written: 60,
          accidental: 1,
        },
        octaveClef: false,
      },
    );
  });

  it('piano: says high or low past the card instead of drawing it', () => {
    expect(
      readPlacement(
        84,
        'piano',
      ),
    ).not.toBeTypeOf(
      'string',
    ); // C6, two ledger lines up
    expect(
      readPlacement(
        85,
        'piano',
      ),
    ).not.toBeTypeOf(
      'string',
    ); // C♯6 sits on C6
    expect(
      readPlacement(
        86,
        'piano',
      ),
    ).toBe(
      'high',
    ); // D6
    expect(
      readPlacement(
        31,
        'piano',
      ),
    ).not.toBeTypeOf(
      'string',
    ); // G1
    expect(
      readPlacement(
        30,
        'piano',
      ),
    ).toBe(
      'low',
    ); // F♯1 sits on F1
    expect(
      readPlacement(
        Number.NaN,
        'piano',
      ),
    ).toBe(
      'low',
    );
  });

  it('guitar: treble an octave up with the small 8, open E to C♯5', () => {
    expect(
      readPlacement(
        40,
        'guitar',
      ),
    ).toEqual(
      {
        clef: 'treble',
        note: {
          written: 52,
          accidental: 0,
        },
        octaveClef: true,
      },
    );
    expect(
      readPlacement(
        72,
        'guitar',
      ),
    ).not.toBeTypeOf(
      'string',
    ); // C5, written C6
    expect(
      readPlacement(
        73,
        'guitar',
      ),
    ).not.toBeTypeOf(
      'string',
    );
    expect(
      readPlacement(
        74,
        'guitar',
      ),
    ).toBe(
      'high',
    );
    expect(
      readPlacement(
        39,
        'guitar',
      ),
    ).toBe(
      'low',
    );
  });

  it('names notes with their octave and a real sharp sign', () => {
    expect(
      readName(
        69,
      ),
    ).toBe(
      'A4',
    );
    expect(
      readName(
        61,
      ),
    ).toBe(
      'C♯4',
    );
    expect(
      readName(
        40,
      ),
    ).toBe(
      'E2',
    );
  });
});
