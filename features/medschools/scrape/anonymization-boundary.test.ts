import {
  describe,
  expect,
  it,
} from 'vitest';
import { schoolUrl } from './adapters/cycletrack';
import { runCycletrack } from './run-cycletrack';
import {
  assertNoLeak,
  CYCLETRACK_NEEDLES,
  createFakeHost,
  createFakePrisma,
  loadFixture,
} from './test-support';

const NEEDLES = CYCLETRACK_NEEDLES;
const CREATED_KEYS =
  [
    'contributors',
    'count',
    'cycleYear',
    'date',
    'eventType',
    'program',
    'schoolId',
    'source',
  ];
const log =
  {
    info() {},
    warn() {},
    error() {},
  };

/** Plant person data in a comment, an attribute, a cell title and a JSON-LD block. */
function hostile(
  html: string,
): string {
  const inject = `${NEEDLES[0]} ${NEEDLES[1]} ${NEEDLES[2]} ${NEEDLES[3]}`;
  let out =
    html.replace(
      '<td>',
      `<td title="${inject}">`,
    );
  out =
    out.replace(
      '<tr',
      `<tr data-user="${inject}"`,
    );
  out =
    out.replace(
      '</body>',
      `<!-- ${inject} --><script type="application/ld+json">${JSON.stringify(
        {
          author:
            {
              name: NEEDLES[0],
              image:
                NEEDLES[2],
              identifier:
                NEEDLES[3],
              alt: NEEDLES[1],
            },
        },
      )}</script></body>`,
    );
  return out;
}

const FIXTURES =
  [
    {
      key: 'Yale',
      file: 'yale.html',
    },
    {
      key: 'Alabama COM',
      file: 'alabama-com.html',
    },
    {
      key: 'A.T. Still - Arizona',
      file: 'atsu-arizona.html',
    },
    {
      key: 'Toronto',
      file: 'toronto.html',
    },
  ];

function walk(
  v: unknown,
  visit: (
    s: string,
  ) => void,
): void {
  if (
    typeof v ===
    'string'
  )
    visit(
      v,
    );
  else if (
    Array.isArray(
      v,
    )
  )
    v.forEach(
      (
        x,
      ) =>
        walk(
          x,
          visit,
        ),
    );
  else if (
    v &&
    typeof v ===
      'object' &&
    !(
      v instanceof
      Date
    )
  )
    Object.values(
      v,
    ).forEach(
      (
        x,
      ) =>
        walk(
          x,
          visit,
        ),
    );
}

describe('anonymization boundary', () => {
  it('the hostile copy really carries the planted strings', () => {
    const html =
      hostile(
        loadFixture(
          'yale.html',
        ),
      );
    for (const n of NEEDLES)
      expect(
        html,
      ).toContain(
        n,
      );
  });

  it('no person data or page markup reaches any write, for every fixture', async () => {
    const {
      prisma,
      writes,
      tables,
    } =
      createFakePrisma();
    const routes: Record<
      string,
      | string
      | null
    > =
      {
        '/explorer/first':
          hostile(
            loadFixture(
              'first.html',
            ),
          ),
      };
    FIXTURES.forEach(
      (
        f,
        i,
      ) => {
        tables.medSchool!.push(
          {
            id: `s${i}`,
            slug: `s${i}`,
            name: f.key,
            active: true,
          },
        );
        tables.medSchoolAlias!.push(
          {
            id: `a${i}`,
            schoolId: `s${i}`,
            source:
              'CYCLETRACK',
            sourceKey:
              f.key,
          },
        );
        routes[
          schoolUrl(
            f.key,
          )
        ] =
          hostile(
            loadFixture(
              f.file,
            ),
          );
      },
    );
    const {
      host,
    } =
      createFakeHost(
        routes,
      );
    const r =
      await runCycletrack(
        {
          prisma,
          host,
          shouldStop:
            () =>
              false,
          log,
        },
        {
          trigger:
            'MANUAL',
        },
      );
    expect(
      r.status,
    ).toBe(
      'OK',
    );
    expect(
      r.created,
    ).toBeGreaterThan(
      0,
    );

    assertNoLeak(
      writes,
      [
        ...NEEDLES,
        'csrf',
        '<html',
      ],
    );

    // Created rows carry exactly the anonymous count columns.
    const createMany =
      writes.filter(
        (
          w,
        ): w is {
          data: Array<
            Record<
              string,
              unknown
            >
          >;
        } =>
          typeof w ===
            'object' &&
          w !==
            null &&
          Array.isArray(
            (
              w as {
                data?: unknown;
              }
            )
              .data,
          ),
      );
    expect(
      createMany.length,
    ).toBeGreaterThan(
      0,
    );
    for (const w of createMany)
      for (const row of w.data)
        expect(
          Object.keys(
            row,
          ).sort(),
        ).toEqual(
          CREATED_KEYS,
        );

    // Run stats are counters, never page bodies.
    for (const run of tables.medSourceRun as Array<{
      stats?: unknown;
    }>)
      walk(
        run.stats,
        (
          s,
        ) =>
          expect(
            s.length,
          ).toBeLessThanOrEqual(
            200,
          ),
      );
    for (const w of writes as Array<{
      data?: {
        stats?: unknown;
      };
    }>)
      walk(
        w
          .data
          ?.stats,
        (
          s,
        ) =>
          expect(
            s.length,
          ).toBeLessThanOrEqual(
            200,
          ),
      );
  });

  it('negative control: the guard throws when a needle is present', () => {
    expect(
      () =>
        assertNoLeak(
          [
            {
              x: 'drsmith42',
            },
          ],
          [
            'drsmith42',
          ],
        ),
    ).toThrow(
      /drsmith42/,
    );
  });
});
