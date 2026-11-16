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
        octaveClef: false,
        note: {
          written: 60,
          accidental: 0,
        },
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
        octaveClef: false,
        note: {
          written: 59,
          accidental: 0,
        },
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
        octaveClef: false,
        note: {
          written: 60,
          accidental: 1,
        },
      },
    );
  });

  it('piano: says high or low past the card, on the clef the note belongs to', () => {
    expect(
      readPlacement(
        84,
        'piano',
      ),
    ).toHaveProperty(
      'note',
    ); // C6, two ledger lines up
    expect(
      readPlacement(
        85,
        'piano',
      ),
    ).toHaveProperty(
      'note',
    ); // C♯6 sits on C6
    expect(
      readPlacement(
        86,
        'piano',
      ),
    ).toEqual(
      {
        clef: 'treble',
        octaveClef: false,
        off: 'high',
      },
    );
    expect(
      readPlacement(
        31,
        'piano',
      ),
    ).toHaveProperty(
      'note',
    ); // G1
    // A0 stays on the bass staff (it is below it), it does not flip the card to treble.
    expect(
      readPlacement(
        21,
        'piano',
      ),
    ).toEqual(
      {
        clef: 'bass',
        octaveClef: false,
        off: 'low',
      },
    );
    expect(
      readPlacement(
        30,
        'piano',
      ),
    ).toEqual(
      {
        clef: 'bass',
        octaveClef: false,
        off: 'low',
      },
    );
    expect(
      readPlacement(
        Number.NaN,
        'piano',
      ),
    ).toEqual(
      {
        clef: 'treble',
        octaveClef: false,
        off: 'low',
      },
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
        octaveClef: true,
        note: {
          written: 52,
          accidental: 0,
        },
      },
    );
    expect(
      readPlacement(
        72,
        'guitar',
      ),
    ).toHaveProperty(
      'note',
    ); // C5, written C6
    expect(
      readPlacement(
        73,
        'guitar',
      ),
    ).toHaveProperty(
      'note',
    );
    expect(
      readPlacement(
        74,
        'guitar',
      ),
    ).toEqual(
      {
        clef: 'treble',
        octaveClef: true,
        off: 'high',
      },
    );
    expect(
      readPlacement(
        39,
        'guitar',
      ),
    ).toEqual(
      {
        clef: 'treble',
        octaveClef: true,
        off: 'low',
      },
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
