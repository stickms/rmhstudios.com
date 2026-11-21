/**
 * Build insights (s04-05), the mission-critical half: only the owner (or an admin) reads a build's numbers, the raw SQL
 * names real tables and columns, and the answer carries counts only. In-memory stand-in for Prisma; no database.
 */
import {
  readFileSync,
  readdirSync,
} from 'node:fs';
import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

const db =
  vi.hoisted(
    () => ({
      builds:
        [] as {
          id: string;
          slug: string;
          userId: string;
          title: string;
          isCurated: boolean;
          visibility: string;
        }[],
      versions:
        [] as {
          id: string;
          buildId: string;
          version: string;
          changelog: null;
          commitHash: null;
          createdAt: Date;
        }[],
      rows: {} as Record<
        string,
        {
          day: string;
          n: number;
          coins?: number;
        }[]
      >,
      sql: [] as {
        text: string;
        values: unknown[];
      }[],
    }),
  );

vi.mock(
  '@/lib/prisma.server',
  () => ({
    prisma:
      {
        userBuild:
          {
            findUnique:
              async ({
                where,
              }: {
                where: {
                  id?: string;
                  slug?: string;
                };
              }) =>
                db.builds.find(
                  (
                    b,
                  ) =>
                    where.id
                      ? b.id ===
                        where.id
                      : b.slug ===
                        where.slug,
                ) ??
                null,
          },
        buildVersion:
          {
            findMany:
              async ({
                where,
              }: {
                where: {
                  buildId: string;
                };
              }) =>
                db.versions.filter(
                  (
                    v,
                  ) =>
                    v.buildId ===
                    where.buildId,
                ),
          },
        $queryRaw:
          async (
            strings: TemplateStringsArray,
            ...values: unknown[]
          ) => {
            const text =
              strings.join(
                '?',
              );
            db.sql.push(
              {
                text,
                values,
              },
            );
            const table =
              /FROM "([a-z_]+)"/.exec(
                text,
              )![1]!;
            return (
              db
                .rows[
                table
              ] ??
              []
            );
          },
      },
  }),
);

import {
  canReadInsights,
  getBuildInsights,
} from '@/lib/builds/insights.server';

const NOW =
  Date.parse(
    '2026-12-10T12:00:00Z',
  );
const owner =
  {
    id: 'owner',
    isAdmin: false,
  };

beforeEach(
  () => {
    db.builds =
      [
        {
          id: 'b1',
          slug: 'my-build',
          userId:
            'owner',
          title:
            'My build',
          isCurated: false,
          visibility:
            'PUBLIC',
        },
        {
          id: 'b2',
          slug: 'secret',
          userId:
            'owner',
          title:
            'Secret',
          isCurated: false,
          visibility:
            'PRIVATE',
        },
        {
          id: 'b3',
          slug: 'curated',
          userId:
            'owner',
          title:
            'Curated',
          isCurated: true,
          visibility:
            'PUBLIC',
        },
      ];
    db.versions =
      [
        {
          id: 'v1',
          buildId:
            'b1',
          version:
            '1.2',
          changelog:
            null,
          commitHash:
            null,
          createdAt:
            new Date(
              '2026-12-08T09:00:00Z',
            ),
        },
        {
          id: 'v0',
          buildId:
            'b1',
          version:
            '1.0',
          changelog:
            null,
          commitHash:
            null,
          createdAt:
            new Date(
              '2026-01-01T09:00:00Z',
            ),
        },
        {
          id: 'v9',
          buildId:
            'b2',
          version:
            '0.1',
          changelog:
            null,
          commitHash:
            null,
          createdAt:
            new Date(
              '2026-12-09T09:00:00Z',
            ),
        },
      ];
    db.rows =
      {
        build_view:
          [
            {
              day: '2026-12-08',
              n: 4,
            },
            {
              day: '2026-11-20',
              n: 1,
            },
          ],
        build_like:
          [
            {
              day: '2026-12-08',
              n: 2,
            },
          ],
        build_comment:
          [
            {
              day: '2026-12-09',
              n: 1,
            },
          ],
        build_unlock:
          [
            {
              day: '2026-12-09',
              n: 2,
              coins: 300,
            },
          ],
      };
    db.sql =
      [];
  },
);

describe('who may read a build’s insights', () => {
  it('lets the owner read them, by id or by slug', async () => {
    expect(
      (
        await getBuildInsights(
          'b1',
          owner,
          30,
          NOW,
        )
      )
        ?.title,
    ).toBe(
      'My build',
    );
    expect(
      (
        await getBuildInsights(
          'my-build',
          owner,
          30,
          NOW,
        )
      )
        ?.title,
    ).toBe(
      'My build',
    );
  });

  it('answers another member as it would a build that does not exist', async () => {
    expect(
      await getBuildInsights(
        'b1',
        {
          id: 'other',
          isAdmin: false,
        },
        30,
        NOW,
      ),
    ).toBeNull();
    expect(
      await getBuildInsights(
        'nope',
        {
          id: 'other',
          isAdmin: false,
        },
        30,
        NOW,
      ),
    ).toBeNull();
    expect(
      db.sql,
    ).toHaveLength(
      0,
    );
  });

  it('answers a signed-out caller with nothing, and runs no query', async () => {
    expect(
      await getBuildInsights(
        'b1',
        null,
        30,
        NOW,
      ),
    ).toBeNull();
    expect(
      db.sql,
    ).toHaveLength(
      0,
    );
  });

  it('lets an admin read any build, private ones included, with its releases', async () => {
    const admin =
      {
        id: 'admin',
        isAdmin: true,
      };
    expect(
      canReadInsights(
        {
          userId:
            'owner',
        },
        admin,
      ),
    ).toBe(
      true,
    );
    const out =
      await getBuildInsights(
        'b2',
        admin,
        30,
        NOW,
      );
    expect(
      out?.releases,
    ).toEqual(
      [
        {
          day: '2026-12-09',
          version:
            '0.1',
        },
      ],
    );
  });
});

describe('the answer', () => {
  it('counts per day with zeros between, the previous period in the totals, and releases as markers', async () => {
    const out =
      (await getBuildInsights(
        'b1',
        owner,
        7,
        NOW,
      ))!;
    expect(
      out.days,
    ).toHaveLength(
      7,
    );
    expect(
      out.days.map(
        (
          d,
        ) =>
          d.views,
      ),
    ).toEqual(
      [
        0,
        0,
        0,
        0,
        4,
        0,
        0,
      ],
    );
    expect(
      out
        .totals
        .views,
    ).toMatchObject(
      {
        value: 4,
        previous: 0,
      },
    );
    expect(
      out
        .totals
        .coins
        .value,
    ).toBe(
      300,
    );
    expect(
      out
        .totals
        .unlocks
        .value,
    ).toBe(
      2,
    );
    expect(
      out.releases,
    ).toEqual(
      [
        {
          day: '2026-12-08',
          version:
            '1.2',
        },
      ],
    );
    expect(
      out
        .biggestDays[0],
    ).toMatchObject(
      {
        day: '2026-12-08',
        views: 4,
        likes: 2,
        releases:
          [
            '1.2',
          ],
      },
    );
  });

  it('puts one day of the previous period in the previous totals only', async () => {
    db.rows.build_view =
      [
        {
          day: '2026-12-03',
          n: 3,
        },
      ];
    const out =
      (await getBuildInsights(
        'b1',
        owner,
        7,
        NOW,
      ))!;
    expect(
      out
        .totals
        .views,
    ).toMatchObject(
      {
        value: 0,
        previous: 3,
      },
    );
  });

  it('names no member: only counts leave the server', async () => {
    const out =
      JSON.stringify(
        await getBuildInsights(
          'b1',
          owner,
          30,
          NOW,
        ),
      );
    expect(
      out,
    ).not.toMatch(
      /userId|ipHash|owner/,
    );
  });

  it('skips the view table for a curated build, which records no views', async () => {
    const out =
      (await getBuildInsights(
        'b3',
        owner,
        30,
        NOW,
      ))!;
    expect(
      out.hasViews,
    ).toBe(
      false,
    );
    expect(
      db.sql.map(
        (
          q,
        ) =>
          /FROM "([a-z_]+)"/.exec(
            q.text,
          )![1],
      ),
    ).not.toContain(
      'build_view',
    );
  });

  it('runs at most four queries', async () => {
    await getBuildInsights(
      'b1',
      owner,
      90,
      NOW,
    );
    expect(
      db.sql,
    ).toHaveLength(
      4,
    );
  });
});

/** Every `@@map` table of the schema, with its model's field names. */
function schemaTables(): Map<
  string,
  Set<string>
> {
  const tables =
    new Map<
      string,
      Set<string>
    >();
  for (const file of readdirSync(
    'prisma/schema',
  ).filter(
    (
      f,
    ) =>
      f.endsWith(
        '.prisma',
      ),
  )) {
    const src =
      readFileSync(
        `prisma/schema/${file}`,
        'utf8',
      );
    for (const block of src.match(
      /^model \w+ \{[\s\S]*?^\}/gm,
    ) ??
      []) {
      const map =
        /@@map\("([^"]+)"\)/.exec(
          block,
        )?.[1];
      if (
        !map
      )
        continue;
      tables.set(
        map,
        new Set(
          [
            ...block.matchAll(
              /^\s{2}(\w+)\s+\S/gm,
            ),
          ].map(
            (
              m,
            ) =>
              m[1]!,
          ),
        ),
      );
    }
  }
  return tables;
}

describe('the insights SQL', () => {
  it('names real tables and quoted camelCase columns', async () => {
    await getBuildInsights(
      'b1',
      owner,
      30,
      NOW,
    );
    const sql =
      db.sql
        .map(
          (
            q,
          ) =>
            q.text,
        )
        .join(
          '\n',
        );
    const tables =
      schemaTables();
    const used =
      new Set(
        [
          ...sql.matchAll(
            /FROM\s+"([a-z_]+)"/g,
          ),
        ].map(
          (
            m,
          ) =>
            m[1]!,
        ),
      );
    expect(
      [
        ...used,
      ].sort(),
    ).toEqual(
      [
        'build_comment',
        'build_like',
        'build_unlock',
        'build_view',
      ],
    );
    for (const name of used)
      expect(
        tables.has(
          name,
        ),
        `table ${name}`,
      ).toBe(
        true,
      );
    for (const table of used) {
      for (const col of [
        'buildId',
        'createdAt',
      ])
        expect(
          tables
            .get(
              table,
            )!
            .has(
              col,
            ),
          `${table}.${col}`,
        ).toBe(
          true,
        );
    }
    expect(
      tables
        .get(
          'build_unlock',
        )!
        .has(
          'pricePaid',
        ),
    ).toBe(
      true,
    );
    expect(
      sql,
    ).toContain(
      '"pricePaid"',
    );
    // Counts only: nothing selects who looked.
    expect(
      sql,
    ).not.toContain(
      '"userId"',
    );
    expect(
      sql,
    ).not.toContain(
      '"ipHash"',
    );
    // Every column is quoted camelCase, never bare or snake_case.
    expect(
      sql,
    ).not.toMatch(
      /\b(build_id|created_at|price_paid)\b/,
    );
    expect(
      sql,
    ).not.toMatch(
      /[^"]\bbuildId\b[^"]/,
    );
  });

  it('binds the build id and the range as parameters, not text', async () => {
    await getBuildInsights(
      'b1',
      owner,
      30,
      NOW,
    );
    for (const q of db.sql) {
      expect(
        q
          .values[0],
      ).toBe(
        'b1',
      );
      expect(
        q.values,
      ).toHaveLength(
        3,
      );
    }
  });

  it('the migrations only add the indexes the SQL reads, each CONCURRENTLY and alone, with a validity repair', () => {
    const dirs: Record<
      string,
      string
    > =
      {
        build_view:
          '20261124040100_s04_build_view_index',
        build_like:
          '20261124040101_s04_build_like_index',
        build_unlock:
          '20261124040102_s04_build_unlock_index',
      };
    for (const [
      table,
      dir,
    ] of Object.entries(
      dirs,
    )) {
      const sql =
        readFileSync(
          `prisma/migrations/${dir}/migration.sql`,
          'utf8',
        );
      expect(
        sql,
      ).toContain(
        `CREATE INDEX CONCURRENTLY IF NOT EXISTS "${table}_buildId_createdAt_idx"`,
      );
      expect(
        sql,
      ).toContain(
        `ON "${table}" ("buildId", "createdAt")`,
      );
      expect(
        sql.match(
          /CREATE INDEX/g,
        ),
      ).toHaveLength(
        1,
      );
      expect(
        sql,
      ).not.toMatch(
        /DROP|ALTER TABLE|CREATE TABLE/,
      );
    }
    const repair =
      readFileSync(
        'prisma/migrations/20261124040103_s04_build_insights_indexes_ensure_valid/migration.sql',
        'utf8',
      );
    for (const table of Object.keys(
      dirs,
    ))
      expect(
        repair,
      ).toContain(
        `'${table}'`,
      );
    expect(
      repair,
    ).toContain(
      'indisvalid',
    );
  });
});
