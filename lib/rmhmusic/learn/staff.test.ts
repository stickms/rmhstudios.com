import {
  describe,
  expect,
  it,
} from 'vitest';
import {
  fitToStaff,
  isSharp,
  staffPosition,
  staffStep,
} from './staff';

describe('staffPosition (treble clef)', () => {
  it.each(
    [
      [
        60,
        -2,
        null,
        [
          -2,
        ],
      ], // middle C: first ledger line below
      [
        62,
        -1,
        null,
        [],
      ], // D4 hangs under the bottom line
      [
        64,
        0,
        null,
        [],
      ], // E4: bottom line
      [
        65,
        1,
        null,
        [],
      ], // F4: first space
      [
        71,
        4,
        null,
        [],
      ], // B4: middle line
      [
        77,
        8,
        null,
        [],
      ], // F5: top line
      [
        79,
        9,
        null,
        [],
      ], // G5: just above, no ledger line
      [
        81,
        10,
        null,
        [
          10,
        ],
      ], // A5: first ledger line above
      [
        84,
        12,
        null,
        [
          10,
          12,
        ],
      ], // C6: two ledger lines
      [
        57,
        -4,
        null,
        [
          -2,
          -4,
        ],
      ], // A3: two ledger lines below
      [
        59,
        -3,
        null,
        [
          -2,
        ],
      ], // B3: under the first ledger line
    ],
  )(
    'midi %i → step %i',
    (
      midi,
      step,
      accidental,
      ledgers,
    ) => {
      expect(
        staffPosition(
          midi,
        ),
      ).toEqual(
        {
          step,
          accidental,
          ledgerLines:
            ledgers,
        },
      );
    },
  );

  it('spells black keys as sharps on the letter below', () => {
    expect(
      staffPosition(
        61,
      ),
    ).toEqual(
      {
        step: -2,
        accidental:
          'sharp',
        ledgerLines:
          [
            -2,
          ],
      },
    ); // C#4
    expect(
      staffPosition(
        66,
      ),
    ).toMatchObject(
      {
        step: 1,
        accidental:
          'sharp',
      },
    ); // F#4
    expect(
      staffPosition(
        70,
      ),
    ).toMatchObject(
      {
        step: 3,
        accidental:
          'sharp',
      },
    ); // A#4
    expect(
      isSharp(
        61,
      ),
    ).toBe(
      true,
    );
    expect(
      isSharp(
        60,
      ),
    ).toBe(
      false,
    );
  });

  it('octaves move seven steps', () => {
    for (
      let m = 36;
      m <=
      96;
      m++
    ) {
      expect(
        staffStep(
          m +
            12,
        ) -
          staffStep(
            m,
          ),
      ).toBe(
        7,
      );
      expect(
        staffStep(
          m,
        ),
      ).toBe(
        staffPosition(
          m,
        )
          .step,
      );
    }
  });
});

describe('fitToStaff', () => {
  it('leaves notes that fit alone', () => {
    expect(
      fitToStaff(
        60,
      ),
    ).toEqual(
      {
        position:
          staffPosition(
            60,
          ),
        ottava: 0,
      },
    );
    expect(
      fitToStaff(
        88,
      ),
    ).toEqual(
      {
        position:
          staffPosition(
            88,
          ),
        ottava: 0,
      },
    ); // E6, step 14
  });

  it('moves low and high notes by octaves under an ottava sign', () => {
    // E2, a guitar's low string: drawn as E3 (step -7, four ledger lines) under 8vb.
    const low =
      fitToStaff(
        40,
      );
    expect(
      low.ottava,
    ).toBe(
      -1,
    );
    expect(
      low.position,
    ).toEqual(
      {
        step: -7,
        accidental:
          null,
        ledgerLines:
          [
            -2,
            -4,
            -6,
          ],
      },
    );
    expect(
      fitToStaff(
        28,
      )
        .ottava,
    ).toBe(
      -2,
    ); // E1: still too low after one octave
    const g3 =
      fitToStaff(
        55,
      ); // G3, step -5: fits
    expect(
      g3.ottava,
    ).toBe(
      0,
    );
    const high =
      fitToStaff(
        96,
      ); // C7, step 19
    expect(
      high.ottava,
    ).toBe(
      1,
    );
    expect(
      high
        .position
        .step,
    ).toBe(
      12,
    );
  });
});
