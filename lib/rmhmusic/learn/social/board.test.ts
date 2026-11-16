import {
  describe,
  expect,
  it,
} from 'vitest';
import {
  BOARD_TOP,
  boardDateOk,
  boardMe,
  type ViewerRow,
  compareEntries,
  isFinal,
  rankEntries,
  sliceBoard,
  wouldPlace,
  type BoardEntry,
} from './board';

const T0 =
  Date.UTC(
    2026,
    10,
    16,
    8,
  );
const e =
  (
    userId: string,
    score: number,
    avgMs:
      | number
      | null = 900,
    scoredAt = T0,
    skipped = 0,
  ): BoardEntry => ({
    rowId: `row-${userId}`,
    userId,
    score,
    avgMs,
    scoredAt,
    skipped,
  });
/** `n` learners, u1 best .. un worst. */
const many =
  (
    n: number,
  ) =>
    Array.from(
      {
        length:
          n,
      },
      (
        _,
        i,
      ) =>
        e(
          `u${i + 1}`,
          100 -
            Math.floor(
              i /
                2,
            ),
          500 +
            i,
        ),
    );

describe('the board order (plan 1.2)', () => {
  it('score desc, then the faster mean, nulls last, then the earlier save, then the id', () => {
    const rows =
      [
        e(
          'd',
          90,
          800,
          T0 +
            5,
        ),
        e(
          'a',
          92,
          900,
        ),
        e(
          'c',
          90,
          null,
        ),
        e(
          'b',
          90,
          800,
          T0,
        ),
        e(
          'e',
          90,
          800,
          T0 +
            5,
        ),
      ];
    expect(
      rows
        .sort(
          compareEntries,
        )
        .map(
          (
            r,
          ) =>
            r.userId,
        ),
    ).toEqual(
      [
        'a',
        'b',
        'd',
        'e',
        'c',
      ],
    );
  });

  it('ranks are 1..N over the full board and the same for every viewer', () => {
    const ranked =
      rankEntries(
        many(
          10,
        ),
      );
    expect(
      ranked.map(
        (
          r,
        ) =>
          r.rank,
      ),
    ).toEqual(
      [
        1,
        2,
        3,
        4,
        5,
        6,
        7,
        8,
        9,
        10,
      ],
    );
    const a =
      sliceBoard(
        ranked,
        'u3',
        new Set(),
      );
    const b =
      sliceBoard(
        ranked,
        'u7',
        new Set(),
      );
    expect(
      a.rows.find(
        (
          r,
        ) =>
          r.userId ===
          'u5',
      )
        ?.rank,
    ).toBe(
      5,
    );
    expect(
      b.rows.find(
        (
          r,
        ) =>
          r.userId ===
          'u5',
      )
        ?.rank,
    ).toBe(
      5,
    );
  });

  it('a row hidden from one viewer by a block leaves a gap rather than renumbering', () => {
    const ranked =
      rankEntries(
        many(
          6,
        ),
      );
    const seen =
      sliceBoard(
        ranked,
        'u5',
        new Set(
          [
            'u2',
          ],
        ),
      );
    expect(
      seen.rows.map(
        (
          r,
        ) =>
          r.rank,
      ),
    ).toEqual(
      [
        1,
        3,
        4,
        5,
        6,
      ],
    );
    expect(
      seen.rows.some(
        (
          r,
        ) =>
          r.userId ===
          'u2',
      ),
    ).toBe(
      false,
    );
    expect(
      seen
        .me
        ?.rank,
    ).toBe(
      5,
    );
  });
});

describe('top 50 and "around you"', () => {
  const ranked =
    rankEntries(
      many(
        120,
      ),
    );

  it('shows the top 50; a viewer inside it gets no "around you"', () => {
    const s =
      sliceBoard(
        ranked,
        'u10',
        new Set(),
      );
    expect(
      s.rows,
    ).toHaveLength(
      BOARD_TOP,
    );
    expect(
      s.around,
    ).toBeNull();
    expect(
      s
        .me
        ?.rank,
    ).toBe(
      10,
    );
  });

  it('a viewer outside the top 50 sees two above and two below', () => {
    const s =
      sliceBoard(
        ranked,
        'u80',
        new Set(),
      );
    expect(
      s.around?.map(
        (
          r,
        ) =>
          r.rank,
      ),
    ).toEqual(
      [
        78,
        79,
        80,
        81,
        82,
      ],
    );
  });

  it('at the very end there is nothing below', () => {
    const s =
      sliceBoard(
        ranked,
        'u120',
        new Set(),
      );
    expect(
      s.around?.map(
        (
          r,
        ) =>
          r.rank,
      ),
    ).toEqual(
      [
        118,
        119,
        120,
      ],
    );
  });

  it('just outside the top 50 the rows above may be in it already', () => {
    const s =
      sliceBoard(
        ranked,
        'u51',
        new Set(),
      );
    expect(
      s.around?.map(
        (
          r,
        ) =>
          r.rank,
      ),
    ).toEqual(
      [
        49,
        50,
        51,
        52,
        53,
      ],
    );
  });

  it('a viewer not on the board gets no "around you" and no row', () => {
    const s =
      sliceBoard(
        ranked,
        'stranger',
        new Set(),
      );
    expect(
      s.me,
    ).toBeNull();
    expect(
      s.around,
    ).toBeNull();
  });

  it('blocked rows are dropped from "around you" too, ranks kept', () => {
    const s =
      sliceBoard(
        ranked,
        'u80',
        new Set(
          [
            'u79',
          ],
        ),
      );
    expect(
      s.around?.map(
        (
          r,
        ) =>
          r.rank,
      ),
    ).toEqual(
      [
        77,
        78,
        80,
        81,
        82,
      ],
    );
  });
});

describe('would place', () => {
  it('is where a private or unranked score would fall among the board', () => {
    const ranked =
      rankEntries(
        [
          e(
            'a',
            95,
          ),
          e(
            'b',
            92,
          ),
          e(
            'c',
            80,
          ),
        ],
      );
    expect(
      wouldPlace(
        ranked,
        e(
          'me',
          92,
          800,
        ),
      ),
    ).toBe(
      2,
    );
    expect(
      wouldPlace(
        ranked,
        e(
          'me',
          92,
          1000,
        ),
      ),
    ).toBe(
      3,
    );
    expect(
      wouldPlace(
        ranked,
        e(
          'me',
          100,
        ),
      ),
    ).toBe(
      1,
    );
    expect(
      wouldPlace(
        ranked,
        e(
          'me',
          10,
        ),
      ),
    ).toBe(
      4,
    );
    expect(
      wouldPlace(
        [],
        e(
          'me',
          10,
        ),
      ),
    ).toBe(
      1,
    );
  });
});

describe("the viewer's own line (never cached)", () => {
  const ranked =
    rankEntries(
      [
        e(
          'a',
          95,
        ),
        e(
          'b',
          92,
        ),
        e(
          'me',
          90,
        ),
        e(
          'c',
          80,
        ),
      ],
    );
  const row =
    (
      over: Partial<ViewerRow> = {},
    ): ViewerRow => ({
      score: 90,
      avgMs: 900,
      scoredAt:
        T0,
      ranked: true,
      unrankedReason:
        null,
      hidden: false,
      ...over,
    });

  it('not played, started but not finished', () => {
    expect(
      boardMe(
        'me',
        null,
        true,
        ranked,
      ),
    ).toEqual(
      {
        state:
          'not-played',
      },
    );
    expect(
      boardMe(
        'me',
        row(
          {
            score:
              null,
          },
        ),
        true,
        ranked,
      ),
    ).toEqual(
      {
        state:
          'started',
      },
    );
  });

  it('on the board: the place among everyone', () => {
    expect(
      boardMe(
        'me',
        row(),
        true,
        ranked,
      ),
    ).toEqual(
      {
        state:
          'ranked',
        rank: 3,
        total: 4,
        score: 90,
      },
    );
  });

  it('scored but private: where it would place, counting the learner', () => {
    const others =
      ranked.filter(
        (
          r,
        ) =>
          r.userId !==
          'me',
      );
    expect(
      boardMe(
        'me',
        row(),
        false,
        rankEntries(
          others,
        ),
      ),
    ).toEqual(
      {
        state:
          'private',
        rank: 3,
        total: 4,
        score: 90,
      },
    );
  });

  it('not ranked says why; hidden by a moderator says so', () => {
    expect(
      boardMe(
        'me',
        row(
          {
            ranked: false,
            unrankedReason:
              'too-fast',
          },
        ),
        true,
        ranked,
      ),
    ).toEqual(
      {
        state:
          'unranked',
        reason:
          'too-fast',
        score: 90,
      },
    );
    expect(
      boardMe(
        'me',
        row(
          {
            ranked: false,
            unrankedReason:
              null,
          },
        ),
        true,
        ranked,
      ),
    ).toMatchObject(
      {
        reason:
          'no-start',
      },
    );
    expect(
      boardMe(
        'me',
        row(
          {
            hidden: true,
          },
        ),
        true,
        ranked,
      ),
    ).toEqual(
      {
        state:
          'hidden',
        score: 90,
      },
    );
  });
});

describe('dates', () => {
  const now =
    Date.UTC(
      2026,
      10,
      16,
      0,
      5,
    );
  it('only today and yesterday have a board', () => {
    expect(
      boardDateOk(
        '2026-11-16',
        now,
      ),
    ).toBe(
      true,
    );
    expect(
      boardDateOk(
        '2026-11-15',
        now,
      ),
    ).toBe(
      true,
    );
    expect(
      boardDateOk(
        '2026-11-14',
        now,
      ),
    ).toBe(
      false,
    );
    expect(
      boardDateOk(
        '2026-11-17',
        now,
      ),
    ).toBe(
      false,
    );
    expect(
      boardDateOk(
        'nope',
        now,
      ),
    ).toBe(
      false,
    );
  });

  it("yesterday's board is final only after the grace window; today's never is", () => {
    expect(
      isFinal(
        '2026-11-15',
        now,
      ),
    ).toBe(
      false,
    );
    expect(
      isFinal(
        '2026-11-15',
        Date.UTC(
          2026,
          10,
          16,
          0,
          10,
        ),
      ),
    ).toBe(
      true,
    );
    expect(
      isFinal(
        '2026-11-16',
        Date.UTC(
          2026,
          10,
          16,
          23,
        ),
      ),
    ).toBe(
      false,
    );
  });
});
