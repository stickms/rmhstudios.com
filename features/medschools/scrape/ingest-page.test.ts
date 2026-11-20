import {
  describe,
  expect,
  it,
} from 'vitest';
import {
  parseSchoolPage,
  type ParsedSchoolPage,
} from './adapters/cycletrack';
import { ingestSchoolPage } from './ingest-page';
import {
  createFakePrisma,
  loadFixture,
} from './test-support';

const yale =
  () =>
    parseSchoolPage(
      loadFixture(
        'yale.html',
      ),
      'Yale',
    );
const rows =
  (
    tables: Record<
      string,
      unknown[]
    >,
  ) =>
    tables.medCycleCount as Array<{
      schoolId: string;
      program: string;
      cycleYear: number;
      date: Date;
      eventType: string;
      source: string;
      count: number;
    }>;

describe('ingestSchoolPage', () => {
  it('first ingest of yale.html creates counts for both programs and both cycles', async () => {
    const {
      prisma,
      tables,
    } =
      createFakePrisma();
    const page =
      yale();
    const r =
      await ingestSchoolPage(
        prisma,
        's1',
        page,
      );
    expect(
      r.created,
    ).toBe(
      page
        .counts
        .length,
    );
    expect(
      r.updated +
        r.deleted,
    ).toBe(
      0,
    );
    const stored =
      rows(
        tables,
      );
    expect(
      new Set(
        stored.map(
          (
            x,
          ) =>
            x.program,
        ),
      ),
    ).toEqual(
      new Set(
        [
          'REG',
          'PHD',
        ],
      ),
    );
    expect(
      new Set(
        stored.map(
          (
            x,
          ) =>
            x.cycleYear,
        ),
      )
        .size,
    ).toBe(
      2,
    );
    expect(
      stored.every(
        (
          x,
        ) =>
          x.source ===
            'CYCLETRACK' &&
          x.schoolId ===
            's1',
      ),
    ).toBe(
      true,
    );
  });

  it('second identical ingest performs zero writes', async () => {
    const {
      prisma,
      writes,
    } =
      createFakePrisma();
    await ingestSchoolPage(
      prisma,
      's1',
      yale(),
    );
    const before =
      writes.length;
    const r =
      await ingestSchoolPage(
        prisma,
        's1',
        yale(),
      );
    expect(
      writes.length,
    ).toBe(
      before,
    );
    expect(
      r,
    ).toEqual(
      {
        created: 0,
        updated: 0,
        deleted: 0,
      },
    );
  });

  it('a count lowered upstream is overwritten, not added', async () => {
    const {
      prisma,
      tables,
    } =
      createFakePrisma();
    const page =
      yale();
    await ingestSchoolPage(
      prisma,
      's1',
      page,
    );
    const target =
      page.tables
        .flatMap(
          (
            t,
          ) =>
            t.counts,
        )
        .find(
          (
            c,
          ) =>
            c.count >=
            2,
        )!;
    const total =
      rows(
        tables,
      ).length;
    target.count =
      target.count -
      1;
    const r =
      await ingestSchoolPage(
        prisma,
        's1',
        page,
      );
    expect(
      r,
    ).toEqual(
      {
        created: 0,
        updated: 1,
        deleted: 0,
      },
    );
    expect(
      rows(
        tables,
      ),
    ).toHaveLength(
      total,
    );
    const hit =
      rows(
        tables,
      ).find(
        (
          x,
        ) =>
          x.program ===
            target.program &&
          x.cycleYear ===
            target.cycleYear &&
          x.date
            .toISOString()
            .slice(
              0,
              10,
            ) ===
            target.date &&
          x.eventType ===
            target.eventType,
      )!;
    expect(
      hit.count,
    ).toBe(
      target.count,
    );
  });

  it('a count that disappears from a present table is deleted', async () => {
    const {
      prisma,
      tables,
    } =
      createFakePrisma();
    const page =
      yale();
    await ingestSchoolPage(
      prisma,
      's1',
      page,
    );
    const t =
      page
        .tables[0]!;
    t.counts.pop();
    const total =
      rows(
        tables,
      ).length;
    const r =
      await ingestSchoolPage(
        prisma,
        's1',
        page,
      );
    expect(
      r.deleted,
    ).toBe(
      1,
    );
    expect(
      rows(
        tables,
      ),
    ).toHaveLength(
      total -
        1,
    );
  });

  it('a table present with no rows deletes the stale rows for that program and cycle only', async () => {
    const {
      prisma,
      tables,
    } =
      createFakePrisma();
    const page =
      yale();
    await ingestSchoolPage(
      prisma,
      's1',
      page,
    );
    const t =
      page
        .tables[0]!;
    const gone =
      rows(
        tables,
      ).filter(
        (
          x,
        ) =>
          x.program ===
            t.program &&
          x.cycleYear ===
            t.cycleYear,
      ).length;
    const total =
      rows(
        tables,
      ).length;
    t.counts =
      [];
    await ingestSchoolPage(
      prisma,
      's1',
      page,
    );
    expect(
      rows(
        tables,
      ),
    ).toHaveLength(
      total -
        gone,
    );
  });

  it('does not delete counts for a program/cycle absent from the page', async () => {
    const {
      prisma,
      tables,
    } =
      createFakePrisma();
    await ingestSchoolPage(
      prisma,
      's1',
      yale(),
    );
    const phd2026 =
      rows(
        tables,
      ).filter(
        (
          x,
        ) =>
          x.program ===
            'PHD' &&
          x.cycleYear ===
            2026,
      ).length;
    expect(
      phd2026,
    ).toBeGreaterThan(
      0,
    );
    const regOnly: ParsedSchoolPage =
      yale();
    regOnly.tables =
      regOnly.tables.filter(
        (
          t,
        ) =>
          t.program ===
          'REG',
      );
    regOnly.counts =
      regOnly.tables.flatMap(
        (
          t,
        ) =>
          t.counts,
      );
    const r =
      await ingestSchoolPage(
        prisma,
        's1',
        regOnly,
      );
    expect(
      r.deleted,
    ).toBe(
      0,
    );
    expect(
      rows(
        tables,
      ).filter(
        (
          x,
        ) =>
          x.program ===
            'PHD' &&
          x.cycleYear ===
            2026,
      ),
    ).toHaveLength(
      phd2026,
    );
  });

  it('does not touch another school or another source', async () => {
    const {
      prisma,
      tables,
    } =
      createFakePrisma();
    await ingestSchoolPage(
      prisma,
      'other',
      yale(),
    );
    const before =
      rows(
        tables,
      ).length;
    const empty =
      yale();
    empty.tables.forEach(
      (
        t,
      ) =>
        (t.counts =
          []),
    );
    await ingestSchoolPage(
      prisma,
      's1',
      empty,
    );
    expect(
      rows(
        tables,
      ),
    ).toHaveLength(
      before,
    );
  });

  it('date round-trips without timezone shift', async () => {
    const {
      prisma,
      tables,
    } =
      createFakePrisma();
    const page =
      yale();
    const t =
      page
        .tables[0]!;
    const base =
      t
        .counts[0]!;
    const dates =
      [
        '2026-03-08',
        '2026-12-31',
        '2026-11-01',
      ];
    t.counts =
      dates.map(
        (
          date,
        ) => ({
          ...base,
          date,
        }),
      );
    await ingestSchoolPage(
      prisma,
      's1',
      {
        ...page,
        tables:
          [
            t,
          ],
        counts:
          t.counts,
      },
    );
    const stored =
      rows(
        tables,
      ).map(
        (
          x,
        ) =>
          x.date
            .toISOString()
            .slice(
              0,
              10,
            ),
      );
    expect(
      stored.sort(),
    ).toEqual(
      [
        ...dates,
      ].sort(),
    );
    expect(
      rows(
        tables,
      ).every(
        (
          x,
        ) =>
          x.date.getUTCHours() ===
          0,
      ),
    ).toBe(
      true,
    );
  });

  it('never violates the (school, program, cycle, date, type, source) key across re-ingests', async () => {
    const {
      prisma,
    } =
      createFakePrisma();
    const page =
      yale();
    await ingestSchoolPage(
      prisma,
      's1',
      page,
    );
    await expect(
      ingestSchoolPage(
        prisma,
        's1',
        page,
      ),
    ).resolves.toBeDefined();
    page.tables[0]!.counts.forEach(
      (
        c,
      ) =>
        (c.count += 1),
    );
    await expect(
      ingestSchoolPage(
        prisma,
        's1',
        page,
      ),
    ).resolves.toBeDefined();
  });
  it('a stale read of the existing rows (a concurrent run got there first) does not fail on the unique key', async () => {
    const { prisma, tables } = createFakePrisma();
    const page = yale();
    await ingestSchoolPage(prisma, 's1', page);
    const before = rows(tables).length;
    const real = prisma.medCycleCount.findMany;
    prisma.medCycleCount.findMany = (async () => []) as typeof real;
    await expect(ingestSchoolPage(prisma, 's1', page)).resolves.toBeDefined();
    prisma.medCycleCount.findMany = real;
    expect(rows(tables)).toHaveLength(before);
  });
});
