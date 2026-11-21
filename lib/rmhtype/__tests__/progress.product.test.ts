import {
  describe,
  expect,
  it,
} from 'vitest';
import {
  bestsTable,
  capPoints,
  changeVsPrevious,
  encodeRunCursor,
  iqr,
  median,
  parseRunCursor,
  rollingAverage,
  summarizeRuns,
  type BestRun,
} from '@/lib/rmhtype/progress';

const best =
  (
    over: Partial<BestRun>,
  ): BestRun => ({
    passageLength:
      'short',
    difficulty:
      'easy',
    wpm: 50,
    accuracy: 95,
    at: '2026-11-01T10:00:00.000Z',
    cursor:
      '2026-11-01T10:00:00.000Z',
    ...over,
  });

describe('rollingAverage', () => {
  it('starts with the first point and uses the part of the window that exists', () => {
    expect(
      rollingAverage(
        [
          10,
          20,
          30,
        ],
        7,
      ),
    ).toEqual(
      [
        10,
        15,
        20,
      ],
    );
  });

  it('is a trailing mean of the last seven points once the window is full', () => {
    const out =
      rollingAverage(
        [
          1,
          2,
          3,
          4,
          5,
          6,
          7,
          8,
        ],
        7,
      );
    expect(
      out[6],
    ).toBe(
      4,
    );
    expect(
      out[7],
    ).toBe(
      5,
    );
  });

  it('handles an empty series and a single point', () => {
    expect(
      rollingAverage(
        [],
      ),
    ).toEqual(
      [],
    );
    expect(
      rollingAverage(
        [
          42,
        ],
      ),
    ).toEqual(
      [
        42,
      ],
    );
  });
});

describe('iqr', () => {
  it('gives no figure for fewer than four runs', () => {
    expect(
      iqr(
        [],
      ),
    ).toBeNull();
    expect(
      iqr(
        [
          40,
          50,
          60,
        ],
      ),
    ).toBeNull();
  });

  it('is the spread of the middle half from four runs', () => {
    expect(
      iqr(
        [
          10,
          20,
          30,
          40,
        ],
      ),
    ).toBe(
      15,
    );
    expect(
      iqr(
        [
          40,
          10,
          30,
          20,
          50,
        ],
      ),
    ).toBe(
      20,
    );
  });
});

describe('changeVsPrevious', () => {
  it('is null when the previous range is empty', () => {
    expect(
      changeVsPrevious(
        60,
        null,
      ),
    ).toBeNull();
    expect(
      changeVsPrevious(
        null,
        50,
      ),
    ).toBeNull();
  });

  it('is the signed difference to one decimal', () => {
    expect(
      changeVsPrevious(
        66,
        60,
      ),
    ).toBe(
      6,
    );
    expect(
      changeVsPrevious(
        58.04,
        60,
      ),
    ).toBe(
      -2,
    );
  });
});

describe('bestsTable', () => {
  it('keeps the highest wpm per length and difficulty', () => {
    const rows =
      [
        best(
          {
            wpm: 50,
          },
        ),
        best(
          {
            wpm: 72,
          },
        ),
        best(
          {
            wpm: 61,
          },
        ),
      ];
    expect(
      bestsTable(
        rows,
      ),
    ).toHaveLength(
      1,
    );
    expect(
      bestsTable(
        rows,
      )[0]
        ?.wpm,
    ).toBe(
      72,
    );
  });

  it('breaks a wpm tie by accuracy, then by the earlier run', () => {
    const a =
      best(
        {
          wpm: 70,
          accuracy: 94,
          cursor:
            'a',
        },
      );
    const b =
      best(
        {
          wpm: 70,
          accuracy: 98,
          cursor:
            'b',
        },
      );
    expect(
      bestsTable(
        [
          a,
          b,
        ],
      )[0]
        ?.cursor,
    ).toBe(
      'b',
    );
    const early =
      best(
        {
          wpm: 70,
          accuracy: 98,
          at: '2026-10-01T00:00:00.000Z',
          cursor:
            'early',
        },
      );
    expect(
      bestsTable(
        [
          b,
          early,
        ],
      )[0]
        ?.cursor,
    ).toBe(
      'early',
    );
  });

  it('orders short to long and easy to hard', () => {
    const rows =
      [
        best(
          {
            passageLength:
              'long',
            difficulty:
              'hard',
          },
        ),
        best(
          {
            passageLength:
              'short',
            difficulty:
              'hard',
          },
        ),
        best(
          {
            passageLength:
              'short',
            difficulty:
              'easy',
          },
        ),
        best(
          {
            passageLength:
              'medium',
            difficulty:
              'medium',
          },
        ),
      ];
    expect(
      bestsTable(
        rows,
      ).map(
        (
          r,
        ) =>
          `${r.passageLength}/${r.difficulty}`,
      ),
    ).toEqual(
      [
        'short/easy',
        'short/hard',
        'medium/medium',
        'long/hard',
      ],
    );
  });
});

describe('summarizeRuns', () => {
  const run =
    (
      wpm: number,
      accuracy = 95,
    ) => ({
      wpm,
      accuracy,
      at: '2026-11-01T00:00:00.000Z',
    });

  it('summarises an empty range without inventing numbers', () => {
    expect(
      summarizeRuns(
        [],
        [
          50,
        ],
      ),
    ).toEqual(
      {
        runs: 0,
        medianWpm:
          null,
        changeWpm:
          null,
        best: null,
        consistency:
          null,
      },
    );
  });

  it('compares the median with the previous range', () => {
    const s =
      summarizeRuns(
        [
          run(
            60,
          ),
          run(
            70,
          ),
          run(
            80,
          ),
        ],
        [
          60,
          64,
        ],
      );
    expect(
      s.medianWpm,
    ).toBe(
      70,
    );
    expect(
      s.changeWpm,
    ).toBe(
      8,
    );
    expect(
      s
        .best
        ?.wpm,
    ).toBe(
      80,
    );
    expect(
      s.consistency,
    ).toBeNull();
  });

  it('has no change figure when the previous range is empty', () => {
    expect(
      summarizeRuns(
        [
          run(
            60,
          ),
          run(
            70,
          ),
        ],
        [],
      )
        .changeWpm,
    ).toBeNull();
  });
});

describe('median, capPoints and cursors', () => {
  it('takes the middle of an even count', () => {
    expect(
      median(
        [
          10,
          20,
          30,
          40,
        ],
      ),
    ).toBe(
      25,
    );
    expect(
      median(
        [],
      ),
    ).toBeNull();
  });

  it('keeps the newest points when over the budget', () => {
    expect(
      capPoints(
        [
          1,
          2,
          3,
          4,
          5,
        ],
        3,
      ),
    ).toEqual(
      [
        3,
        4,
        5,
      ],
    );
    expect(
      capPoints(
        [
          1,
          2,
        ],
        3,
      ),
    ).toEqual(
      [
        1,
        2,
      ],
    );
  });

  it('round-trips a cursor and rejects junk', () => {
    const at =
      '2026-11-01T10:00:00.000Z';
    expect(
      parseRunCursor(
        encodeRunCursor(
          at,
        ),
      ),
    ).toEqual(
      {
        at: new Date(
          at,
        ),
        id: null,
      },
    );
    expect(
      parseRunCursor(
        encodeRunCursor(
          at,
          'abc',
        ),
      ),
    ).toEqual(
      {
        at: new Date(
          at,
        ),
        id: 'abc',
      },
    );
    expect(
      parseRunCursor(
        'not a date',
      ),
    ).toBeNull();
  });
});
