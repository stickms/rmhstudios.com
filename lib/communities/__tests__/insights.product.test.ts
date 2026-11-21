/** Community insights, pure parts: the member line, the previous-range comparison, the week axis and the hour grid. */
import {
  describe,
  expect,
  it,
} from 'vitest';
import {
  compare,
  dayKeys,
  gridMax,
  hourGrid,
  rangeBounds,
  reconstructMemberLine,
  sumDays,
  utcDay,
  weekKeys,
  weekStart,
} from '@/lib/communities/insights';

const map =
  (
    o: Record<
      string,
      number
    >,
  ) =>
    new Map(
      Object.entries(
        o,
      ),
    );

describe('days and ranges', () => {
  it('lists the UTC days ending today, oldest first', () => {
    const days =
      dayKeys(
        Date.parse(
          '2026-03-02T23:59:00Z',
        ),
        4,
      );
    expect(
      days,
    ).toEqual(
      [
        '2026-02-27',
        '2026-02-28',
        '2026-03-01',
        '2026-03-02',
      ],
    );
    expect(
      utcDay(
        Date.parse(
          '2026-03-02T23:59:00Z',
        ),
      ),
    ).toBe(
      '2026-03-02',
    );
  });

  it('bounds the range and the previous range of equal length on UTC midnights', () => {
    const b =
      rangeBounds(
        Date.parse(
          '2026-03-02T15:00:00Z',
        ),
        28,
      );
    expect(
      b.end.toISOString(),
    ).toBe(
      '2026-03-03T00:00:00.000Z',
    );
    expect(
      b.start.toISOString(),
    ).toBe(
      '2026-02-03T00:00:00.000Z',
    );
    expect(
      b.prevStart.toISOString(),
    ).toBe(
      '2026-01-06T00:00:00.000Z',
    );
    expect(
      dayKeys(
        b.end.getTime() -
          1,
        28,
      )[0],
    ).toBe(
      '2026-02-03',
    );
  });
});

describe('reconstructMemberLine', () => {
  const days =
    [
      '2026-03-01',
      '2026-03-02',
      '2026-03-03',
      '2026-03-04',
    ];

  it('is today’s total on the last day, then undoes later joins and leaves', () => {
    const line =
      reconstructMemberLine(
        {
          days,
          total: 20,
          joins:
            map(
              {
                '2026-03-02': 3,
                '2026-03-04': 1,
              },
            ),
          losses:
            map(
              {
                '2026-03-03': 2,
              },
            ),
        },
      );
    expect(
      line,
    ).toEqual(
      [
        {
          day: '2026-03-01',
          total:
            20 -
            1 +
            2 -
            3,
        },
        {
          day: '2026-03-02',
          total:
            20 -
            1 +
            2,
        },
        {
          day: '2026-03-03',
          total:
            20 -
            1,
        },
        {
          day: '2026-03-04',
          total: 20,
        },
      ],
    );
  });

  it('is flat when nothing changed', () => {
    const line =
      reconstructMemberLine(
        {
          days,
          total: 7,
          joins:
            map(
              {},
            ),
          losses:
            map(
              {},
            ),
        },
      );
    expect(
      line.map(
        (
          p,
        ) =>
          p.total,
      ),
    ).toEqual(
      [
        7,
        7,
        7,
        7,
      ],
    );
  });

  it('can be reconstructed from joins alone before losses are recorded', () => {
    const line =
      reconstructMemberLine(
        {
          days,
          total: 10,
          joins:
            map(
              {
                '2026-03-02': 2,
                '2026-03-03': 1,
              },
            ),
          losses:
            map(
              {},
            ),
        },
      );
    expect(
      line.map(
        (
          p,
        ) =>
          p.total,
      ),
    ).toEqual(
      [
        7,
        9,
        10,
        10,
      ],
    );
  });

  it('keeps one point per day and none for an empty range', () => {
    expect(
      reconstructMemberLine(
        {
          days: [],
          total: 5,
          joins:
            map(
              {},
            ),
          losses:
            map(
              {},
            ),
        },
      ),
    ).toEqual(
      [],
    );
  });
});

describe('compare', () => {
  it('gives the change and the fraction against the previous range', () => {
    expect(
      compare(
        15,
        10,
      ),
    ).toEqual(
      {
        value: 15,
        previous: 10,
        change: 5,
        fraction: 0.5,
      },
    );
    expect(
      compare(
        5,
        10,
      ),
    ).toEqual(
      {
        value: 5,
        previous: 10,
        change:
          -5,
        fraction:
          -0.5,
      },
    );
  });

  it('has no fraction when there was nothing before', () => {
    expect(
      compare(
        4,
        0,
      ),
    ).toEqual(
      {
        value: 4,
        previous: 0,
        change: 4,
        fraction:
          null,
      },
    );
    expect(
      compare(
        0,
        0,
      )
        .change,
    ).toBe(
      0,
    );
  });

  it('adds up the days of one range and of the one before it separately', () => {
    const counts =
      map(
        {
          '2026-03-01': 2,
          '2026-03-02': 3,
          '2026-03-03': 4,
          '2026-03-04': 5,
        },
      );
    expect(
      sumDays(
        counts,
        [
          '2026-03-03',
          '2026-03-04',
        ],
      ),
    ).toBe(
      9,
    );
    expect(
      sumDays(
        counts,
        [
          '2026-03-01',
          '2026-03-02',
        ],
      ),
    ).toBe(
      5,
    );
    expect(
      sumDays(
        counts,
        [
          '2026-04-01',
        ],
      ),
    ).toBe(
      0,
    );
  });
});

describe('weeks', () => {
  it('starts weeks on Monday', () => {
    expect(
      weekStart(
        '2026-03-02',
      ),
    ).toBe(
      '2026-03-02',
    ); // a Monday
    expect(
      weekStart(
        '2026-03-08',
      ),
    ).toBe(
      '2026-03-02',
    ); // the Sunday after
    expect(
      weekStart(
        '2026-03-09',
      ),
    ).toBe(
      '2026-03-09',
    );
  });

  it('lists every week the range touches', () => {
    expect(
      weekKeys(
        '2026-03-04',
        '2026-03-17',
      ),
    ).toEqual(
      [
        '2026-03-02',
        '2026-03-09',
        '2026-03-16',
      ],
    );
    expect(
      weekKeys(
        '2026-03-02',
        '2026-03-02',
      ),
    ).toEqual(
      [
        '2026-03-02',
      ],
    );
  });
});

describe('hourGrid', () => {
  it('places a count by weekday and hour in the zone', () => {
    // Monday 2026-03-02 14:00 UTC is Monday 14:00 in London (winter), Monday 09:00 in New York, Tuesday 00:00 in Sydney.
    const bins =
      [
        {
          at: '2026-03-02T14:00:00Z',
          n: 3,
        },
      ];
    expect(
      hourGrid(
        bins,
        'UTC',
      )[1]![14],
    ).toBe(
      3,
    );
    expect(
      hourGrid(
        bins,
        'America/New_York',
      )[1]![9],
    ).toBe(
      3,
    );
    expect(
      hourGrid(
        bins,
        'Australia/Sydney',
      )[2]![1],
    ).toBe(
      3,
    );
  });

  it('adds the counts of bins in the same hour', () => {
    const bins =
      [
        {
          at: '2026-03-02T14:00:00Z',
          n: 1,
        },
        {
          at: '2026-03-02T14:15:00Z',
          n: 2,
        },
        {
          at: '2026-03-09T14:45:00Z',
          n: 4,
        },
      ];
    expect(
      hourGrid(
        bins,
        'UTC',
      )[1]![14],
    ).toBe(
      7,
    );
  });

  it('follows daylight saving: the same UTC hour lands an hour apart across the change', () => {
    // New York moved to summer time on 2026-03-08 at 07:00 UTC.
    const before =
      hourGrid(
        [
          {
            at: '2026-03-07T14:00:00Z',
            n: 1,
          },
        ],
        'America/New_York',
      ); // Saturday 09:00 EST
    const after =
      hourGrid(
        [
          {
            at: '2026-03-09T14:00:00Z',
            n: 1,
          },
        ],
        'America/New_York',
      ); // Monday 10:00 EDT
    expect(
      before[6]![9],
    ).toBe(
      1,
    );
    expect(
      after[1]![10],
    ).toBe(
      1,
    );
  });

  it('keeps every count across the autumn change, when one local hour happens twice', () => {
    // New York left summer time on 2026-11-01 at 06:00 UTC: 05:30 UTC and 06:30 UTC are both 01:30 local.
    const grid =
      hourGrid(
        [
          {
            at: '2026-11-01T05:30:00Z',
            n: 2,
          },
          {
            at: '2026-11-01T06:30:00Z',
            n: 3,
          },
        ],
        'America/New_York',
      );
    expect(
      grid[0]![1],
    ).toBe(
      5,
    );
    expect(
      grid
        .flat()
        .reduce(
          (
            a,
            b,
          ) =>
            a +
            b,
          0,
        ),
    ).toBe(
      5,
    );
  });

  it('places half-hour zones by the hour they fall in', () => {
    const grid =
      hourGrid(
        [
          {
            at: '2026-03-02T08:15:00Z',
            n: 1,
          },
          {
            at: '2026-03-02T08:30:00Z',
            n: 1,
          },
        ],
        'Asia/Kolkata',
      );
    // 08:15 UTC is 13:45 and 08:30 UTC is 14:00 in India.
    expect(
      grid[1]![13],
    ).toBe(
      1,
    );
    expect(
      grid[1]![14],
    ).toBe(
      1,
    );
  });

  it('ignores a bin it cannot read and is 7 by 24', () => {
    const grid =
      hourGrid(
        [
          {
            at: 'nonsense',
            n: 9,
          },
        ],
        'UTC',
      );
    expect(
      grid,
    ).toHaveLength(
      7,
    );
    expect(
      grid.every(
        (
          row,
        ) =>
          row.length ===
          24,
      ),
    ).toBe(
      true,
    );
    expect(
      gridMax(
        grid,
      ),
    ).toBe(
      0,
    );
  });

  it('finds the busiest cell for shading', () => {
    const grid =
      hourGrid(
        [
          {
            at: '2026-03-02T14:00:00Z',
            n: 6,
          },
          {
            at: '2026-03-03T01:00:00Z',
            n: 2,
          },
        ],
        'UTC',
      );
    expect(
      gridMax(
        grid,
      ),
    ).toBe(
      6,
    );
  });
});
