import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  describe,
  expect,
  it,
} from 'vitest';
import { recordAliasMiss } from '../scrape/run-support';
import { createFakePrisma } from '../scrape/test-support';
import {
  ignoreAliasMiss,
  listAliasMisses,
  mapAliasMiss,
} from './alias-admin.server';

type Fake =
  ReturnType<
    typeof createFakePrisma
  >;

async function seed(
  fake: Fake,
) {
  const p =
    fake.prisma;
  const a =
    await p.medSchool.upsert(
      {
        where:
          {
            slug: 'a',
          },
        create:
          {
            slug: 'a',
            name: 'Alpha',
            shortName:
              'A',
            degree:
              'MD',
            city: 'X',
            state:
              'NY',
            active: true,
          },
        update:
          {},
      },
    );
  const b =
    await p.medSchool.upsert(
      {
        where:
          {
            slug: 'b',
          },
        create:
          {
            slug: 'b',
            name: 'Beta',
            shortName:
              'B',
            degree:
              'DO',
            city: 'Y',
            state:
              'CA',
            active: true,
          },
        update:
          {},
      },
    );
  const miss =
    (
      source: string,
      sourceKey: string,
      seenCount = 1,
    ) =>
      p.medSchoolAliasMiss.upsert(
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
              source,
              sourceKey,
              seenCount,
              firstSeenAt:
                new Date(
                  0,
                ),
              lastSeenAt:
                new Date(
                  1,
                ),
              resolvedSchoolId:
                null,
              ignored: false,
            },
          update:
            {},
        },
      );
  return {
    a,
    b,
    miss,
  };
}

const missRow =
  (
    fake: Fake,
    id: string,
  ) =>
    (
      fake
        .tables
        .medSchoolAliasMiss as Array<
        Record<
          string,
          unknown
        >
      >
    ).find(
      (
        r,
      ) =>
        r.id ===
        id,
    )!;

describe('alias-admin', () => {
  it('lists unresolved non-ignored misses by seenCount desc', async () => {
    const fake =
      createFakePrisma();
    const {
      a,
      miss,
    } =
      await seed(
        fake,
      );
    await miss(
      'SDN',
      'low',
      1,
    );
    await miss(
      'SDN',
      'high',
      9,
    );
    const done =
      await miss(
        'SDN',
        'done',
        20,
      );
    const ign =
      await miss(
        'SDN',
        'ign',
        30,
      );
    await fake.prisma.medSchoolAliasMiss.update(
      {
        where:
          {
            id: done.id,
          },
        data: {
          resolvedSchoolId:
            a.id,
        },
      },
    );
    await fake.prisma.medSchoolAliasMiss.update(
      {
        where:
          {
            id: ign.id,
          },
        data: {
          ignored: true,
        },
      },
    );
    const out =
      await listAliasMisses(
        fake.prisma,
      );
    expect(
      out.misses.map(
        (
          m,
        ) =>
          m.sourceKey,
      ),
    ).toEqual(
      [
        'high',
        'low',
      ],
    );
    expect(
      out.schools.map(
        (
          s,
        ) =>
          s.name,
      ),
    ).toEqual(
      [
        'Alpha',
        'Beta',
      ],
    );
    expect(
      typeof out
        .misses[0]!
        .firstSeenAt,
    ).toBe(
      'string',
    );
  });

  it('maps a miss: alias created and resolvedSchoolId set; re-map is idempotent', async () => {
    const fake =
      createFakePrisma();
    const {
      a,
      miss,
    } =
      await seed(
        fake,
      );
    const m =
      await miss(
        'CYCLETRACK',
        'alpha',
      );
    const r =
      await mapAliasMiss(
        fake.prisma,
        {
          missId:
            m.id,
          schoolId:
            a.id,
        },
      );
    expect(
      r.ok,
    ).toBe(
      true,
    );
    expect(
      fake
        .tables
        .medSchoolAlias,
    ).toHaveLength(
      1,
    );
    expect(
      missRow(
        fake,
        m.id,
      )
        .resolvedSchoolId,
    ).toBe(
      a.id,
    );
    const again =
      await mapAliasMiss(
        fake.prisma,
        {
          missId:
            m.id,
          schoolId:
            a.id,
        },
      );
    expect(
      again,
    ).toEqual(
      r,
    );
    expect(
      fake
        .tables
        .medSchoolAlias,
    ).toHaveLength(
      1,
    );
  });

  it('second CYCLETRACK key for a school with one → 409 SCHOOL_ALREADY_HAS_KEY and nothing written', async () => {
    const fake =
      createFakePrisma();
    const {
      a,
      miss,
    } =
      await seed(
        fake,
      );
    await fake.prisma.medSchoolAlias.create(
      {
        data: {
          schoolId:
            a.id,
          source:
            'CYCLETRACK',
          sourceKey:
            'one',
        },
      },
    );
    const m =
      await miss(
        'CYCLETRACK',
        'two',
      );
    const r =
      await mapAliasMiss(
        fake.prisma,
        {
          missId:
            m.id,
          schoolId:
            a.id,
        },
      );
    expect(
      r,
    ).toMatchObject(
      {
        ok: false,
        status: 409,
        code: 'SCHOOL_ALREADY_HAS_KEY',
      },
    );
    expect(
      fake
        .tables
        .medSchoolAlias,
    ).toHaveLength(
      1,
    );
    expect(
      missRow(
        fake,
        m.id,
      )
        .resolvedSchoolId,
    ).toBeNull();
  });

  it('an SDN miss recorded by recordAliasMiss is listed and mapped; a second SDN key is accepted; the same key for another school is KEY_MAPPED_ELSEWHERE', async () => {
    const fake = createFakePrisma();
    const { a, b } = await seed(fake);
    const now = () => new Date(5);
    await recordAliasMiss(fake.prisma, 'SDN', 'Alpha Med', now);
    await recordAliasMiss(fake.prisma, 'SDN', 'Alpha Medical School', now);
    const listed = (await listAliasMisses(fake.prisma)).misses;
    expect(listed.map((m) => [m.source, m.sourceKey]).sort()).toEqual([
      ['SDN', 'Alpha Med'],
      ['SDN', 'Alpha Medical School'],
    ]);
    const [first, second] = ['Alpha Med', 'Alpha Medical School'].map(
      (k) => listed.find((m) => m.sourceKey === k)!,
    );
    expect(
      await mapAliasMiss(fake.prisma, { missId: first!.id, schoolId: a.id }),
    ).toMatchObject({ ok: true });
    expect(
      await mapAliasMiss(fake.prisma, { missId: second!.id, schoolId: a.id }),
    ).toMatchObject({ ok: true });
    expect(
      (
        fake.tables.medSchoolAlias as Array<{
          source: string;
          schoolId: string;
        }>
      ).filter((r) => r.source === 'SDN' && r.schoolId === a.id),
    ).toHaveLength(2);
    await recordAliasMiss(fake.prisma, 'SDN', 'Alpha Med', now);
    const again = (await listAliasMisses(fake.prisma)).misses;
    expect(again).toHaveLength(0);
    // The same key offered for another school after being mapped is refused.
    const row = (
      fake.tables.medSchoolAliasMiss as Array<Record<string, unknown>>
    ).find((r) => r.sourceKey === 'Alpha Med')!;
    expect(
      await mapAliasMiss(fake.prisma, {
        missId: row.id as string,
        schoolId: b.id,
      }),
    ).toMatchObject({ ok: false, status: 409, code: 'KEY_MAPPED_ELSEWHERE' });
  });

  it('second ADMIT key → 409; second SDN key → ok', async () => {
    const fake =
      createFakePrisma();
    const {
      a,
      miss,
    } =
      await seed(
        fake,
      );
    await fake.prisma.medSchoolAlias.create(
      {
        data: {
          schoolId:
            a.id,
          source:
            'ADMIT',
          sourceKey:
            'one',
        },
      },
    );
    await fake.prisma.medSchoolAlias.create(
      {
        data: {
          schoolId:
            a.id,
          source:
            'SDN',
          sourceKey:
            'one',
        },
      },
    );
    const admit =
      await miss(
        'ADMIT',
        'two',
      );
    const sdn =
      await miss(
        'SDN',
        'two',
      );
    expect(
      await mapAliasMiss(
        fake.prisma,
        {
          missId:
            admit.id,
          schoolId:
            a.id,
        },
      ),
    ).toMatchObject(
      {
        ok: false,
        status: 409,
      },
    );
    expect(
      await mapAliasMiss(
        fake.prisma,
        {
          missId:
            sdn.id,
          schoolId:
            a.id,
        },
      ),
    ).toMatchObject(
      {
        ok: true,
      },
    );
  });

  it('mapping to an inactive school → 409 SCHOOL_INACTIVE and nothing written', async () => {
    const fake =
      createFakePrisma();
    const {
      a,
      miss,
    } =
      await seed(
        fake,
      );
    (fake.tables.medSchool as Array<{ id: string; active: boolean }>).find((r) => r.id === a.id)!.active = false;
    const m =
      await miss(
        'ADMIT',
        'some-slug',
      );
    const r =
      await mapAliasMiss(
        fake.prisma,
        {
          missId:
            m.id,
          schoolId:
            a.id,
        },
      );
    expect(
      r,
    ).toMatchObject(
      {
        ok: false,
        status: 409,
        code: 'SCHOOL_INACTIVE',
      },
    );
    expect(
      fake
        .tables
        .medSchoolAlias ??
        [],
    ).toHaveLength(
      0,
    );
    expect(
      missRow(
        fake,
        m.id,
      )
        .resolvedSchoolId,
    ).toBeNull();
  });

  it('key already owned by another school → 409 KEY_MAPPED_ELSEWHERE, alias not moved', async () => {
    const fake =
      createFakePrisma();
    const {
      a,
      b,
      miss,
    } =
      await seed(
        fake,
      );
    await fake.prisma.medSchoolAlias.create(
      {
        data: {
          schoolId:
            b.id,
          source:
            'SDN',
          sourceKey:
            'shared',
        },
      },
    );
    const m =
      await miss(
        'SDN',
        'shared',
      );
    const r =
      await mapAliasMiss(
        fake.prisma,
        {
          missId:
            m.id,
          schoolId:
            a.id,
        },
      );
    expect(
      r,
    ).toMatchObject(
      {
        ok: false,
        status: 409,
        code: 'KEY_MAPPED_ELSEWHERE',
      },
    );
    expect(
      (
        fake
          .tables
          .medSchoolAlias as Array<{
          schoolId: string;
        }>
      )[0]!
        .schoolId,
    ).toBe(
      b.id,
    );
    expect(
      missRow(
        fake,
        m.id,
      )
        .resolvedSchoolId,
    ).toBeNull();
  });

  it('maps a serialization failure to 409 CONFLICT_RETRY', async () => {
    const fake =
      createFakePrisma();
    const {
      a,
      miss,
    } =
      await seed(
        fake,
      );
    const m =
      await miss(
        'CYCLETRACK',
        'racer',
      );
    for (const code of [
      'P2034',
      '40001',
    ]) {
      const prisma =
        {
          ...fake.prisma,
          $transaction:
            async () => {
              throw Object.assign(
                new Error(
                  'could not serialize',
                ),
                {
                  code,
                },
              );
            },
        } as unknown as typeof fake.prisma;
      expect(
        await mapAliasMiss(
          prisma,
          {
            missId:
              m.id,
            schoolId:
              a.id,
          },
        ),
      ).toMatchObject(
        {
          ok: false,
          status: 409,
          code: 'CONFLICT_RETRY',
        },
      );
    }
  });

  it('runs serializable, and a lost key race retries into an idempotent success', async () => {
    const fake =
      createFakePrisma();
    const {
      a,
      miss,
    } =
      await seed(
        fake,
      );
    const m =
      await miss(
        'SDN',
        'race',
      );
    const seen: unknown[] =
      [];
    let calls = 0;
    const prisma =
      {
        ...fake.prisma,
        $transaction:
          async (
            fn: never,
            opts: unknown,
          ) => {
            seen.push(
              opts,
            );
            if (
              ++calls ===
              1
            ) {
              // the other admin's request lands the same alias first
              await fake.prisma.medSchoolAlias.create(
                {
                  data: {
                    schoolId:
                      a.id,
                    source:
                      'SDN',
                    sourceKey:
                      'race',
                  },
                },
              );
              throw Object.assign(
                new Error(
                  'x',
                ),
                {
                  code: 'P2002',
                },
              );
            }
            return fake.prisma.$transaction(
              fn,
              opts as never,
            );
          },
      } as unknown as typeof fake.prisma;
    const r =
      await mapAliasMiss(
        prisma,
        {
          missId:
            m.id,
          schoolId:
            a.id,
        },
      );
    expect(
      r,
    ).toMatchObject(
      {
        ok: true,
      },
    );
    expect(
      seen,
    ).toEqual(
      [
        {
          isolationLevel:
            'Serializable',
        },
        {
          isolationLevel:
            'Serializable',
        },
      ],
    );
    expect(
      fake
        .tables
        .medSchoolAlias,
    ).toHaveLength(
      1,
    );
  });

  it('a repeated unique violation is 409 ALREADY_MAPPED', async () => {
    const fake =
      createFakePrisma();
    const {
      a,
      miss,
    } =
      await seed(
        fake,
      );
    const m =
      await miss(
        'SDN',
        'again',
      );
    const prisma =
      {
        ...fake.prisma,
        $transaction:
          async () => {
            throw Object.assign(
              new Error(
                'x',
              ),
              {
                code: 'P2002',
              },
            );
          },
      } as unknown as typeof fake.prisma;
    expect(
      await mapAliasMiss(
        prisma,
        {
          missId:
            m.id,
          schoolId:
            a.id,
        },
      ),
    ).toMatchObject(
      {
        ok: false,
        status: 409,
        code: 'ALREADY_MAPPED',
      },
    );
  });

  it('rolls the alias back when resolving the miss fails (one transaction)', async () => {
    const fake =
      createFakePrisma();
    const {
      a,
      miss,
    } =
      await seed(
        fake,
      );
    const m =
      await miss(
        'SDN',
        'atomic',
      );
    const real =
      fake
        .prisma
        .medSchoolAliasMiss
        .update;
    fake.prisma.medSchoolAliasMiss.update =
      async () => {
        throw new Error(
          'db down',
        );
      };
    await expect(
      mapAliasMiss(
        fake.prisma,
        {
          missId:
            m.id,
          schoolId:
            a.id,
        },
      ),
    ).rejects.toThrow(
      'db down',
    );
    fake.prisma.medSchoolAliasMiss.update =
      real;
    expect(
      fake
        .tables
        .medSchoolAlias ??
        [],
    ).toHaveLength(
      0,
    );
  });

  it('mapping an ignored miss clears ignored', async () => {
    const fake =
      createFakePrisma();
    const {
      a,
      miss,
    } =
      await seed(
        fake,
      );
    const m =
      await miss(
        'SDN',
        'was-ignored',
      );
    await ignoreAliasMiss(
      fake.prisma,
      m.id,
    );
    expect(
      await mapAliasMiss(
        fake.prisma,
        {
          missId:
            m.id,
          schoolId:
            a.id,
        },
      ),
    ).toMatchObject(
      {
        ok: true,
      },
    );
    expect(
      missRow(
        fake,
        m.id,
      ),
    ).toMatchObject(
      {
        ignored: false,
        resolvedSchoolId:
          a.id,
      },
    );
  });

  it('unknown miss or school → 404', async () => {
    const fake =
      createFakePrisma();
    const {
      a,
      miss,
    } =
      await seed(
        fake,
      );
    const m =
      await miss(
        'SDN',
        'x',
      );
    expect(
      await mapAliasMiss(
        fake.prisma,
        {
          missId:
            'nope',
          schoolId:
            a.id,
        },
      ),
    ).toMatchObject(
      {
        ok: false,
        status: 404,
      },
    );
    expect(
      await mapAliasMiss(
        fake.prisma,
        {
          missId:
            m.id,
          schoolId:
            'nope',
        },
      ),
    ).toMatchObject(
      {
        ok: false,
        status: 404,
      },
    );
    expect(
      await ignoreAliasMiss(
        fake.prisma,
        'nope',
      ),
    ).toMatchObject(
      {
        ok: false,
        status: 404,
      },
    );
  });

  it('ignore sets ignored and the miss leaves the list', async () => {
    const fake =
      createFakePrisma();
    const {
      miss,
    } =
      await seed(
        fake,
      );
    const m =
      await miss(
        'SDN',
        'junk',
      );
    expect(
      await ignoreAliasMiss(
        fake.prisma,
        m.id,
      ),
    ).toEqual(
      {
        ok: true,
      },
    );
    expect(
      missRow(
        fake,
        m.id,
      )
        .ignored,
    ).toBe(
      true,
    );
    expect(
      (
        await listAliasMisses(
          fake.prisma,
        )
      )
        .misses,
    ).toHaveLength(
      0,
    );
  });
});

const src =
  (
    f: string,
  ) =>
    readFileSync(
      join(
        __dirname,
        f,
      ),
      'utf8',
    ).replace(
      /\s+/g,
      '',
    );

describe('route modules', () => {
  const files =
    [
      'admin.medschools.alias-misses.server.ts',
      'admin.medschools.alias-misses.map.server.ts',
      'admin.medschools.alias-misses.ignore.server.ts',
    ];
  it("declare auth: 'admin' (anon 401 / non-admin 403 come from the wrapper); writes are rate-limited and validated", () => {
    for (const f of files)
      expect(
        src(
          f,
        ),
        f,
      ).toContain(
        "auth:'admin'",
      );
    for (const f of files.slice(
      1,
    )) {
      expect(
        src(
          f,
        ),
        f,
      ).toContain(
        "rateLimit:'write'",
      );
      expect(
        src(
          f,
        ),
        f,
      ).toContain(
        'body:z.object',
      );
    }
  });
  it('registrations use the contract paths', () => {
    const paths: Record<
      string,
      string
    > =
      {
        'admin.medschools.alias-misses.server.ts':
          '/api/admin/medschools/alias-misses',
        'admin.medschools.alias-misses.map.server.ts':
          '/api/admin/medschools/alias-misses/map',
        'admin.medschools.alias-misses.ignore.server.ts':
          '/api/admin/medschools/alias-misses/ignore',
      };
    for (const [
      f,
      p,
    ] of Object.entries(
      paths,
    ))
      expect(
        src(
          f,
        ),
        f,
      ).toContain(
        `apiRoute('${p}'`,
      );
  });
});
