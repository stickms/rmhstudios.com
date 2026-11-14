import {
  describe,
  expect,
  it,
} from 'vitest';
import {
  FIRST_FRETS,
  STANDARD_TUNING,
  STRING_COUNT,
  fretMidi,
  isPosition,
  naturalsInFrets,
  positionsOf,
  stringNumber,
  writtenMidi,
} from './fretboard';

describe('standard tuning', () => {
  it('is E2 A2 D3 G3 B3 E4, low to high', () => {
    expect(
      STANDARD_TUNING,
    ).toEqual(
      [
        40,
        45,
        50,
        55,
        59,
        64,
      ],
    );
    expect(
      STRING_COUNT,
    ).toBe(
      6,
    );
  });

  it('numbers strings as guitarists do: index 5 (high E) is string 1, index 0 (low E) string 6', () => {
    expect(
      stringNumber(
        5,
      ),
    ).toBe(
      1,
    );
    expect(
      stringNumber(
        0,
      ),
    ).toBe(
      6,
    );
    expect(
      stringNumber(
        3,
      ),
    ).toBe(
      3,
    );
  });
});

describe('fretMidi', () => {
  it('adds the fret to the open string', () => {
    expect(
      fretMidi(
        0,
        0,
      ),
    ).toBe(
      40,
    );
    expect(
      fretMidi(
        1,
        5,
      ),
    ).toBe(
      50,
    );
    expect(
      fretMidi(
        5,
        12,
      ),
    ).toBe(
      76,
    );
    expect(
      fretMidi(
        4,
        0,
      ),
    ).toBe(
      59,
    );
  });

  it('throws RangeError for a string or fret that is not on the board', () => {
    expect(
      () =>
        fretMidi(
          -1,
          0,
        ),
    ).toThrow(
      RangeError,
    );
    expect(
      () =>
        fretMidi(
          6,
          0,
        ),
    ).toThrow(
      RangeError,
    );
    expect(
      () =>
        fretMidi(
          0,
          -1,
        ),
    ).toThrow(
      RangeError,
    );
    expect(
      () =>
        fretMidi(
          0,
          1.5,
        ),
    ).toThrow(
      RangeError,
    );
    expect(
      () =>
        fretMidi(
          Number.NaN,
          0,
        ),
    ).toThrow(
      RangeError,
    );
    expect(
      () =>
        fretMidi(
          0,
          Number.POSITIVE_INFINITY,
        ),
    ).toThrow(
      RangeError,
    );
  });

  it('isPosition says the same without throwing', () => {
    expect(
      isPosition(
        0,
        0,
      ),
    ).toBe(
      true,
    );
    expect(
      isPosition(
        5,
        24,
      ),
    ).toBe(
      true,
    );
    expect(
      isPosition(
        6,
        0,
      ),
    ).toBe(
      false,
    );
    expect(
      isPosition(
        0,
        -1,
      ),
    ).toBe(
      false,
    );
    expect(
      isPosition(
        2.5,
        1,
      ),
    ).toBe(
      false,
    );
  });
});

describe('positionsOf', () => {
  it('finds every string and fret that sounds the note, low string first', () => {
    const e4 =
      positionsOf(
        64,
        12,
      );
    expect(
      e4,
    ).toContainEqual(
      {
        string: 5,
        fret: 0,
      },
    );
    expect(
      e4,
    ).toContainEqual(
      {
        string: 4,
        fret: 5,
      },
    );
    expect(
      e4,
    ).toContainEqual(
      {
        string: 3,
        fret: 9,
      },
    );
    expect(
      e4,
    ).toEqual(
      [
        {
          string: 3,
          fret: 9,
        },
        {
          string: 4,
          fret: 5,
        },
        {
          string: 5,
          fret: 0,
        },
      ],
    );
  });

  it('keeps to frets 0..maxFret', () => {
    expect(
      positionsOf(
        64,
        5,
      ),
    ).toEqual(
      [
        {
          string: 4,
          fret: 5,
        },
        {
          string: 5,
          fret: 0,
        },
      ],
    );
    expect(
      positionsOf(
        40,
        5,
      ),
    ).toEqual(
      [
        {
          string: 0,
          fret: 0,
        },
      ],
    );
    expect(
      positionsOf(
        39,
        5,
      ),
    ).toEqual(
      [],
    ); // below the low E
    expect(
      positionsOf(
        70,
        5,
      ),
    ).toEqual(
      [],
    ); // above the high E's fifth fret
  });

  it('gives nothing for a non-integer or non-finite note or a bad maxFret', () => {
    expect(
      positionsOf(
        64.5,
        12,
      ),
    ).toEqual(
      [],
    );
    expect(
      positionsOf(
        Number.NaN,
        12,
      ),
    ).toEqual(
      [],
    );
    expect(
      positionsOf(
        64,
        -1,
      ),
    ).toEqual(
      [],
    );
    expect(
      positionsOf(
        64,
        Number.NaN,
      ),
    ).toEqual(
      [],
    );
  });

  it('every position it returns sounds the note', () => {
    for (
      let midi = 30;
      midi <
      90;
      midi++
    ) {
      for (const p of positionsOf(
        midi,
        12,
      ))
        expect(
          fretMidi(
            p.string,
            p.fret,
          ),
        ).toBe(
          midi,
        );
    }
  });
});

describe('writtenMidi (guitar is written an octave above it sounds)', () => {
  it('writes the open low E, which sounds E2 (40), as E3 (52)', () => {
    expect(
      writtenMidi(
        40,
      ),
    ).toBe(
      52,
    );
    expect(
      writtenMidi(
        64,
      ),
    ).toBe(
      76,
    );
    expect(
      writtenMidi(
        60,
      ),
    ).toBe(
      72,
    );
  });
});

describe('naturalsInFrets', () => {
  it('lists the natural notes reachable in frets 0-5, E2 to A4', () => {
    expect(
      naturalsInFrets(
        FIRST_FRETS,
      ),
    ).toEqual(
      [
        40,
        41,
        43,
        45,
        47,
        48,
        50,
        52,
        53,
        55,
        57,
        59,
        60,
        62,
        64,
        65,
        67,
        69,
      ],
    );
    for (const m of naturalsInFrets(
      FIRST_FRETS,
    )) {
      expect(
        positionsOf(
          m,
          FIRST_FRETS,
        )
          .length,
      ).toBeGreaterThan(
        0,
      );
    }
  });
});
