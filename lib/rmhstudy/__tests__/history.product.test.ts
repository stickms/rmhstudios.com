import {
  describe,
  expect,
  it,
} from 'vitest';
import {
  fillMinutes,
  formatMinutes,
  goalProgress,
  records,
  weekBounds,
  weekFrom,
  weekTotal,
} from '@/lib/rmhstudy/history';
import { dayKeyInZone } from '@/lib/study/stats';

const MON = 1;
const SUN = 0;

describe('weekBounds', () => {
  it('starts on the given first day', () => {
    // Wednesday 2026-11-18.
    const wed =
      new Date(
        '2026-11-18T12:00:00Z',
      );
    expect(
      weekBounds(
        wed,
        'UTC',
        MON,
      ),
    ).toMatchObject(
      {
        start:
          '2026-11-16',
        end: '2026-11-22',
      },
    );
    expect(
      weekBounds(
        wed,
        'UTC',
        SUN,
      ),
    ).toMatchObject(
      {
        start:
          '2026-11-15',
        end: '2026-11-21',
      },
    );
  });

  it('keeps a first-day date at the start of its own week', () => {
    expect(
      weekBounds(
        new Date(
          '2026-11-16T00:30:00Z',
        ),
        'UTC',
        MON,
      )
        .start,
    ).toBe(
      '2026-11-16',
    );
    expect(
      weekBounds(
        new Date(
          '2026-11-22T23:30:00Z',
        ),
        'UTC',
        MON,
      )
        .start,
    ).toBe(
      '2026-11-16',
    );
  });

  it('uses the viewer time zone for the day', () => {
    // 02:00 UTC Monday is still Sunday evening in New York.
    const instant =
      new Date(
        '2026-11-16T02:00:00Z',
      );
    expect(
      weekBounds(
        instant,
        'America/New_York',
        MON,
      )
        .start,
    ).toBe(
      '2026-11-09',
    );
    expect(
      weekBounds(
        instant,
        'UTC',
        MON,
      )
        .start,
    ).toBe(
      '2026-11-16',
    );
  });

  it('is always seven calendar days across a DST change', () => {
    // US clocks went back on 2026-11-01 and forward on 2026-03-08.
    for (const iso of [
      '2026-11-01T12:00:00Z',
      '2026-03-08T12:00:00Z',
      '2026-03-29T12:00:00Z',
    ]) {
      for (const tz of [
        'America/New_York',
        'Europe/London',
        'Australia/Sydney',
      ]) {
        const week =
          weekBounds(
            new Date(
              iso,
            ),
            tz,
            MON,
          );
        expect(
          week.days,
        ).toHaveLength(
          7,
        );
        expect(
          week
            .days[0],
        ).toBe(
          week.start,
        );
        expect(
          week
            .days[6],
        ).toBe(
          week.end,
        );
        const span =
          Date.parse(
            `${week.end}T00:00:00Z`,
          ) -
          Date.parse(
            `${week.start}T00:00:00Z`,
          );
        expect(
          span,
        ).toBe(
          6 *
            86_400_000,
        );
      }
    }
    expect(
      weekBounds(
        new Date(
          '2026-11-01T12:00:00Z',
        ),
        'America/New_York',
        SUN,
      )
        .start,
    ).toBe(
      '2026-11-01',
    );
  });

  it('weekFrom builds the following days from a start key', () => {
    expect(
      weekFrom(
        '2026-11-02',
      )
        .days,
    ).toEqual(
      [
        '2026-11-02',
        '2026-11-03',
        '2026-11-04',
        '2026-11-05',
        '2026-11-06',
        '2026-11-07',
        '2026-11-08',
      ],
    );
  });
});

describe('a run crossing midnight', () => {
  it('counts on the day it started', () => {
    // Recorded 23:50 local on Sunday; it ends after midnight, but the row is keyed on startedAt.
    const startedAt =
      new Date(
        '2026-11-15T23:50:00-05:00',
      );
    expect(
      dayKeyInZone(
        startedAt,
        'America/New_York',
      ),
    ).toBe(
      '2026-11-15',
    );
    const week =
      weekBounds(
        startedAt,
        'America/New_York',
        MON,
      );
    expect(
      week.start,
    ).toBe(
      '2026-11-09',
    );
    const days =
      [
        {
          date: dayKeyInZone(
            startedAt,
            'America/New_York',
          ),
          minutes: 50,
        },
      ];
    expect(
      weekTotal(
        days,
        week,
      ),
    ).toBe(
      50,
    );
    expect(
      weekTotal(
        days,
        weekFrom(
          '2026-11-16',
        ),
      ),
    ).toBe(
      0,
    );
  });
});

describe('goalProgress', () => {
  it('is null without a goal', () => {
    expect(
      goalProgress(
        100,
        null,
      ),
    ).toBeNull();
  });

  it('reports progress and the minutes left', () => {
    expect(
      goalProgress(
        250,
        360,
      ),
    ).toEqual(
      {
        percent: 69,
        barPercent: 69,
        remaining: 110,
        reached: false,
      },
    );
  });

  it('caps the bar at 100 but reports the true percentage', () => {
    expect(
      goalProgress(
        540,
        360,
      ),
    ).toEqual(
      {
        percent: 150,
        barPercent: 100,
        remaining: 0,
        reached: true,
      },
    );
    expect(
      goalProgress(
        360,
        360,
      ),
    ).toMatchObject(
      {
        percent: 100,
        barPercent: 100,
        reached: true,
      },
    );
  });
});

describe('records', () => {
  const days =
    [
      {
        date: '2026-11-02',
        minutes: 30,
      },
      {
        date: '2026-11-03',
        minutes: 90,
      },
      {
        date: '2026-11-10',
        minutes: 70,
      },
      {
        date: '2026-11-11',
        minutes: 60,
      },
      {
        date: '2026-11-12',
        minutes: 0,
      },
    ];

  it('finds the best day and the best week', () => {
    expect(
      records(
        days,
        MON,
      ),
    ).toEqual(
      {
        bestDay:
          {
            date: '2026-11-03',
            minutes: 90,
          },
        bestWeek:
          {
            start:
              '2026-11-09',
            minutes: 130,
          },
      },
    );
  });

  it('has no records without focus time', () => {
    expect(
      records(
        [],
        MON,
      ),
    ).toEqual(
      {
        bestDay:
          null,
        bestWeek:
          null,
      },
    );
    expect(
      records(
        [
          {
            date: '2026-11-02',
            minutes: 0,
          },
        ],
        MON,
      ),
    ).toEqual(
      {
        bestDay:
          null,
        bestWeek:
          null,
      },
    );
  });

  it('splits weeks by the first day', () => {
    // Sunday 2026-11-08 belongs to the Monday week of 11-02 but starts a Sunday week.
    const d =
      [
        {
          date: '2026-11-07',
          minutes: 10,
        },
        {
          date: '2026-11-08',
          minutes: 20,
        },
      ];
    expect(
      records(
        d,
        MON,
      )
        .bestWeek,
    ).toEqual(
      {
        start:
          '2026-11-02',
        minutes: 30,
      },
    );
    expect(
      records(
        d,
        SUN,
      )
        .bestWeek,
    ).toEqual(
      {
        start:
          '2026-11-08',
        minutes: 20,
      },
    );
  });
});

describe('fillMinutes', () => {
  it('returns one entry per day ending today', () => {
    const filled =
      fillMinutes(
        [
          {
            date: '2026-11-20',
            minutes: 25,
          },
        ],
        '2026-11-21',
        3,
      );
    expect(
      filled,
    ).toEqual(
      [
        {
          date: '2026-11-19',
          minutes: 0,
        },
        {
          date: '2026-11-20',
          minutes: 25,
        },
        {
          date: '2026-11-21',
          minutes: 0,
        },
      ],
    );
  });
});

describe('formatMinutes', () => {
  it('spells out hours and minutes', () => {
    expect(
      formatMinutes(
        250,
        'en',
      ),
    ).toBe(
      '4 hr 10 min',
    );
    expect(
      formatMinutes(
        360,
        'en',
      ),
    ).toBe(
      '6 hr',
    );
    expect(
      formatMinutes(
        0,
        'en',
      ),
    ).toBe(
      '0 min',
    );
    expect(
      formatMinutes(
        25,
        'en',
      ),
    ).toBe(
      '25 min',
    );
  });
});
