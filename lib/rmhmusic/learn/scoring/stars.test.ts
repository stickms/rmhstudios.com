import {
  describe,
  expect,
  it,
} from 'vitest';
import {
  scoreFrom,
  scoreFromPoints,
  starsFor,
} from './stars';

describe('starsFor', () => {
  it.each(
    [
      [
        100,
        3,
      ],
      [
        95,
        3,
      ],
      [
        94,
        2,
      ],
      [
        80,
        2,
      ],
      [
        79,
        1,
      ],
      [
        60,
        1,
      ],
      [
        59,
        0,
      ],
      [
        0,
        0,
      ],
      [
        NaN,
        0,
      ],
      [
        -5,
        0,
      ],
      [
        -Infinity,
        0,
      ],
      [
        250,
        3,
      ],
    ] as const,
  )(
    'score %i → %i stars',
    (
      score,
      stars,
    ) => {
      expect(
        starsFor(
          score,
        ),
      ).toBe(
        stars,
      );
    },
  );
});

describe('scoreFrom', () => {
  it('rounds to a whole percent', () => {
    expect(
      scoreFrom(
        7,
        10,
      ),
    ).toBe(
      70,
    );
    expect(
      scoreFrom(
        2,
        3,
      ),
    ).toBe(
      67,
    );
  });
  it('is 0 with nothing attempted', () => {
    expect(
      scoreFrom(
        0,
        0,
      ),
    ).toBe(
      0,
    );
  });
  it('is 0 for NaN, negative or non-finite inputs', () => {
    const odd =
      [
        NaN,
        -1,
        Infinity,
        -Infinity,
      ];
    for (const a of odd)
      expect(
        scoreFrom(
          a,
          10,
        ),
      ).toBe(
        0,
      );
    for (const b of odd)
      expect(
        scoreFrom(
          5,
          b,
        ),
      ).toBe(
        0,
      );
    expect(
      scoreFrom(
        Infinity,
        Infinity,
      ),
    ).toBe(
      0,
    );
    expect(
      scoreFrom(
        NaN,
        NaN,
      ),
    ).toBe(
      0,
    );
  });
  it('caps an over-count at 100', () => {
    expect(
      scoreFrom(
        12,
        10,
      ),
    ).toBe(
      100,
    );
  });
});

describe('scoreFromPoints', () => {
  it('is the rounded mean of 0..100 points', () => {
    expect(
      scoreFromPoints(
        [
          100,
          50,
          0,
        ],
      ),
    ).toBe(
      50,
    );
    expect(
      scoreFromPoints(
        [
          100,
          100,
          66.67,
        ],
      ),
    ).toBe(
      89,
    );
    expect(
      scoreFromPoints(
        [
          100,
          99.5,
        ],
      ),
    ).toBe(
      100,
    );
    expect(
      scoreFromPoints(
        [
          100,
          0,
          0,
        ],
      ),
    ).toBe(
      33,
    );
  });

  it('rounds exactly as scoreFrom does when every point is all or nothing', () => {
    for (const total of [
      1,
      3,
      7,
      10,
    ]) {
      for (
        let right = 0;
        right <=
        total;
        right++
      ) {
        const points =
          Array.from(
            {
              length:
                total,
            },
            (
              _,
              i,
            ) =>
              i <
              right
                ? 100
                : 0,
          );
        expect(
          scoreFromPoints(
            points,
          ),
          `${right}/${total}`,
        ).toBe(
          scoreFrom(
            right,
            total,
          ),
        );
      }
    }
  });

  it('is 0 for nothing, and a bad entry counts as 0 and never lifts the score past 100', () => {
    expect(
      scoreFromPoints(
        [],
      ),
    ).toBe(
      0,
    );
    expect(
      scoreFromPoints(
        [
          Number.NaN,
          100,
        ],
      ),
    ).toBe(
      50,
    );
    expect(
      scoreFromPoints(
        [
          -40,
          100,
        ],
      ),
    ).toBe(
      50,
    );
    expect(
      scoreFromPoints(
        [
          Number.POSITIVE_INFINITY,
          100,
        ],
      ),
    ).toBe(
      50,
    );
    expect(
      scoreFromPoints(
        [
          250,
          100,
        ],
      ),
    ).toBe(
      100,
    );
    expect(
      Number.isInteger(
        scoreFromPoints(
          [
            12.3,
            45.6,
            78.9,
          ],
        ),
      ),
    ).toBe(
      true,
    );
  });
});
