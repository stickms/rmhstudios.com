import {
  describe,
  expect,
  it,
} from 'vitest';
import {
  bucketsFor,
  computeDailyStats,
  streaks,
  type DailyStatRow,
} from '@/lib/daily-puzzles/stats';
import { buildLocalRows } from '@/lib/daily-puzzles/local-rows';
import type { PuzzleResult } from '@/lib/daily-puzzles/persistence';
import type { PuzzleHistoryEntry } from '@/lib/lights-out/persistence';

const row =
  (
    gameMode: string,
    dateKey: string,
    extra: Partial<DailyStatRow> = {},
  ): DailyStatRow => ({
    gameMode,
    dateKey,
    score: 0,
    moves:
      null,
    dnf: null,
    timeSeconds:
      null,
    ...extra,
  });

describe('streaks', () => {
  it('breaks at a missed day and keeps the longest run', () => {
    const days =
      [
        '2026-03-01',
        '2026-03-02',
        '2026-03-03',
        '2026-03-05',
        '2026-03-06',
      ];
    expect(
      streaks(
        days,
        '2026-03-06',
      ),
    ).toEqual(
      {
        current: 2,
        longest: 3,
      },
    );
  });

  it('still counts yesterday when today is not played yet', () => {
    expect(
      streaks(
        [
          '2026-03-04',
          '2026-03-05',
        ],
        '2026-03-06',
      )
        .current,
    ).toBe(
      2,
    );
  });

  it('is zero once a whole day has been missed', () => {
    expect(
      streaks(
        [
          '2026-03-03',
          '2026-03-04',
        ],
        '2026-03-06',
      )
        .current,
    ).toBe(
      0,
    );
  });

  it('crosses month and year ends', () => {
    expect(
      streaks(
        [
          '2025-12-31',
          '2026-01-01',
          '2026-01-02',
        ],
        '2026-01-02',
      )
        .current,
    ).toBe(
      3,
    );
  });
});

describe('computeDailyStats counting rules', () => {
  it('does not count a dnf lights-out run toward streaks or solves', () => {
    const s =
      computeDailyStats(
        [
          row(
            'lights-out',
            '2026-03-05',
            {
              moves: 9,
            },
          ),
          row(
            'lights-out',
            '2026-03-06',
            {
              moves: 0,
              dnf: true,
            },
          ),
        ],
        '2026-03-06',
      );
    expect(
      s.currentStreak,
    ).toBe(
      1,
    );
    expect(
      s.totalSolves,
    ).toBe(
      1,
    );
    const lo =
      s.modes.find(
        (
          m,
        ) =>
          m.mode ===
          'lights-out',
      )!;
    expect(
      lo.played,
    ).toBe(
      2,
    );
    expect(
      lo.solved,
    ).toBe(
      1,
    );
    expect(
      lo.solveRate,
    ).toBe(
      0.5,
    );
    expect(
      lo.best,
    ).toBe(
      9,
    );
    expect(
      s
        .days[
        '2026-03-06'
      ],
    ).toBeUndefined();
  });

  it('does not count a globeset run that used the auto-solver', () => {
    const s =
      computeDailyStats(
        [
          row(
            'globeset',
            '2026-03-06',
            {
              timeSeconds: 30,
              dnf: true,
            },
          ),
        ],
        '2026-03-06',
      );
    expect(
      s.currentStreak,
    ).toBe(
      0,
    );
    expect(
      s.totalSolves,
    ).toBe(
      0,
    );
    expect(
      s.firstDay,
    ).toBeNull();
  });

  it('counts a day once when several modes were solved, and lists them', () => {
    const s =
      computeDailyStats(
        [
          row(
            'alibi',
            '2026-03-06',
            {
              score: 300,
            },
          ),
          row(
            'spectrum',
            '2026-03-06',
            {
              score: 500,
            },
          ),
        ],
        '2026-03-06',
      );
    expect(
      s.daysPlayed,
    ).toBe(
      1,
    );
    expect(
      s.totalSolves,
    ).toBe(
      2,
    );
    expect(
      s
        .days[
        '2026-03-06'
      ],
    ).toEqual(
      [
        'alibi',
        'spectrum',
      ],
    );
  });

  it('keeps a per-mode streak apart from the overall one', () => {
    const s =
      computeDailyStats(
        [
          row(
            'alibi',
            '2026-03-05',
            {
              score: 100,
            },
          ),
          row(
            'spectrum',
            '2026-03-06',
            {
              score: 100,
            },
          ),
        ],
        '2026-03-06',
      );
    expect(
      s.currentStreak,
    ).toBe(
      2,
    );
    expect(
      s.modes.find(
        (
          m,
        ) =>
          m.mode ===
          'alibi',
      )!
        .currentStreak,
    ).toBe(
      1,
    );
    expect(
      s.modes.find(
        (
          m,
        ) =>
          m.mode ===
          'spectrum',
      )!
        .currentStreak,
    ).toBe(
      1,
    );
  });

  it('is empty without rows', () => {
    const s =
      computeDailyStats(
        [],
        '2026-03-06',
      );
    expect(
      s,
    ).toMatchObject(
      {
        currentStreak: 0,
        longestStreak: 0,
        daysPlayed: 0,
        totalSolves: 0,
      },
    );
    expect(
      s.modes.every(
        (
          m,
        ) =>
          m.played ===
            0 &&
          m.best ===
            null &&
          m.average ===
            null,
      ),
    ).toBe(
      true,
    );
  });
});

describe('figures and buckets', () => {
  it('uses at most 8 buckets, open-ended at the top, for every mode', () => {
    for (const metric of [
      'score',
      'moves',
      'time',
    ] as const) {
      const b =
        bucketsFor(
          metric,
        );
      expect(
        b.length,
      ).toBeLessThanOrEqual(
        8,
      );
      expect(
        b[
          b.length -
            1
        ]
          .max,
      ).toBeNull();
      b.slice(
        1,
      ).forEach(
        (
          x,
          i,
        ) =>
          expect(
            x.min,
          ).toBe(
            (b[
              i
            ]
              .max as number) +
              1,
          ),
      );
    }
  });

  it('measures score modes by points (higher best), lights-out by moves and globeset by time (lower best)', () => {
    const s =
      computeDailyStats(
        [
          row(
            'alibi',
            '2026-03-05',
            {
              score: 200,
            },
          ),
          row(
            'alibi',
            '2026-03-06',
            {
              score: 900,
            },
          ),
          row(
            'lights-out',
            '2026-03-05',
            {
              moves: 12,
            },
          ),
          row(
            'lights-out',
            '2026-03-06',
            {
              moves: 7,
            },
          ),
          row(
            'globeset',
            '2026-03-05',
            {
              timeSeconds: 200,
            },
          ),
          row(
            'globeset',
            '2026-03-06',
            {
              timeSeconds: 95,
            },
          ),
        ],
        '2026-03-06',
      );
    const by =
      (
        m: string,
      ) =>
        s.modes.find(
          (
            x,
          ) =>
            x.mode ===
            m,
        )!;
    expect(
      by(
        'alibi',
      ),
    ).toMatchObject(
      {
        metric:
          'score',
        best: 900,
        average: 550,
      },
    );
    expect(
      by(
        'lights-out',
      ),
    ).toMatchObject(
      {
        metric:
          'moves',
        best: 7,
        average: 9.5,
      },
    );
    expect(
      by(
        'globeset',
      ),
    ).toMatchObject(
      {
        metric:
          'time',
        best: 95,
        average: 147.5,
      },
    );
  });

  it('puts each result in the bucket that holds it', () => {
    const s =
      computeDailyStats(
        [
          row(
            'lights-out',
            '2026-03-01',
            {
              moves: 5,
            },
          ),
          row(
            'lights-out',
            '2026-03-02',
            {
              moves: 6,
            },
          ),
          row(
            'lights-out',
            '2026-03-03',
            {
              moves: 999,
            },
          ),
        ],
        '2026-03-03',
      );
    const d =
      s.modes.find(
        (
          m,
        ) =>
          m.mode ===
          'lights-out',
      )!.distribution;
    expect(
      d[0]
        .count,
    ).toBe(
      1,
    ); // 1-5 (0-5)
    expect(
      d[1]
        .count,
    ).toBe(
      1,
    ); // 6-10
    expect(
      d[
        d.length -
          1
      ]
        .count,
    ).toBe(
      1,
    ); // 61+
    expect(
      d.reduce(
        (
          n,
          b,
        ) =>
          n +
          b.count,
        0,
      ),
    ).toBe(
      3,
    );
  });
});

describe('local store and server rows agree', () => {
  const pr =
    (
      score: number,
      extra: Partial<PuzzleResult> = {},
    ): PuzzleResult => ({
      puzzleDate:
        '',
      score,
      timeSeconds:
        null,
      resultJson:
        null,
      completedAt:
        '',
      ...extra,
    });
  const hist =
    (
      dateKey: string,
      moves: number,
      dnf = false,
    ): PuzzleHistoryEntry => ({
      dateKey,
      moves,
      solved:
        !dnf,
      dnf,
      hintUsed: false,
      shapeLabel:
        'square',
    });

  it('builds the same statistics from local data as from the server rows for the same runs', () => {
    const local =
      buildLocalRows(
        {
          alibi:
            {
              '2026-03-05':
                pr(
                  300,
                ),
              '2026-03-06':
                pr(
                  450,
                ),
            },
          globeset:
            {
              '2026-03-05':
                pr(
                  10,
                  {
                    timeSeconds: 120,
                    resultJson:
                      {
                        solverUsed: false,
                      },
                  },
                ),
              '2026-03-06':
                pr(
                  0,
                  {
                    timeSeconds: 20,
                    resultJson:
                      {
                        solverUsed: true,
                      },
                  },
                ),
            },
          'lights-out':
            {
              '2026-03-06':
                pr(
                  8,
                  {
                    resultJson:
                      {
                        moves: 8,
                      },
                  },
                ),
            },
        },
        [
          hist(
            '2026-03-05',
            11,
          ),
          hist(
            '2026-03-06',
            8,
          ),
        ],
      );
    const server: DailyStatRow[] =
      [
        row(
          'alibi',
          '2026-03-05',
          {
            score: 300,
          },
        ),
        row(
          'alibi',
          '2026-03-06',
          {
            score: 450,
          },
        ),
        row(
          'globeset',
          '2026-03-05',
          {
            score: 10,
            timeSeconds: 120,
            dnf: false,
          },
        ),
        row(
          'globeset',
          '2026-03-06',
          {
            score: 0,
            timeSeconds: 20,
            dnf: true,
          },
        ),
        row(
          'lights-out',
          '2026-03-05',
          {
            moves: 11,
            dnf: false,
          },
        ),
        row(
          'lights-out',
          '2026-03-06',
          {
            moves: 8,
            dnf: false,
          },
        ),
      ];
    expect(
      computeDailyStats(
        local,
        '2026-03-06',
      ),
    ).toEqual(
      computeDailyStats(
        server,
        '2026-03-06',
      ),
    );
  });

  it('merges a lights-out day held in both stores into its best run, never a dnf over a solve', () => {
    const rows =
      buildLocalRows(
        {
          'lights-out':
            {
              '2026-03-06':
                pr(
                  0,
                  {
                    resultJson:
                      {
                        moves: 0,
                        dnf: true,
                      },
                  },
                ),
            },
        },
        [
          hist(
            '2026-03-06',
            14,
          ),
        ],
      ).filter(
        (
          r,
        ) =>
          r.gameMode ===
          'lights-out',
      );
    expect(
      rows,
    ).toHaveLength(
      1,
    );
    expect(
      rows[0],
    ).toMatchObject(
      {
        dnf: false,
        moves: 14,
      },
    );
  });
});
