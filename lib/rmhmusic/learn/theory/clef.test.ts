import {
  describe,
  expect,
  it,
} from 'vitest';
import {
  clefStep,
  ledgerSteps,
  MAX_LEDGER_STEPS,
  noteLetter,
} from './clef';

describe('clefStep', () => {
  it.each(
    [
      [
        'treble',
        64,
        0,
      ], // E4: bottom line
      [
        'treble',
        60,
        -2,
      ], // C4: first ledger line below
      [
        'treble',
        77,
        8,
      ], // F5: top line
      [
        'bass',
        43,
        0,
      ], // G2: bottom line
      [
        'bass',
        60,
        10,
      ], // middle C: first ledger line above the bass staff
      [
        'bass',
        40,
        -2,
      ], // E2: first ledger line below
      [
        'bass',
        57,
        8,
      ], // A3: top line
      [
        'treble',
        84,
        12,
      ], // C6: second ledger line above
    ] as const,
  )(
    '%s clef, midi %i → step %i',
    (
      clef,
      midi,
      step,
    ) => {
      expect(
        clefStep(
          clef,
          midi,
        ),
      ).toBe(
        step,
      );
    },
  );

  it('throws RangeError for a non-finite midi, like noteLetter', () => {
    for (const bad of [
      NaN,
      Infinity,
      -Infinity,
    ]) {
      expect(
        () =>
          clefStep(
            'treble',
            bad,
          ),
      ).toThrow(
        RangeError,
      );
      expect(
        () =>
          clefStep(
            'bass',
            bad,
          ),
      ).toThrow(
        RangeError,
      );
    }
  });
});

describe('ledgerSteps', () => {
  it.each(
    [
      [
        -4,
        [
          -2,
          -4,
        ],
      ],
      [
        12,
        [
          10,
          12,
        ],
      ],
      [
        3,
        [],
      ],
      [
        -1,
        [],
      ], // a space just below the staff needs no line
      [
        -2,
        [
          -2,
        ],
      ],
      [
        8,
        [],
      ], // the top line is part of the staff
      [
        9,
        [],
      ],
      [
        10,
        [
          10,
        ],
      ],
    ],
  )(
    'step %i → %j',
    (
      step,
      lines,
    ) => {
      expect(
        ledgerSteps(
          step,
        ),
      ).toEqual(
        lines,
      );
    },
  );

  it('gives five lines below the staff for treble A2', () => {
    expect(
      clefStep(
        'treble',
        45,
      ),
    ).toBe(
      -11,
    ); // a space below the fifth ledger line
    expect(
      ledgerSteps(
        clefStep(
          'treble',
          45,
        ),
      ),
    ).toEqual(
      [
        -2,
        -4,
        -6,
        -8,
        -10,
      ],
    );
  });

  it('returns nothing for a non-finite step instead of looping', () => {
    for (const bad of [
      NaN,
      Infinity,
      -Infinity,
    ])
      expect(
        ledgerSteps(
          bad,
        ),
      ).toEqual(
        [],
      );
  });

  it('bounds a huge finite step', () => {
    for (const huge of [
      1e9,
      -1e9,
      Number.MAX_VALUE,
      -Number.MAX_VALUE,
    ]) {
      expect(
        ledgerSteps(
          huge,
        ),
      ).toHaveLength(
        MAX_LEDGER_STEPS,
      );
    }
    expect(
      ledgerSteps(
        -1e9,
      )[0],
    ).toBe(
      -2,
    );
    expect(
      ledgerSteps(
        1e9,
      )[0],
    ).toBe(
      10,
    );
  });
});

describe('noteLetter', () => {
  it('keeps the natural letter for a sharp', () => {
    expect(
      noteLetter(
        61,
      ),
    ).toBe(
      'C',
    );
  });
  it('names naturals across octaves', () => {
    expect(
      noteLetter(
        60,
      ),
    ).toBe(
      'C',
    );
    expect(
      noteLetter(
        64,
      ),
    ).toBe(
      'E',
    );
    expect(
      noteLetter(
        71,
      ),
    ).toBe(
      'B',
    );
    expect(
      noteLetter(
        43,
      ),
    ).toBe(
      'G',
    );
  });
  it('throws RangeError for non-finite input rather than returning undefined', () => {
    for (const bad of [
      NaN,
      Infinity,
      -Infinity,
    ]) {
      expect(
        () =>
          noteLetter(
            bad,
          ),
      ).toThrow(
        RangeError,
      );
    }
  });
});
