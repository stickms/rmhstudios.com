import {
  describe,
  expect,
  it,
} from 'vitest';
import {
  changeOf,
  formatBest,
  formatChange,
  improvementOver,
  stepSeries,
  type BestRow,
} from '@/lib/game/personal-bests';

const NOW =
  Date.parse(
    '2026-11-21T12:00:00.000Z',
  );
const daysAgo =
  (
    d: number,
  ) =>
    new Date(
      NOW -
        d *
          86_400_000,
    ).toISOString();
const row =
  (
    score: number,
    previous:
      | number
      | null,
    d: number,
  ): BestRow => ({
    score,
    previous,
    at: daysAgo(
      d,
    ),
  });

describe('improvementOver', () => {
  const rows =
    [
      row(
        100,
        null,
        60,
      ),
      row(
        150,
        100,
        40,
      ),
      row(
        200,
        150,
        10,
      ),
      row(
        260,
        200,
        2,
      ),
    ];

  it('is the best now minus the best the window started with', () => {
    expect(
      improvementOver(
        rows,
        30,
        NOW,
      ),
    ).toBe(
      260 -
        150,
    );
  });

  it('measures a window holding the first score from that score', () => {
    expect(
      improvementOver(
        [
          row(
            100,
            null,
            5,
          ),
          row(
            130,
            100,
            1,
          ),
        ],
        30,
        NOW,
      ),
    ).toBe(
      30,
    );
    expect(
      improvementOver(
        [
          row(
            100,
            null,
            5,
          ),
        ],
        30,
        NOW,
      ),
    ).toBe(
      0,
    );
  });

  it('is null when no record was set in the window or there are none', () => {
    expect(
      improvementOver(
        rows,
        1,
        NOW,
      ),
    ).toBeNull();
    expect(
      improvementOver(
        [],
        30,
        NOW,
      ),
    ).toBeNull();
  });

  it('reads negative for a lower-is-better game', () => {
    const times =
      [
        row(
          9000,
          null,
          50,
        ),
        row(
          8200,
          9000,
          20,
        ),
        row(
          7000,
          8200,
          3,
        ),
      ];
    expect(
      improvementOver(
        times,
        30,
        NOW,
      ),
    ).toBe(
      7000 -
        9000,
    );
  });

  it('does not depend on the order the rows arrive in', () => {
    expect(
      improvementOver(
        [
          ...rows,
        ].reverse(),
        30,
        NOW,
      ),
    ).toBe(
      110,
    );
  });
});

describe('stepSeries', () => {
  it('is empty with no rows and one point for one row', () => {
    expect(
      stepSeries(
        [],
      ),
    ).toEqual(
      [],
    );
    expect(
      stepSeries(
        [
          row(
            100,
            null,
            5,
          ),
        ],
      ),
    ).toEqual(
      [
        {
          x: daysAgo(
            5,
          ),
          y: 100,
        },
      ],
    );
  });

  it('holds the old level until the moment of the record, oldest first', () => {
    const points =
      stepSeries(
        [
          row(
            150,
            100,
            2,
          ),
          row(
            100,
            null,
            5,
          ),
        ],
      );
    expect(
      points.map(
        (
          p,
        ) =>
          p.y,
      ),
    ).toEqual(
      [
        100,
        100,
        150,
      ],
    );
    expect(
      points[1]!
        .x <
        points[2]!
          .x,
    ).toBe(
      true,
    );
    expect(
      points[1]!
        .x >
        points[0]!
          .x,
    ).toBe(
      true,
    );
    expect(
      points[2]!
        .x,
    ).toBe(
      daysAgo(
        2,
      ),
    );
  });

  it('steps down for a lower-is-better game', () => {
    expect(
      stepSeries(
        [
          row(
            9000,
            null,
            9,
          ),
          row(
            8000,
            9000,
            4,
          ),
        ],
      ).map(
        (
          p,
        ) =>
          p.y,
      ),
    ).toEqual(
      [
        9000,
        9000,
        8000,
      ],
    );
  });
});

describe('changeOf and formatting', () => {
  it('has no change for a first score and a signed one otherwise', () => {
    expect(
      changeOf(
        {
          score: 100,
          previous:
            null,
        },
      ),
    ).toBeNull();
    expect(
      changeOf(
        {
          score: 150,
          previous: 100,
        },
      ),
    ).toBe(
      50,
    );
    expect(
      changeOf(
        {
          score: 7000,
          previous: 9000,
        },
      ),
    ).toBe(
      -2000,
    );
  });

  it('signs a higher-is-better change with plus', () => {
    expect(
      formatChange(
        1240,
        false,
        'en',
      ),
    ).toBe(
      '+1,240',
    );
    expect(
      formatChange(
        -30,
        false,
        'en',
      ),
    ).toMatch(
      /^[-−]30$/,
    );
  });

  it('shows a lower-is-better change in seconds with a reduction as a minus', () => {
    expect(
      formatChange(
        -3200,
        true,
        'en',
      ),
    ).toMatch(
      /^[-−]3\.2\s?s$/,
    );
  });

  it('shows a time-based score as a duration and others grouped', () => {
    expect(
      formatBest(
        187_000,
        true,
        'en',
      ),
    ).toBe(
      '3m 7s',
    );
    expect(
      formatBest(
        1_234_567,
        false,
        'en',
      ),
    ).toBe(
      '1,234,567',
    );
  });
});
