import {
  describe,
  it,
  expect,
} from 'vitest';
import {
  assertNoLeak,
  createFakePrisma,
  loadFixture,
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
