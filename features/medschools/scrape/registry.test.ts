import {
  describe,
  expect,
  it,
} from 'vitest';
import type { FirstRow } from './adapters/cycletrack';
import {
  buildRegistry,
  parsePageTitle,
  seedAdmitAliases,
  seedAdmitIgnoredMisses,
  seedSdnAliases,
  seedSdnIgnoredMisses,
  seedCycles,
  seedRegistryIfEmpty,
  type RegistryFile,
} from './registry';
import {
  createFakePrisma,
  loadFixture,
} from './test-support';

const page =
  (
    name: string,
    degree: string,
    city: string,
    st: string,
  ) =>
    `<html><head><title>${name} ${degree} Admissions Data (${city}, ${st}) | CycleTrack</title></head></html>`;

const noDates =
  {
    secondaryOn:
      null,
    interviewOn:
      null,
    acceptanceOn:
      null,
  };
const row =
  (
    key: string,
    degree:
      | 'MD'
      | 'DO',
  ): FirstRow => ({
    key,
    displayName:
      key,
    degree,
    reg: noDates,
    phd: noDates,
  });

describe('parsePageTitle', () => {
  it('reads name, degree, city and state from the Yale fixture', () => {
    expect(
      parsePageTitle(
        loadFixture(
          'yale.html',
        ),
      ),
    ).toEqual(
      {
        name: 'Yale School of Medicine',
        degree:
          'MD',
        city: 'New Haven',
        state:
          'CT',
      },
    );
  });

  it('reads a Canadian province code and unescapes entities', () => {
    expect(
      parsePageTitle(
        loadFixture(
          'toronto.html',
        ),
      )
        ?.state,
    ).toBe(
      'ON',
    );
    expect(
      parsePageTitle(
        loadFixture(
          'texas-am-raw.html',
        ),
      )
        ?.name,
    ).toBe(
      'Texas A&M University',
    );
  });

  it('returns null for a page that is not a school page', () => {
    expect(
      parsePageTitle(
        loadFixture(
          'first.html',
        ),
      ),
    ).toBeNull();
    expect(
      parsePageTitle(
        '<html></html>',
      ),
    ).toBeNull();
  });
});

describe('buildRegistry', () => {
  const base =
    {
      schoolKeys:
        [
          'Toronto',
          'Massachussetts',
          'Texas A&M',
          'Orphan',
        ],
      first:
        [
          row(
            'Toronto',
            'MD',
          ),
          row(
            'Massachussetts',
            'MD',
          ),
          row(
            'Texas A&M',
            'MD',
          ),
        ],
      titles:
        {
          Toronto:
            page(
              'University of Toronto',
              'MD',
              'Toronto',
              'ON',
            ),
          Massachussetts:
            page(
              'UMass Chan Medical School',
              'MD',
              'Worcester',
              'MA',
            ),
          'Texas A&amp;M':
            '',
          Orphan:
            page(
              'Orphan School',
              'MD',
              'Nowhere',
              'KS',
            ),
        } as Record<
          string,
          string
        >,
      overrides:
        {
          Massachussetts:
            {
              shortName:
                'Massachusetts',
            },
        },
    };
  base.titles[
    'Texas A&M'
  ] =
    page(
      'Texas A&amp;M University',
      'MD',
      'Bryan',
      'TX',
    );

  it('excludes canadian and first-row-less keys and keeps alias keys verbatim', () => {
    const r =
      buildRegistry(
        base,
      );
    expect(
      r.excluded,
    ).toEqual(
      expect.arrayContaining(
        [
          {
            key: 'Toronto',
            reason:
              'canadian',
          },
          {
            key: 'Orphan',
            reason:
              'no-first-row',
          },
        ],
      ),
    );
    expect(
      r.review,
    ).toEqual(
      [],
    );
    const mass =
      r.schools.find(
        (
          s,
        ) =>
          s.name.startsWith(
            'UMass',
          ),
      )!;
    expect(
      mass.shortName,
    ).toBe(
      'Massachusetts',
    );
    expect(
      mass.aliases,
    ).toEqual(
      [
        {
          source:
            'CYCLETRACK',
          sourceKey:
            'Massachussetts',
        },
      ],
    );
    const tam =
      r.schools.find(
        (
          s,
        ) =>
          s.name.startsWith(
            'Texas A&M',
          ),
      )!;
    expect(
      tam
        .aliases[0]!
        .sourceKey,
    ).toBe(
      'Texas A&M',
    );
    expect(
      tam.slug,
    ).toBe(
      'texas-a-m',
    );
  });

  it('excludes a key whose page has no usable title', () => {
    const r =
      buildRegistry(
        {
          schoolKeys:
            [
              'X',
            ],
          first:
            [
              row(
                'X',
                'MD',
              ),
            ],
          titles:
            {},
          overrides:
            {},
        },
      );
    expect(
      r.excluded,
    ).toEqual(
      [
        {
          key: 'X',
          reason:
            'no-title',
        },
      ],
    );
  });

  it('gives colliding slugs a state suffix', () => {
    const r =
      buildRegistry(
        {
          schoolKeys:
            [
              'Georgetown',
              'Georgetown ',
            ],
          first:
            [
              row(
                'Georgetown',
                'MD',
              ),
              row(
                'Georgetown ',
                'MD',
              ),
            ],
          titles:
            {
              Georgetown:
                page(
                  'A',
                  'MD',
                  'Washington',
                  'DC',
                ),
              'Georgetown ':
                page(
                  'B',
                  'MD',
                  'Austin',
                  'TX',
                ),
            },
          overrides:
            {
              'Georgetown ':
                {
                  shortName:
                    'Georgetown',
                },
            },
        },
      );
    const slugs =
      r.schools
        .map(
          (
            s,
          ) =>
            s.slug,
        )
        .sort();
    expect(
      new Set(
        slugs,
      )
        .size,
    ).toBe(
      2,
    );
    expect(
      slugs.some(
        (
          s,
        ) =>
          s.endsWith(
            '-dc',
          ) ||
          s.endsWith(
            '-tx',
          ),
      ),
    ).toBe(
      true,
    );
  });

  it('sends a degree conflict to review and settles it via override', () => {
    const input =
      {
        schoolKeys:
          [
            'Odd',
          ],
        first:
          [
            row(
              'Odd',
              'DO',
            ),
          ],
        titles:
          {
            Odd: page(
              'Odd College',
              'MD',
              'Town',
              'OH',
            ),
          },
        overrides:
          {},
      };
    const r =
      buildRegistry(
        input,
      );
    expect(
      r.review,
    ).toEqual(
      [
        'Odd',
      ],
    );
    expect(
      r.schools,
    ).toEqual(
      [],
    );
    const fixed =
      buildRegistry(
        {
          ...input,
          overrides:
            {
              Odd: {
                degree:
                  'DO',
              },
            },
        },
      );
    expect(
      fixed.review,
    ).toEqual(
      [],
    );
    expect(
      fixed
        .schools[0]!
        .degree,
    ).toBe(
      'DO',
    );
  });

  it('sends a missing location to review', () => {
    const r =
      buildRegistry(
        {
          schoolKeys:
            [
              'Nowhere',
            ],
          first:
            [
              row(
                'Nowhere',
                'MD',
              ),
            ],
          titles:
            {
              Nowhere:
                '<title>Nowhere MD Admissions Data | CycleTrack</title>',
            },
          overrides:
            {},
        },
      );
    expect(
      r.review,
    ).toEqual(
      [
        'Nowhere',
      ],
    );
  });
});

const file: RegistryFile =
  {
    generatedAt:
      '2026-11-20T00:00:00.000Z',
    schools:
      [
        {
          slug: 'yale',
          name: 'Yale School of Medicine',
          shortName:
            'Yale',
          degree:
            'MD',
          city: 'New Haven',
          state:
            'CT',
          country:
            'US',
          website:
            null,
          aliases:
            [
              {
                source:
                  'CYCLETRACK',
                sourceKey:
                  'Yale',
              },
            ],
        },
        {
          slug: 'texas-a-m',
          name: 'Texas A&M University',
          shortName:
            'Texas A&M',
          degree:
            'MD',
          city: 'Bryan',
          state:
            'TX',
          country:
            'US',
          website:
            null,
          aliases:
            [
              {
                source:
                  'CYCLETRACK',
                sourceKey:
                  'Texas A&M',
              },
            ],
        },
      ],
  };

describe('seedRegistryIfEmpty', () => {
  it('seeds once and is a no-op afterwards', async () => {
    const {
      prisma,
      tables,
    } =
      createFakePrisma();
    expect(
      await seedRegistryIfEmpty(
        prisma,
        file,
      ),
    ).toEqual(
      {
        schools: 2,
        aliases: 2,
      },
    );
    expect(
      await seedRegistryIfEmpty(
        prisma,
        file,
      ),
    ).toEqual(
      {
        schools: 0,
        aliases: 0,
      },
    );
    expect(
      tables.medSchool,
    ).toHaveLength(
      2,
    );
    expect(
      tables.medSchoolAlias,
    ).toHaveLength(
      2,
    );
  });

  it('never overwrites an admin-edited school and creates the rest', async () => {
    const {
      prisma,
      tables,
    } =
      createFakePrisma();
    await prisma.medSchool.upsert(
      {
        where:
          {
            slug: 'yale',
          },
        create:
          {
            slug: 'yale',
            name: 'Edited by admin',
          },
        update:
          {},
      },
    );
    expect(
      await seedRegistryIfEmpty(
        prisma,
        file,
      ),
    ).toEqual(
      {
        schools: 1,
        aliases: 2,
      },
    );
    const yale =
      tables.medSchool!.find(
        (
          r,
        ) =>
          (
            r as {
              slug: string;
            }
          )
            .slug ===
          'yale',
      ) as {
        name: string;
      };
    expect(
      yale.name,
    ).toBe(
      'Edited by admin',
    );
    expect(
      tables.medSchool,
    ).toHaveLength(
      2,
    );
    expect(
      tables.medSchoolAlias,
    ).toHaveLength(
      2,
    );
  });

  it('completes a partial registry left by an interrupted run', async () => {
    const {
      prisma,
      tables,
    } =
      createFakePrisma();
    const first =
      await prisma.medSchool.upsert(
        {
          where:
            {
              slug: 'yale',
            },
          create:
            {
              slug: 'yale',
              name: 'Yale School of Medicine',
            },
          update:
            {},
        },
      );
    await prisma.medSchoolAlias.upsert(
      {
        where:
          {
            source_sourceKey:
              {
                source:
                  'CYCLETRACK',
                sourceKey:
                  'Yale',
              },
          },
        create:
          {
            schoolId:
              first.id,
            source:
              'CYCLETRACK',
            sourceKey:
              'Yale',
          },
        update:
          {},
      },
    );
    expect(
      await seedRegistryIfEmpty(
        prisma,
        file,
      ),
    ).toEqual(
      {
        schools: 1,
        aliases: 1,
      },
    );
    expect(
      tables.medSchool,
    ).toHaveLength(
      2,
    );
    expect(
      tables.medSchoolAlias,
    ).toHaveLength(
      2,
    );
  });
});

describe('stable-key seeding', () => {
  const seedAlias =
    (
      prisma: ReturnType<
        typeof createFakePrisma
      >['prisma'],
      schoolId: string,
      source:
        | 'CYCLETRACK'
        | 'ADMIT',
      sourceKey: string,
    ) =>
      prisma.medSchoolAlias.upsert(
        {
          where:
            {
              source_sourceKey:
                {
                  source,
                  sourceKey,
                },
            },
          create:
            {
              schoolId,
              source,
              sourceKey,
            },
          update:
            {},
        },
      );

  it('a school whose slug an admin changed is not recreated (alias found by CYCLETRACK key)', async () => {
    const {
      prisma,
      tables,
    } =
      createFakePrisma();
    const renamed =
      await prisma.medSchool.upsert(
        {
          where:
            {
              slug: 'yale-renamed',
            },
          create:
            {
              slug: 'yale-renamed',
              name: 'Yale',
            },
          update:
            {},
        },
      );
    await seedAlias(
      prisma,
      renamed.id,
      'CYCLETRACK',
      'Yale',
    );
    expect(
      await seedRegistryIfEmpty(
        prisma,
        file,
      ),
    ).toEqual(
      {
        schools: 1,
        aliases: 1,
      },
    );
    expect(
      tables.medSchool,
    ).toHaveLength(
      2,
    );
    expect(
      tables.medSchool!.some(
        (
          r,
        ) =>
          (
            r as {
              slug: string;
            }
          )
            .slug ===
          'yale',
      ),
    ).toBe(
      false,
    );
  });

  it('no-alias school falls back to slug', async () => {
    const {
      prisma,
      tables,
    } =
      createFakePrisma();
    const bare =
      await prisma.medSchool.upsert(
        {
          where:
            {
              slug: 'yale',
            },
          create:
            {
              slug: 'yale',
              name: 'Yale',
            },
          update:
            {},
        },
      );
    await seedRegistryIfEmpty(
      prisma,
      file,
    );
    expect(
      tables.medSchool,
    ).toHaveLength(
      2,
    );
    const alias =
      tables.medSchoolAlias!.find(
        (
          r,
        ) =>
          (
            r as {
              sourceKey: string;
            }
          )
            .sourceKey ===
          'Yale',
      ) as {
        schoolId: string;
      };
    expect(
      alias.schoolId,
    ).toBe(
      bare.id,
    );
  });

  it('seedAdmitIgnoredMisses pre-ignores the unmapped slugs, is idempotent and never overwrites an existing miss', async () => {
    const {
      prisma,
      tables,
    } =
      createFakePrisma();
    const file =
      {
        generatedAt:
          '2026-11-20T00:00:00.000Z',
        ignoredSlugs:
          [
            'extra-campus-a',
            'extra-campus-b',
          ],
        aliases:
          [],
      };
    // An admin already mapped one of them: that row must stay exactly as it is.
    tables.medSchoolAliasMiss!.push(
      {
        id: 'm1',
        source:
          'ADMIT',
        sourceKey:
          'extra-campus-b',
        ignored: false,
        resolvedSchoolId:
          's9',
        seenCount: 4,
      },
    );
    expect(
      await seedAdmitIgnoredMisses(
        prisma,
        file,
      ),
    ).toBe(
      1,
    );
    expect(
      await seedAdmitIgnoredMisses(
        prisma,
        file,
      ),
    ).toBe(
      0,
    );
    const rows =
      tables.medSchoolAliasMiss as Array<
        Record<
          string,
          unknown
        >
      >;
    expect(
      rows,
    ).toHaveLength(
      2,
    );
    expect(
      rows.find(
        (
          r,
        ) =>
          r.sourceKey ===
          'extra-campus-a',
      ),
    ).toMatchObject(
      {
        source:
          'ADMIT',
        ignored: true,
      },
    );
    expect(
      rows.find(
        (
          r,
        ) =>
          r.sourceKey ===
          'extra-campus-b',
      ),
    ).toMatchObject(
      {
        ignored: false,
        resolvedSchoolId:
          's9',
        seenCount: 4,
      },
    );
  });

  it('seedAdmitAliases attaches by CYCLETRACK key, reports unmatched, never adds a second ADMIT alias, second call creates nothing', async () => {
    const {
      prisma,
      tables,
    } =
      createFakePrisma();
    await seedRegistryIfEmpty(
      prisma,
      file,
    );
    const admit =
      {
        generatedAt:
          '2026-11-20T00:00:00.000Z',
        aliases:
          [
            {
              cycletrackKey:
                'Yale',
              admitSlug:
                'yale-university',
            },
            {
              cycletrackKey:
                'Yale',
              admitSlug:
                'yale-second',
            },
            {
              cycletrackKey:
                'Texas A&M',
              admitSlug:
                'yale-university',
            },
            {
              cycletrackKey:
                'Nowhere',
              admitSlug:
                'nowhere-slug',
            },
          ],
      };
    expect(
      await seedAdmitAliases(
        prisma,
        admit,
      ),
    ).toEqual(
      {
        created: 1,
        unmatched:
          [
            'nowhere-slug',
          ],
        skipped:
          [
            {
              cycletrackKey:
                'Yale',
              admitSlug:
                'yale-second',
            },
            {
              cycletrackKey:
                'Texas A&M',
              admitSlug:
                'yale-university',
            },
          ],
      },
    );
    const admitRows =
      tables.medSchoolAlias!.filter(
        (
          r,
        ) =>
          (
            r as {
              source: string;
            }
          )
            .source ===
          'ADMIT',
      ) as Array<{
        sourceKey: string;
      }>;
    expect(
      admitRows.map(
        (
          r,
        ) =>
          r.sourceKey,
      ),
    ).toEqual(
      [
        'yale-university',
      ],
    );
    expect(
      await seedAdmitAliases(
        prisma,
        admit,
      ),
    ).toEqual(
      {
        created: 0,
        unmatched:
          [
            'nowhere-slug',
          ],
        skipped:
          [
            {
              cycletrackKey:
                'Yale',
              admitSlug:
                'yale-second',
            },
            {
              cycletrackKey:
                'Texas A&M',
              admitSlug:
                'yale-university',
            },
          ],
      },
    );
  });
});

describe('SDN alias seeding', () => {
  const sdn = (
    aliases: Array<{
      cycletrackKey: string;
      threadStems: string[];
      summary?: { code: string; slug: string };
    }>,
    ignoredStems: string[] = [],
  ) => ({ generatedAt: '2026-11-20T00:00:00.000Z', ignoredStems, aliases });
  const sdnKeys = (tables: ReturnType<typeof createFakePrisma>['tables']) =>
    (
      tables.medSchoolAlias as Array<{
        source: string;
        sourceKey: string;
        schoolId: string;
      }>
    )
      .filter((r) => r.source === 'SDN')
      .map((r) => r.sourceKey)
      .sort();

  it('creates thread-stem and summary aliases through the CYCLETRACK key, and a second call creates nothing', async () => {
    const { prisma, tables } = createFakePrisma();
    await seedRegistryIfEmpty(prisma, file);
    const data = sdn([
      {
        cycletrackKey: 'Yale',
        threadStems: ['Yale', 'Yale School of Medicine'],
        summary: { code: 'YALE', slug: 'yale-school-of-medicine' },
      },
      { cycletrackKey: 'Nowhere', threadStems: ['Nowhere U'] },
    ]);
    expect(await seedSdnAliases(prisma, data)).toEqual({
      created: 3,
      unmatched: ['Nowhere U'],
      skipped: [],
    });
    expect(sdnKeys(tables)).toEqual([
      'Yale',
      'Yale School of Medicine',
      'summary:YALE/yale-school-of-medicine',
    ]);
    expect(await seedSdnAliases(prisma, data)).toMatchObject({ created: 0 });
    expect(sdnKeys(tables)).toHaveLength(3);
  });

  it('an existing key owned by another school is skipped and reported, never moved', async () => {
    const { prisma, tables } = createFakePrisma();
    await seedRegistryIfEmpty(prisma, file);
    await seedSdnAliases(
      prisma,
      sdn([{ cycletrackKey: 'Yale', threadStems: ['Shared'] }]),
    );
    const owner = (
      tables.medSchoolAlias as Array<{ sourceKey: string; schoolId: string }>
    ).find((r) => r.sourceKey === 'Shared')!.schoolId;
    const res = await seedSdnAliases(
      prisma,
      sdn([{ cycletrackKey: 'Texas A&M', threadStems: ['Shared', 'Texas'] }]),
    );
    expect(res).toEqual({
      created: 1,
      unmatched: [],
      skipped: [{ cycletrackKey: 'Texas A&M', key: 'Shared' }],
    });
    expect(
      (
        tables.medSchoolAlias as Array<{ sourceKey: string; schoolId: string }>
      ).find((r) => r.sourceKey === 'Shared')!.schoolId,
    ).toBe(owner);
  });

  it('seedSdnIgnoredMisses pre-ignores and never touches an existing miss', async () => {
    const { prisma, tables } = createFakePrisma();
    tables.medSchoolAliasMiss!.push({
      id: 'm1',
      source: 'SDN',
      sourceKey: 'Seen',
      ignored: false,
      resolvedSchoolId: 's9',
      seenCount: 4,
    });
    const data = sdn([], ['Junk', 'Seen']);
    expect(await seedSdnIgnoredMisses(prisma, data)).toBe(1);
    expect(await seedSdnIgnoredMisses(prisma, data)).toBe(0);
    const rows = tables.medSchoolAliasMiss as Array<Record<string, unknown>>;
    expect(rows.find((r) => r.sourceKey === 'Junk')).toMatchObject({
      source: 'SDN',
      ignored: true,
      seenCount: 0,
    });
    expect(rows.find((r) => r.sourceKey === 'Seen')).toMatchObject({
      ignored: false,
      resolvedSchoolId: 's9',
      seenCount: 4,
    });
  });
});

describe('seedCycles', () => {
  const cycle =
    {
      cycleYear: 2027,
      amcasOpensOn:
        null,
      amcasSubmitOn:
        null,
      aacomasOpensOn:
        null,
      dayZeroOn:
        '2026-06-01',
      dateEstimated: true,
    };

  it('writes dayZeroOn as a date-only value and stays idempotent', async () => {
    const {
      prisma,
      tables,
    } =
      createFakePrisma();
    expect(
      await seedCycles(
        prisma,
        [
          cycle,
        ],
      ),
    ).toBe(
      1,
    );
    await seedCycles(
      prisma,
      [
        cycle,
      ],
    );
    expect(
      tables.medCycle,
    ).toHaveLength(
      1,
    );
    const stored =
      tables
        .medCycle![0] as {
        dayZeroOn: Date;
      };
    expect(
      stored.dayZeroOn.toISOString(),
    ).toBe(
      '2026-06-01T00:00:00.000Z',
    );
  });
});
