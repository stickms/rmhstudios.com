import {
  describe,
  expect,
  it,
} from 'vitest';
import {
  CENSUS_SCAN_MAX_BYTES,
  baselineOf,
  buildProducts,
  censusMonth,
  pickBaseline,
  planNewestRow,
  productQuiet,
  renderCensusMarkdown,
  summarizeCensus,
  tableQuiet,
  utcDayBefore,
  type Census,
  type CensusProduct,
  type CensusTable,
} from './census';

const NOW =
  '2026-11-12T10:00:00.000Z';
const daysAgo =
  (
    n: number,
  ): string =>
    new Date(
      Date.parse(
        NOW,
      ) -
        n *
          86_400_000,
    ).toISOString();

const table =
  (
    over: Partial<CensusTable> = {},
  ): CensusTable => ({
    table:
      'thing',
    liveRows: 10,
    inserts: 0,
    updates: 0,
    deletes: 0,
    indexScans: 0,
    bytes: 8192,
    lastAutoanalyze:
      null,
    lastAnalyze:
      null,
    newestRow:
      null,
    newestRowColumn:
      null,
    newestRowMethod:
      null,
    ...over,
  });

const frame =
  (
    statsReset:
      | string
      | null,
  ) => ({
    takenAt:
      NOW,
    statsReset,
    quietDays: 90,
  });

describe('censusMonth / utcDayBefore', () => {
  it('keys a snapshot by its UTC month, not the local one', () => {
    expect(
      censusMonth(
        new Date(
          '2026-11-12T10:00:00Z',
        ),
      ),
    ).toBe(
      '2026-11',
    );
    expect(
      censusMonth(
        new Date(
          '2026-01-01T00:00:00Z',
        ),
      ),
    ).toBe(
      '2026-01',
    );
    expect(
      censusMonth(
        new Date(
          '2026-12-31T23:59:59Z',
        ),
      ),
    ).toBe(
      '2026-12',
    );
  });

  it('steps back whole UTC days across a month boundary', () => {
    expect(
      utcDayBefore(
        new Date(
          '2026-11-12T10:00:00Z',
        ),
        29,
      ).toISOString(),
    ).toBe(
      '2026-10-14T00:00:00.000Z',
    );
  });
});

describe('planNewestRow', () => {
  const big =
    CENSUS_SCAN_MAX_BYTES +
    1;

  it('reads nothing from a table with no timestamp column', () => {
    expect(
      planNewestRow(
        [],
        0,
      ),
    ).toBeNull();
  });

  it('scans a small table for the preferred column', () => {
    expect(
      planNewestRow(
        [
          {
            column:
              'createdAt',
            indexed: false,
          },
          {
            column:
              'updatedAt',
            indexed: false,
          },
        ],
        CENSUS_SCAN_MAX_BYTES,
      ),
    ).toEqual(
      {
        column:
          'updatedAt',
        method:
          'scan',
      },
    );
  });

  it('never scans a large table: it takes an indexed column or nothing', () => {
    expect(
      planNewestRow(
        [
          {
            column:
              'updatedAt',
            indexed: false,
          },
        ],
        big,
      ),
    ).toBeNull();
    expect(
      planNewestRow(
        [
          {
            column:
              'updatedAt',
            indexed: false,
          },
          {
            column:
              'createdAt',
            indexed: true,
          },
        ],
        big,
      ),
    ).toEqual(
      {
        column:
          'createdAt',
        method:
          'index',
      },
    );
  });

  it('uses the index on a small table when the preferred column has one', () => {
    expect(
      planNewestRow(
        [
          {
            column:
              'createdAt',
            indexed: true,
          },
        ],
        0,
      ),
    ).toEqual(
      {
        column:
          'createdAt',
        method:
          'index',
      },
    );
  });
});

describe('tableQuiet', () => {
  it('is active on a newest row inside the window', () => {
    expect(
      tableQuiet(
        table(
          {
            newestRow:
              daysAgo(
                3,
              ),
          },
        ),
        frame(
          null,
        ),
      ),
    ).toEqual(
      {
        verdict:
          'active',
        basis:
          'newest-row',
      },
    );
  });

  it('is active on a recent autoanalyze even when the newest row is old', () => {
    expect(
      tableQuiet(
        table(
          {
            newestRow:
              daysAgo(
                200,
              ),
            lastAutoanalyze:
              daysAgo(
                10,
              ),
          },
        ),
        frame(
          null,
        ),
      ),
    ).toEqual(
      {
        verdict:
          'active',
        basis:
          'autoanalyze',
      },
    );
  });

  it('ignores a manual ANALYZE: it says nothing about writes', () => {
    expect(
      tableQuiet(
        table(
          {
            lastAnalyze:
              daysAgo(
                1,
              ),
          },
        ),
        frame(
          null,
        ),
      )
        .verdict,
    ).toBe(
      'unknown',
    );
  });

  it('is active when the counters began inside the window and show writes', () => {
    expect(
      tableQuiet(
        table(
          {
            updates: 4,
          },
        ),
        frame(
          daysAgo(
            20,
          ),
        ),
      ),
    ).toEqual(
      {
        verdict:
          'active',
        basis:
          'counters',
      },
    );
  });

  it('is quiet when counters older than the window show no write', () => {
    expect(
      tableQuiet(
        table(),
        frame(
          daysAgo(
            120,
          ),
        ),
      ),
    ).toEqual(
      {
        verdict:
          'quiet',
        basis:
          'counters',
      },
    );
  });

  it('does not call a table quiet on counters that are younger than the window', () => {
    expect(
      tableQuiet(
        table(),
        frame(
          daysAgo(
            20,
          ),
        ),
      ),
    ).toEqual(
      {
        verdict:
          'unknown',
        basis:
          null,
      },
    );
  });

  it('does not call a table quiet when old counters show writes of unknown date', () => {
    expect(
      tableQuiet(
        table(
          {
            inserts: 9,
          },
        ),
        frame(
          daysAgo(
            400,
          ),
        ),
      )
        .verdict,
    ).toBe(
      'unknown',
    );
  });

  it('falls back to an old newest row', () => {
    expect(
      tableQuiet(
        table(
          {
            inserts: 9,
            newestRow:
              daysAgo(
                300,
              ),
          },
        ),
        frame(
          null,
        ),
      ),
    ).toEqual(
      {
        verdict:
          'quiet',
        basis:
          'newest-row',
      },
    );
  });

  describe('against a stored snapshot', () => {
    const baseline =
      (
        writes: number,
        over: {
          takenAt?: string;
          statsReset?:
            | string
            | null;
        } = {},
      ) => ({
        takenAt:
          daysAgo(
            95,
          ),
        statsReset:
          null,
        writes:
          {
            thing:
              writes,
          },
        ...over,
      });

    it('is quiet when the write counter has not moved', () => {
      expect(
        tableQuiet(
          table(
            {
              inserts: 9,
            },
          ),
          frame(
            null,
          ),
          baseline(
            9,
          ),
        ),
      ).toEqual(
        {
          verdict:
            'quiet',
          basis:
            'snapshots',
        },
      );
    });

    it('is active when it moved, even with an old newest row (an update or a delete)', () => {
      expect(
        tableQuiet(
          table(
            {
              inserts: 9,
              deletes: 2,
              newestRow:
                daysAgo(
                  300,
                ),
            },
          ),
          frame(
            null,
          ),
          baseline(
            9,
          ),
        ),
      ).toEqual(
        {
          verdict:
            'active',
          basis:
            'snapshots',
        },
      );
    });

    it('ignores a snapshot younger than the window', () => {
      expect(
        tableQuiet(
          table(
            {
              inserts: 9,
            },
          ),
          frame(
            null,
          ),
          baseline(
            9,
            {
              takenAt:
                daysAgo(
                  30,
                ),
            },
          ),
        )
          .verdict,
      ).toBe(
        'unknown',
      );
    });

    it('ignores a snapshot from before a statistics reset', () => {
      expect(
        tableQuiet(
          table(
            {
              inserts: 9,
            },
          ),
          frame(
            daysAgo(
              200,
            ),
          ),
          baseline(
            9,
            {
              statsReset:
                daysAgo(
                  500,
                ),
            },
          ),
        )
          .verdict,
      ).toBe(
        'unknown',
      );
    });

    it('ignores counters that went backwards, and a table the snapshot never saw', () => {
      expect(
        tableQuiet(
          table(
            {
              inserts: 1,
            },
          ),
          frame(
            null,
          ),
          baseline(
            9,
          ),
        )
          .verdict,
      ).toBe(
        'unknown',
      );
      expect(
        tableQuiet(
          table(
            {
              table:
                'new_thing',
            },
          ),
          frame(
            null,
          ),
          baseline(
            0,
          ),
        )
          .verdict,
      ).toBe(
        'unknown',
      );
    });
  });
});

describe('pickBaseline', () => {
  const snaps =
    [
      daysAgo(
        10,
      ),
      daysAgo(
        40,
      ),
      daysAgo(
        95,
      ),
      daysAgo(
        130,
      ),
    ].map(
      (
        takenAt,
      ) => ({
        takenAt,
      }),
    );

  it('picks the newest snapshot that is at least the window old', () => {
    expect(
      pickBaseline(
        snaps,
        NOW,
        90,
      ),
    ).toEqual(
      {
        takenAt:
          daysAgo(
            95,
          ),
      },
    );
  });

  it('is null until one is old enough', () => {
    expect(
      pickBaseline(
        snaps.slice(
          0,
          2,
        ),
        NOW,
        90,
      ),
    ).toBeNull();
  });
});

describe('buildProducts', () => {
  const catalogue =
    [
      {
        id: 'a',
        title:
          'A',
        kind: 'game' as const,
        href: '/a',
        tracked: true,
      },
      {
        id: 'b',
        title:
          'B',
        kind: 'app' as const,
        href: '/b',
        tracked: true,
      },
      {
        id: 'c',
        title:
          'C',
        kind: 'app' as const,
        href: 'https://example.com',
        tracked: false,
      },
    ];
  const use =
    (
      id: string,
      actives: number,
    ) => ({
      id,
      actives,
      playtimeActives:
        actives,
      historyActives: 0,
      players:
        actives,
      lastActiveAt:
        daysAgo(
          1,
        ),
    });

  it('lists every catalogue entry, the unused ones with zeroes', () => {
    const rows =
      buildProducts(
        catalogue,
        [
          use(
            'b',
            5,
          ),
        ],
      );
    expect(
      rows.map(
        (
          r,
        ) => [
          r.id,
          r.actives,
        ],
      ),
    ).toEqual(
      [
        [
          'b',
          5,
        ],
        [
          'a',
          0,
        ],
        [
          'c',
          0,
        ],
      ],
    );
    expect(
      rows.find(
        (
          r,
        ) =>
          r.id ===
          'a',
      ),
    ).toMatchObject(
      {
        players: 0,
        lastActiveAt:
          null,
      },
    );
  });

  it('keeps an id the catalogue no longer names, marked as such', () => {
    const rows =
      buildProducts(
        catalogue,
        [
          use(
            'retired',
            2,
          ),
        ],
      );
    expect(
      rows[0],
    ).toMatchObject(
      {
        id: 'retired',
        kind: 'uncatalogued',
        actives: 2,
        href: null,
      },
    );
    expect(
      rows,
    ).toHaveLength(
      4,
    );
  });
});

describe('productQuiet', () => {
  const product =
    (
      over: Partial<CensusProduct>,
    ): CensusProduct => ({
      id: 'a',
      title:
        'A',
      kind: 'game',
      href: '/a',
      tracked: true,
      actives: 0,
      playtimeActives: 0,
      historyActives: 0,
      players: 0,
      lastActiveAt:
        null,
      ...over,
    });

  it('is quiet when never used or last used before the window', () => {
    expect(
      productQuiet(
        product(
          {},
        ),
        frame(
          null,
        ),
      ),
    ).toBe(
      'quiet',
    );
    expect(
      productQuiet(
        product(
          {
            lastActiveAt:
              daysAgo(
                91,
              ),
          },
        ),
        frame(
          null,
        ),
      ),
    ).toBe(
      'quiet',
    );
    expect(
      productQuiet(
        product(
          {
            lastActiveAt:
              daysAgo(
                89,
              ),
          },
        ),
        frame(
          null,
        ),
      ),
    ).toBe(
      'active',
    );
  });

  it('never calls an unmeasured product quiet', () => {
    expect(
      productQuiet(
        product(
          {
            tracked: false,
          },
        ),
        frame(
          null,
        ),
      ),
    ).toBe(
      'unknown',
    );
  });
});

describe('summary and the evidence file', () => {
  const census: Census =
    {
      version: 1,
      takenAt:
        NOW,
      activeDays: 30,
      quietDays: 90,
      statsReset:
        daysAgo(
          400,
        ),
      serverVersion:
        '16.4',
      tables:
        [
          table(
            {
              table:
                'busy',
              inserts: 3,
              newestRow:
                daysAgo(
                  1,
                ),
              newestRowColumn:
                'createdAt',
              newestRowMethod:
                'index',
            },
          ),
          table(
            {
              table:
                'dead',
              liveRows: 0,
            },
          ),
          table(
            {
              table:
                'murky',
              inserts: 2,
            },
          ),
        ],
      products:
        buildProducts(
          [
            {
              id: 'a',
              title:
                'A',
              kind: 'game',
              href: '/a',
              tracked: true,
            },
            {
              id: 'b',
              title:
                'B',
              kind: 'app',
              href: '/b',
              tracked: true,
            },
          ],
          [
            {
              id: 'a',
              actives: 7,
              playtimeActives: 7,
              historyActives: 1,
              players: 12,
              lastActiveAt:
                daysAgo(
                  2,
                ),
            },
          ],
        ),
    };

  it('counts quiet and unknown separately', () => {
    expect(
      summarizeCensus(
        census,
      ),
    ).toEqual(
      {
        tables: 3,
        emptyTables: 1,
        quietTables: 1,
        unknownTables: 1,
        products: 2,
        activeProducts: 1,
        quietProducts: 1,
      },
    );
  });

  it('resolves the unknown table once a snapshot is old enough', () => {
    const old =
      baselineOf(
        {
          ...census,
          takenAt:
            daysAgo(
              100,
            ),
        },
      );
    expect(
      summarizeCensus(
        census,
        old,
      ),
    ).toMatchObject(
      {
        quietTables: 2,
        unknownTables: 0,
      },
    );
  });

  it('prints the origin first and every table and product', () => {
    const md =
      renderCensusMarkdown(
        census,
        'LOCAL DEVELOPMENT SNAPSHOT.',
      );
    const lines =
      md.split(
        '\n',
      );
    expect(
      lines[2],
    ).toBe(
      '> LOCAL DEVELOPMENT SNAPSHOT.',
    );
    expect(
      md,
    ).toContain(
      'Postgres does not record when a table was last written.',
    );
    expect(
      md,
    ).toContain(
      '| busy | 10 | 3 | 0 | 8192 | 2026-11-11 (createdAt, index) |  | active (newest-row) |',
    );
    expect(
      md,
    ).toContain(
      '| dead | 0 | 0 | 0 | 8192 |  |  | quiet (counters) |',
    );
    expect(
      md,
    ).toContain(
      '| murky | 10 | 2 | 0 | 8192 |  |  | unknown |',
    );
    expect(
      md,
    ).toContain(
      '| a | game | 7 | 7 | 1 | 12 | 2026-11-10 | yes |',
    );
    expect(
      md,
    ).toContain(
      '| b | app | 0 | 0 | 0 | 0 |  | yes |',
    );
  });
});
