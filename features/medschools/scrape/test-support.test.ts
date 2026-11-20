import {
  describe,
  it,
  expect,
} from 'vitest';
import {
  assertNoLeak,
  createFakeHost,
  createFakePrisma,
  loadFixture,
  NEEDLES,
  SDN_HOSTILE_NEEDLES,
  gqlKey,
} from './test-support';

const count =
  (
    over: Record<
      string,
      unknown
    > = {},
  ) => ({
    schoolId:
      's1',
    program:
      'REG',
    cycleYear: 2027,
    date: new Date(
      '2026-09-01',
    ),
    eventType:
      'INTERVIEW',
    source:
      'CYCLETRACK',
    count: 5,
    contributors:
      null,
    ...over,
  });

describe('createFakePrisma', () => {
  it('rejects a duplicate count key and records writes', async () => {
    const {
      prisma,
      writes,
    } =
      createFakePrisma();
    await prisma.medCycleCount.createMany(
      {
        data: [
          count(),
        ],
      },
    );
    await expect(
      prisma.medCycleCount.createMany(
        {
          data: [
            count(
              {
                count: 9,
              },
            ),
          ],
        },
      ),
    ).rejects.toThrow(
      /Unique/,
    );
    expect(
      writes,
    ).toHaveLength(
      2,
    );
  });
  it('rejects a duplicate alias key but allows the same key from another source', async () => {
    const {
      prisma,
    } =
      createFakePrisma();
    await prisma.medSchoolAlias.upsert(
      {
        where:
          {},
        create:
          {
            schoolId:
              'a',
            source:
              'ADMIT',
            sourceKey:
              'k',
          },
        update:
          {},
      },
    );
    await prisma.medSchoolAlias.upsert(
      {
        where:
          {},
        create:
          {
            schoolId:
              'a',
            source:
              'SDN',
            sourceKey:
              'k',
          },
        update:
          {},
      },
    );
    await expect(
      prisma.medSchoolAlias.upsert(
        {
          where:
            {
              source_sourceKey:
                {
                  source:
                    'x',
                  sourceKey:
                    'y',
                },
            },
          create:
            {
              schoolId:
                'b',
              source:
                'ADMIT',
              sourceKey:
                'k',
            },
          update:
            {},
        },
      ),
    ).rejects.toThrow(
      /Unique/,
    );
  });
  it('findMany filters by where equality', async () => {
    const {
      prisma,
    } =
      createFakePrisma();
    await prisma.medCycleCount.createMany(
      {
        data: [
          count(),
          count(
            {
              eventType:
                'SECONDARY',
            },
          ),
          count(
            {
              schoolId:
                's2',
            },
          ),
        ],
      },
    );
    expect(
      await prisma.medCycleCount.findMany(
        {
          where:
            {
              schoolId:
                's1',
            },
        },
      ),
    ).toHaveLength(
      2,
    );
    expect(
      await prisma.medCycleCount.findMany(
        {
          where:
            {
              schoolId:
                's1',
              eventType:
                'SECONDARY',
            },
        },
      ),
    ).toHaveLength(
      1,
    );
    expect(
      await prisma.medCycleCount.count(
        {
          where:
            {
              date: new Date(
                '2026-09-01',
              ),
            },
        },
      ),
    ).toBe(
      3,
    );
  });
  it('upsert updates in place and deleteMany removes', async () => {
    const {
      prisma,
      tables,
    } =
      createFakePrisma();
    await prisma.medCycle.upsert(
      {
        where:
          {
            cycleYear: 2027,
          },
        create:
          {
            cycleYear: 2027,
            dateEstimated: true,
          },
        update:
          {},
      },
    );
    await prisma.medCycle.upsert(
      {
        where:
          {
            cycleYear: 2027,
          },
        create:
          {},
        update:
          {
            dateEstimated: false,
          },
      },
    );
    expect(
      tables.medCycle,
    ).toEqual(
      [
        expect.objectContaining(
          {
            cycleYear: 2027,
            dateEstimated: false,
          },
        ),
      ],
    );
    expect(
      await prisma.medCycleCount.deleteMany(
        {
          where:
            {
              schoolId:
                'none',
            },
        },
      ),
    ).toEqual(
      {
        count: 0,
      },
    );
  });
});

describe('assertNoLeak', () => {
  it('throws naming a planted needle and passes when absent', () => {
    expect(
      () =>
        assertNoLeak(
          [
            {
              a: 'id-98765',
            },
          ],
          [
            '98765',
          ],
        ),
    ).toThrow(
      /98765/,
    );
    expect(
      () =>
        assertNoLeak(
          [
            {
              a: 'hash',
            },
          ],
          [
            '98765',
          ],
        ),
    ).not.toThrow();
  });
});

describe('loadFixture', () => {
  it('reads the yale fixture', () => {
    expect(
      loadFixture(
        'yale.html',
      )
        .length,
    ).toBeGreaterThan(
      0,
    );
  });
});

describe('fake Admit tables', () => {
  const ev = (over: Record<string, unknown> = {}) => ({
    schoolId: 's1',
    cycleYear: 2027,
    program: null,
    eventType: 'ACCEPTANCE',
    occurredAt: new Date('2026-10-01T00:00:00Z'),
    source: 'ADMIT',
    dedupeHash: 'h1',
    inState: null,
    ...over,
  });

  it('enforces dedupeHash uniqueness on medCycleEvent (createMany skipDuplicates skips, create throws)', async () => {
    const { prisma, tables } = createFakePrisma();
    await prisma.medCycleEvent.createMany({ data: [ev(), ev()], skipDuplicates: true });
    expect(tables.medCycleEvent).toHaveLength(1);
    await expect(prisma.medCycleEvent.createMany({ data: [ev()] })).rejects.toThrow(/Unique constraint/);
    const r = await prisma.medCycleEvent.createMany({ data: [ev(), ev({ dedupeHash: 'h2' })], skipDuplicates: true });
    expect(r.count).toBe(1);
  });

  it('gte/lt filters on occurredAt', async () => {
    const { prisma } = createFakePrisma();
    await prisma.medCycleEvent.createMany({
      data: [
        ev({ dedupeHash: 'a', occurredAt: new Date('2026-09-01T00:00:00Z') }),
        ev({ dedupeHash: 'b', occurredAt: new Date('2026-10-01T00:00:00Z') }),
        ev({ dedupeHash: 'c', occurredAt: new Date('2026-11-01T00:00:00Z') }),
      ],
    });
    const rows = await prisma.medCycleEvent.findMany({
      where: { occurredAt: { gte: new Date('2026-10-01T00:00:00Z'), lt: new Date('2026-11-01T00:00:00Z') } },
    });
    expect(rows.map((r) => r.dedupeHash)).toEqual(['b']);
  });

  it('supports not: null and not: value, and findUnique', async () => {
    const { prisma } = createFakePrisma();
    await prisma.medSchoolAliasMiss.upsert({
      where: { source_sourceKey: { source: 'ADMIT', sourceKey: 'x' } },
      create: { source: 'ADMIT', sourceKey: 'x', resolvedSchoolId: 's1' },
      update: {},
    });
    await prisma.medSchoolAliasMiss.upsert({
      where: { source_sourceKey: { source: 'ADMIT', sourceKey: 'y' } },
      create: { source: 'ADMIT', sourceKey: 'y', resolvedSchoolId: null },
      update: {},
    });
    expect(await prisma.medSchoolAliasMiss.findMany({ where: { resolvedSchoolId: { not: null } } })).toHaveLength(1);
    expect(await prisma.medSchoolAliasMiss.findMany({ where: { sourceKey: { not: 'x' } } })).toHaveLength(1);
    await prisma.medSchool.upsert({ where: { slug: 'a' }, create: { slug: 'a', name: 'A' }, update: {} });
    expect(await prisma.medSchool.findUnique({ where: { slug: 'a' } })).toMatchObject({ slug: 'a' });
    expect(await prisma.medSchool.findUnique({ where: { slug: 'zz' } })).toBeNull();
  });

  it('keys interview profiles by (schoolId, source) and questions by dedupeHash', async () => {
    const { prisma } = createFakePrisma();
    const p = { schoolId: 's1', source: 'ADMIT', fetchedAt: new Date(), feedbackPositive: [] };
    await prisma.medInterviewProfile.upsert({ where: { schoolId_source: { schoolId: 's1', source: 'ADMIT' } }, create: p, update: { format: 'MMI' } });
    await prisma.medInterviewProfile.upsert({ where: { schoolId_source: { schoolId: 's1', source: 'ADMIT' } }, create: p, update: { format: 'MMI' } });
    expect(await prisma.medInterviewProfile.findFirst({ where: { schoolId: 's1' } })).toMatchObject({ format: 'MMI' });
    await prisma.medInterviewQuestion.createMany({ data: [{ dedupeHash: 'q', text: 't' }, { dedupeHash: 'q', text: 't' }], skipDuplicates: true });
    expect(await prisma.medInterviewQuestion.findMany()).toHaveLength(1);
  });

  it('NEEDLES folds the hostile Admit strings in with the CycleTrack ones', () => {
    expect(NEEDLES).toEqual(expect.arrayContaining(['drsmith42', 'user_id=9931', 'user-hostile-9931']));
    expect(NEEDLES).toEqual(expect.arrayContaining([...SDN_HOSTILE_NEEDLES]));
  });

  it('createFakeHost serves POSTs by gqlKey with sorted variables and records them', async () => {
    const { host, requestedPosts } = createFakeHost({
      [gqlKey('/graphql', 'op', { a: 1, b: 2 })]: '{"ok":true}',
    });
    const s = host.session();
    const hit = await s.post('/graphql', JSON.stringify({ operationName: 'op', query: 'q', variables: { b: 2, a: 1 } }));
    expect(hit).toMatchObject({ ok: true, status: 200, body: '{"ok":true}' });
    const miss = await s.post('/graphql', JSON.stringify({ operationName: 'other', query: 'q', variables: {} }));
    expect(miss).toMatchObject({ ok: false, status: 404 });
    expect(requestedPosts).toEqual([
      { op: 'op', variables: { b: 2, a: 1 } },
      { op: 'other', variables: {} },
    ]);
    expect(gqlKey('/graphql', 'op', { b: 2, a: 1 })).toBe('POST /graphql op {"a":1,"b":2}');
  });
});
