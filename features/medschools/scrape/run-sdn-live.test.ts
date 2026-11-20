import {
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { parseThreadTitle } from '../engine/sdn-title';
import {
  NEEDLES,
  assertNoLeak,
  createFakeHost,
  createFakePrisma,
} from './test-support';
import {
  runSdnLive,
  sdnBackfillOwed,
  type SdnForumsFile,
  type SdnLiveDeps,
} from './run-sdn-live';
import type { SdnAi } from './sdn/extract';

const SECRET =
  'unit-test-secret-0123456789';
const NOW =
  new Date(
    '2026-11-20T18:00:00.000Z',
  );
const FORUMS: SdnForumsFile =
  {
    generatedAt:
      NOW.toISOString(),
    current:
      [
        {
          node: 1198,
          slug: 'md',
          degree:
            'MD',
          cycleYear: 2027,
        },
        {
          node: 1199,
          slug: 'do',
          degree:
            'DO',
          cycleYear: 2027,
        },
      ],
    archive:
      [],
  };

interface T {
  id: number;
  name: string;
  slug: string;
  replies: number;
}
const title =
  (
    name: string,
    label = '2026-2027',
  ) =>
    `${label} ${name}`;
const stemOf =
  (
    name: string,
  ) =>
    parseThreadTitle(
      title(
        name,
      ),
    )!
      .stem;

const rss =
  (
    items: T[],
    label = '2026-2027',
  ) =>
    `<?xml version="1.0"?><rss><channel><title>x</title>${items
      .map(
        (
          t,
        ) =>
          `<item><title>${title(t.name, label)}</title><pubDate>Fri, 20 Nov 2026 15:35:39 +0000</pubDate><link>https://forums.studentdoctor.net/threads/${t.slug}.${t.id}/</link><slash:comments>${t.replies}</slash:comments></item>`,
      )
      .join(
        '',
      )}</channel></rss>`;

const listing =
  (
    items: T[],
    next = false,
  ) =>
    `<html><head>${next ? '<link rel="next" href="x">' : ''}</head><body>${items.length === 0 ? 'There are no threads' : ''}${items
      .map(
        (
          t,
        ) =>
          `<div class="structItem structItem--thread"><div class="structItem-cell--main"><div class="structItem-title"><a data-tp-primary href="/threads/${t.slug}.${t.id}/">${title(t.name)}</a></div></div><div class="structItem-cell structItem-cell--meta"><dl class="pairs pairs--justified"><dt>Replies</dt><dd>${t.replies}</dd></dl></div><div class="structItem-cell--latest"><time class="structItem-latestDate" datetime="2026-11-20T10:00:00-0500"></time></div></div>`,
      )
      .join(
        '',
      )}</body></html>`;

const post =
  (
    id: number,
  ) =>
    `<article class="message message--post" data-author="authorzz${id}" data-content="post-${id}" id="js-post-${id}"><header class="message-attribution"><ul class="message-attribution-main"><li><time class="u-dt" datetime="2026-11-20T10:00:00-0500" data-timestamp="1795186800"></time></li></ul></header><div class="bbWrapper">I got an interview invite today</div></article>`;
const threadPage =
  (
    ids: number[],
    lastPage: number,
  ) =>
    `<html><body><ul>${Array.from(
      {
        length:
          lastPage,
      },
      (
        _,
        i,
      ) =>
        `<li class="pageNav-page"><a>${i + 1}</a></li>`,
    ).join(
      '',
    )}</ul>${ids.map(post).join('')}</body></html>`;

const CHALLENGE =
  '<html><head><title>Just a moment...</title></head></html>';

const answer =
  (
    user: string,
  ): string => {
    const reqs =
      JSON.parse(
        user.slice(
          user.indexOf(
            '[',
          ),
          user.lastIndexOf(
            ']',
          ) +
            1,
        ),
      ) as Array<{
        ref: number;
      }>;
    return JSON.stringify(
      {
        posts:
          reqs.map(
            (
              r,
            ) => ({
              postRef:
                r.ref,
              events:
                [
                  {
                    type: 'INTERVIEW',
                    date: '2026-11-18',
                  },
                ],
              questions:
                [],
            }),
          ),
      },
    );
  };

const A: T =
  {
    id: 101,
    name: 'Harvard Medical School',
    slug: 'harvard',
    replies: 2,
  };
const B: T =
  {
    id: 102,
    name: 'Yale School of Medicine',
    slug: 'yale',
    replies: 1,
  };

function setup(
  routes: Record<
    string,
    | string
    | null
  >,
  over: Partial<SdnLiveDeps> & {
    configured?: boolean;
    allow?: boolean;
  } = {},
) {
  const fake =
    createFakePrisma();
  fake.tables.medSchool!.push(
    {
      id: 's1',
      slug: 'harvard',
      active: true,
      degree:
        'MD',
    },
    {
      id: 's2',
      slug: 'yale',
      active: true,
      degree:
        'MD',
    },
    {
      id: 's3',
      slug: 'do-school',
      active: true,
      degree:
        'DO',
    },
    {
      id: 's4',
      slug: 'closed',
      active: false,
      degree:
        'MD',
    },
  );
  fake.tables.medSchoolAlias!.push(
    {
      id: 'a1',
      schoolId:
        's1',
      source:
        'SDN',
      sourceKey:
        stemOf(
          A.name,
        ),
    },
    {
      id: 'a2',
      schoolId:
        's2',
      source:
        'SDN',
      sourceKey:
        stemOf(
          B.name,
        ),
    },
    {
      id: 'a3',
      schoolId:
        's3',
      source:
        'SDN',
      sourceKey:
        stemOf(
          'Some DO School',
        ),
    },
    {
      id: 'a4',
      schoolId:
        's4',
      source:
        'SDN',
      sourceKey:
        stemOf(
          'Closed School',
        ),
    },
  );
  const live =
    {
      routes,
    };
  const fh =
    createFakeHost(
      (
        p,
      ) =>
        live
          .routes[
          p
        ] ??
        null,
    );
  const logs: string[] =
    [];
  const log =
    {
      info: (
        l: string,
      ) =>
        logs.push(
          l,
        ),
      warn: (
        l: string,
      ) =>
        logs.push(
          l,
        ),
      error:
        (
          l: string,
        ) =>
          logs.push(
            l,
          ),
    };
  const clock =
    {
      t: NOW,
    };
  const calls =
    {
      n: 0,
    };
  const flags =
    {
      configured:
        over.configured ??
        true,
      allow:
        over.allow ??
        true,
    };
  const ai: SdnAi =
    {
      configured:
        () =>
          flags.configured,
      run: async (
        _s,
        user,
      ) => {
        calls.n++;
        return answer(
          user,
        );
      },
    };
  const run =
    () =>
      runSdnLive(
        {
          prisma:
            fake.prisma,
          host: fh.host,
          ai,
          budget:
            {
              allow:
                async () =>
                  flags.allow,
            },
          secret:
            SECRET,
          forums:
            FORUMS,
          shouldStop:
            () =>
              false,
          log,
          now: () =>
            clock.t,
          ...over,
        },
        {
          trigger:
            'MANUAL',
        },
      );
  const tables =
    fake.tables as Record<
      string,
      Array<
        Record<
          string,
          unknown
        >
      >
    >;
  return {
    ...fake,
    tables,
    ...fh,
    live,
    logs,
    calls,
    flags,
    clock,
    run,
  };
}

const feedRoutes =
  (
    md: T[],
    doItems: T[] = [],
  ) => ({
    '/forums/1198/index.rss':
      rss(
        md,
      ),
    '/forums/1199/index.rss':
      rss(
        doItems,
      ),
    '/forums/1198/':
      listing(
        md,
      ),
    '/forums/1199/':
      listing(
        doItems,
      ),
    [`/threads/${A.slug}.${A.id}/`]:
      threadPage(
        [
          1,
          2,
        ],
        1,
      ),
    [`/threads/${B.slug}.${B.id}/`]:
      threadPage(
        [
          3,
        ],
        1,
      ),
  });

describe('runSdnLive', () => {
  it('first run discovers, polls both feeds, creates thread rows and processes them', async () => {
    const s =
      setup(
        feedRoutes(
          [
            A,
            B,
          ],
        ),
      );
    const r =
      await s.run();
    expect(
      r.status,
    ).toBe(
      'OK',
    );
    expect(
      r.feedsPolled,
    ).toBe(
      2,
    );
    expect(
      r.threadsKnown,
    ).toBe(
      2,
    );
    expect(
      r.discovered,
    ).toBe(
      true,
    );
    expect(
      r.processed,
    ).toBe(
      2,
    );
    expect(
      r.eventsCreated,
    ).toBe(
      3,
    );
    expect(
      s.requested,
    ).toContain(
      '/forums/1198/',
    );
    expect(
      s.tables.medSdnThread!.every(
        (
          t,
        ) =>
          t.repliesDone ===
          t.repliesSeen,
      ),
    ).toBe(
      true,
    );
    expect(
      s
        .tables
        .medCycleCount!
        .length,
    ).toBeGreaterThan(
      0,
    );
  });

  it('a second identical run makes no thread request and writes only its run row', async () => {
    const s =
      setup(
        feedRoutes(
          [
            A,
            B,
          ],
        ),
      );
    await s.run();
    const before =
      s
        .writes
        .length;
    s.requested.length = 0;
    const r =
      await s.run();
    expect(
      r.status,
    ).toBe(
      'OK',
    );
    expect(
      s.requested.filter(
        (
          p,
        ) =>
          p.startsWith(
            '/threads/',
          ),
      ),
    ).toEqual(
      [],
    );
    expect(
      s.requested.filter(
        (
          p,
        ) =>
          p.endsWith(
            '/',
          ),
      ),
    ).toEqual(
      [],
    ); // discovery is daily
    expect(
      s
        .writes
        .length -
        before,
    ).toBe(
      2,
    ); // run create + update
    expect(
      s
        .calls
        .n,
    ).toBe(
      2,
    );
  });

  it('a thread whose count grew is fetched only from its cursor page', async () => {
    const s =
      setup(
        feedRoutes(
          [
            {
              ...A,
              replies: 2,
            },
          ],
        ),
      );
    s.live.routes[
      `/threads/${A.slug}.${A.id}/`
    ] =
      threadPage(
        [
          1,
          2,
        ],
        2,
      );
    s.live.routes[
      `/threads/${A.slug}.${A.id}/page-2`
    ] =
      threadPage(
        [
          3,
        ],
        2,
      );
    await s.run();
    s.live.routes[
      '/forums/1198/index.rss'
    ] =
      rss(
        [
          {
            ...A,
            replies: 3,
          },
        ],
      );
    s.live.routes[
      `/threads/${A.slug}.${A.id}/page-2`
    ] =
      threadPage(
        [
          3,
          4,
        ],
        2,
      );
    s.requested.length = 0;
    const r =
      await s.run();
    expect(
      r.threadsChanged,
    ).toBe(
      1,
    );
    expect(
      s.requested.filter(
        (
          p,
        ) =>
          p.startsWith(
            '/threads/',
          ),
      ),
    ).toEqual(
      [
        `/threads/${A.slug}.${A.id}/page-2`,
      ],
    );
    expect(
      r.eventsCreated,
    ).toBe(
      1,
    );
  });

  it('unknown stem is recorded once per run; an ignored miss adds no count; DO school in the MD forum is a mismatch', async () => {
    const X: T =
      {
        id: 201,
        name: 'Nowhere University',
        slug: 'nowhere',
        replies: 1,
      };
    const X2: T =
      {
        ...X,
        id: 202,
        slug: 'nowhere-2',
      };
    const D: T =
      {
        id: 203,
        name: 'Some DO School',
        slug: 'do',
        replies: 1,
      };
    const s =
      setup(
        feedRoutes(
          [
            X,
            X2,
            D,
          ],
        ),
        {
          configured: false,
        } as never,
      );
    const r =
      await s.run();
    expect(
      r.misses,
    ).toBe(
      1,
    );
    expect(
      r.degreeMismatch,
    ).toBeGreaterThanOrEqual(
      1,
    );
    expect(
      s
        .tables
        .medSdnThread!
        .length,
    ).toBe(
      0,
    );
    s.tables.medSchoolAliasMiss![0]!.ignored = true;
    const seen =
      s
        .tables
        .medSchoolAliasMiss![0]!
        .seenCount;
    const r2 =
      await s.run();
    expect(
      r2.misses,
    ).toBe(
      0,
    );
    expect(
      s
        .tables
        .medSchoolAliasMiss![0]!
        .seenCount,
    ).toBe(
      seen,
    );
  });

  it('inactive schools are skipped', async () => {
    const C: T =
      {
        id: 301,
        name: 'Closed School',
        slug: 'closed',
        replies: 1,
      };
    const s =
      setup(
        feedRoutes(
          [
            C,
          ],
        ),
      );
    await s.run();
    expect(
      s
        .tables
        .medSdnThread!
        .length,
    ).toBe(
      0,
    );
  });

  it('a Cloudflare challenge on both feeds fails the run with no writes beyond the run row', async () => {
    const s =
      setup(
        {
          '/forums/1198/':
            CHALLENGE,
          '/forums/1199/':
            CHALLENGE,
          '/forums/1198/index.rss':
            CHALLENGE,
          '/forums/1199/index.rss':
            CHALLENGE,
        },
      );
    const r =
      await s.run();
    expect(
      r.status,
    ).toBe(
      'FAILED',
    );
    expect(
      s.requested.filter(
        (
          p,
        ) =>
          p.startsWith(
            '/threads/',
          ),
      ),
    ).toEqual(
      [],
    );
    expect(
      s
        .writes
        .length,
    ).toBe(
      2,
    );
    expect(
      s
        .tables
        .medSdnThread ??
        [],
    ).toEqual(
      [],
    );
  });

  it('AI not configured: PARTIAL, no model call, cursors untouched, counts updated; a later run processes the backlog', async () => {
    const s =
      setup(
        feedRoutes(
          [
            A,
            B,
          ],
        ),
        {
          configured: false,
        } as never,
      );
    const r =
      await s.run();
    expect(
      r.status,
    ).toBe(
      'PARTIAL',
    );
    expect(
      r.aiConfigured,
    ).toBe(
      false,
    );
    expect(
      s
        .calls
        .n,
    ).toBe(
      0,
    );
    expect(
      s.requested.filter(
        (
          p,
        ) =>
          p.startsWith(
            '/threads/',
          ),
      ),
    ).toEqual(
      [],
    );
    expect(
      s.tables
        .medSdnThread!.map(
          (
            t,
          ) =>
            t.repliesSeen,
        )
        .sort(),
    ).toEqual(
      [
        1,
        2,
      ],
    );
    expect(
      s.tables.medSdnThread!.every(
        (
          t,
        ) =>
          t.repliesDone ===
          -1,
      ),
    ).toBe(
      true,
    );
    s.flags.configured = true;
    const r2 =
      await s.run();
    expect(
      r2.status,
    ).toBe(
      'OK',
    );
    expect(
      r2.eventsCreated,
    ).toBe(
      3,
    );
  });

  it('llm cap 2 stops after 2 calls: PARTIAL; the next run continues', async () => {
    const s =
      setup(
        feedRoutes(
          [
            A,
            B,
          ],
        ),
        {
          maxLlmCalls: 1,
        },
      );
    const r =
      await s.run();
    expect(
      r.status,
    ).toBe(
      'PARTIAL',
    );
    expect(
      r.llmCalls,
    ).toBe(
      1,
    );
    expect(
      r.processed,
    ).toBe(
      1,
    );
    const r2 =
      await s.run();
    expect(
      r2.processed,
    ).toBe(
      1,
    );
    expect(
      r2.status,
    ).toBe(
      'OK',
    );
    expect(
      s
        .calls
        .n,
    ).toBe(
      2,
    );
  });

  it('budget refuses: PARTIAL budgetPaused and nothing written for the refused chunk', async () => {
    const s =
      setup(
        feedRoutes(
          [
            A,
          ],
        ),
      );
    s.flags.allow = false;
    const r =
      await s.run();
    expect(
      r.status,
    ).toBe(
      'PARTIAL',
    );
    expect(
      r.budgetPaused,
    ).toBe(
      true,
    );
    expect(
      s
        .calls
        .n,
    ).toBe(
      0,
    );
    expect(
      s
        .tables
        .medCycleEvent ??
        [],
    ).toEqual(
      [],
    );
    expect(
      s
        .tables
        .medSdnThread![0]!
        .repliesDone,
    ).toBe(
      -1,
    );
  });

  it('a thread that 404s mid-walk is parked, then retried after 24 h and resumes from its cursor', async () => {
    const s =
      setup(
        feedRoutes(
          [
            A,
          ],
        ),
      );
    s.live.routes[
      `/threads/${A.slug}.${A.id}/`
    ] =
      threadPage(
        [
          1,
          2,
        ],
        2,
      );
    s.live.routes[
      `/threads/${A.slug}.${A.id}/page-2`
    ] =
      null;
    const r =
      await s.run();
    expect(
      r.threadsSkipped,
    ).toBe(
      1,
    );
    expect(
      r.status,
    ).toBe(
      'PARTIAL',
    );
    expect(
      s
        .tables
        .medSdnThread![0]!
        .parkedAt,
    ).toEqual(
      NOW,
    );
    s.requested.length = 0;
    const quiet =
      await s.run();
    expect(
      s.requested.filter(
        (
          p,
        ) =>
          p.startsWith(
            '/threads/',
          ),
      ),
    ).toEqual(
      [],
    );
    expect(
      quiet.status,
    ).toBe(
      'OK',
    );
    // 25 h later (a discovery tick) the thread is back and the walk resumes.
    s.clock.t =
      new Date(
        NOW.getTime() +
          25 *
            3_600_000,
      );
    s.live.routes[
      `/threads/${A.slug}.${A.id}/page-2`
    ] =
      threadPage(
        [
          3,
        ],
        2,
      );
    const r3 =
      await s.run();
    expect(
      r3.processed,
    ).toBe(
      1,
    );
    expect(
      s
        .tables
        .medSdnThread![0]!
        .parkedAt,
    ).toBeNull();
    expect(
      s
        .tables
        .medSdnThread![0]!
        .repliesDone,
    ).toBe(
      2,
    );
    expect(
      s
        .calls
        .n,
    ).toBe(
      2,
    ); // page 1 was not asked of the model twice
  });

  it('a parked thread is not retried before 24 h even on a discovery tick', async () => {
    const s =
      setup(
        feedRoutes(
          [
            A,
          ],
        ),
      );
    s.live.routes[
      `/threads/${A.slug}.${A.id}/`
    ] =
      null;
    await s.run();
    s.clock.t =
      new Date(
        NOW.getTime() +
          25 *
            3_600_000 -
          60_000 *
            61,
      );
    s.requested.length = 0;
    await s.run();
    expect(
      s.requested.filter(
        (
          p,
        ) =>
          p.startsWith(
            '/threads/',
          ),
      ),
    ).toEqual(
      [],
    );
  });

  it('a thread that keeps failing is parked after 3 runs and retried only after 24 h', async () => {
    const s =
      setup(
        feedRoutes(
          [
            A,
          ],
        ),
      );
    s.live.routes[
      `/threads/${A.slug}.${A.id}/`
    ] =
      '<html>nothing here</html>';
    for (
      let i = 0;
      i <
      3;
      i++
    ) {
      const r =
        await s.run();
      expect(
        r.threadsFailed,
      ).toBe(
        1,
      );
    }
    const row =
      s
        .tables
        .medSdnThread![0]!;
    expect(
      row.failCount,
    ).toBe(
      3,
    );
    expect(
      row.parkedAt,
    ).toEqual(
      NOW,
    );
    s.requested.length = 0;
    await s.run();
    expect(
      s.requested.filter(
        (
          p,
        ) =>
          p.startsWith(
            '/threads/',
          ),
      ),
    ).toEqual(
      [],
    );
    s.clock.t =
      new Date(
        NOW.getTime() +
          25 *
            3_600_000,
      );
    s.live.routes[
      `/threads/${A.slug}.${A.id}/`
    ] =
      threadPage(
        [
          1,
          2,
        ],
        1,
      );
    const r =
      await s.run();
    expect(
      r.processed,
    ).toBe(
      1,
    );
    expect(
      row.failCount,
    ).toBe(
      0,
    );
    expect(
      row.parkedAt,
    ).toBeNull();
  });

  it('with no aliases mapped, two ticks make exactly one discovery walk', async () => {
    const s =
      setup(
        feedRoutes(
          [
            A,
          ],
        ),
      );
    s.tables.medSchoolAlias!.length = 0;
    await s.run();
    await s.run();
    expect(
      s.requested.filter(
        (
          p,
        ) =>
          p ===
          '/forums/1198/',
      ),
    ).toHaveLength(
      1,
    );
    s.clock.t =
      new Date(
        NOW.getTime() +
          25 *
            3_600_000,
      );
    await s.run();
    expect(
      s.requested.filter(
        (
          p,
        ) =>
          p ===
          '/forums/1198/',
      ),
    ).toHaveLength(
      2,
    );
  });

  it('a failed discovery is not retried on the next tick and leaves the run PARTIAL', async () => {
    const s =
      setup(
        feedRoutes(
          [
            A,
          ],
        ),
      );
    s.live.routes[
      '/forums/1198/'
    ] =
      '<html>broken</html>';
    const r =
      await s.run();
    expect(
      r.status,
    ).toBe(
      'PARTIAL',
    );
    expect(
      r.discovered,
    ).toBe(
      false,
    );
    s.requested.length = 0;
    const r2 =
      await s.run();
    expect(
      s.requested.filter(
        (
          p,
        ) =>
          p.startsWith(
            '/forums/1198/',
          ) &&
          !p.endsWith(
            '.rss',
          ),
      ),
    ).toEqual(
      [],
    );
    expect(
      r2.status,
    ).toBe(
      'OK',
    );
  });

  it('a quiet tick does no repair read of stored events', async () => {
    const s =
      setup(
        feedRoutes(
          [
            A,
          ],
        ),
      );
    await s.run();
    const spy =
      vi.spyOn(
        s
          .prisma
          .medCycleEvent,
        'findMany',
      );
    const r =
      await s.run();
    expect(
      r.status,
    ).toBe(
      'OK',
    );
    expect(
      spy,
    ).not.toHaveBeenCalled();
  });

  it('a challenge on both RSS feeds alone fails the run with no thread or listing request and no writes', async () => {
    const s =
      setup(
        {
          ...feedRoutes(
            [
              A,
              B,
            ],
          ),
          '/forums/1198/index.rss':
            CHALLENGE,
          '/forums/1199/index.rss':
            CHALLENGE,
        },
      );
    const r =
      await s.run();
    expect(
      r.status,
    ).toBe(
      'FAILED',
    );
    expect(
      s.requested.filter(
        (
          p,
        ) =>
          p.startsWith(
            '/threads/',
          ),
      ),
    ).toEqual(
      [],
    );
    expect(
      s.requested.filter(
        (
          p,
        ) =>
          !p.endsWith(
            '.rss',
          ),
      ),
    ).toEqual(
      [],
    );
    expect(
      s
        .writes
        .length,
    ).toBe(
      2,
    );
    expect(
      s
        .tables
        .medSdnThread ??
        [],
    ).toEqual(
      [],
    );
  });

  it('staleForumConfig is set and warned when every title is last cycle', async () => {
    const s =
      setup(
        {
          ...feedRoutes(
            [
              A,
            ],
          ),
          '/forums/1198/index.rss':
            rss(
              [
                A,
              ],
              '2025-2026',
            ),
        },
      );
    s.live.routes[
      '/forums/1198/'
    ] =
      listing(
        [],
      );
    const r =
      await s.run();
    expect(
      r.staleForumConfig,
    ).toBe(
      true,
    );
    expect(
      s.logs.some(
        (
          l,
        ) =>
          l.includes(
            'stale',
          ),
      ),
    ).toBe(
      true,
    );
  });

  it('stats hold counters only', async () => {
    const s =
      setup(
        feedRoutes(
          [
            A,
            B,
          ],
        ),
      );
    await s.run();
    const run =
      s
        .tables
        .medSourceRun![0]!;
    const keys =
      Object.keys(
        run.stats as object,
      );
    expect(
      keys.filter(
        (
          k,
        ) =>
          /author|user|post|title|text/i.test(
            k,
          ),
      ),
    ).toEqual(
      [],
    );
    for (const v of Object.values(
      run.stats as object,
    ))
      expect(
        typeof v,
      ).not.toBe(
        'object',
      );
    assertNoLeak(
      s
        .tables
        .medSourceRun!,
      NEEDLES,
    );
    assertNoLeak(
      s.writes,
      [
        'authorzz',
      ],
    );
    expect(
      s.logs.join(
        '\n',
      ),
    ).not.toContain(
      'authorzz',
    );
  });

  it('a short secret refuses the run with an error and no run row', async () => {
    const s =
      setup(
        feedRoutes(
          [
            A,
          ],
        ),
        {
          secret:
            'short',
        },
      );
    const r =
      await s.run();
    expect(
      r.runId,
    ).toBe(
      '',
    );
    expect(
      s
        .tables
        .medSourceRun ??
        [],
    ).toEqual(
      [],
    );
    expect(
      s.logs.some(
        (
          l,
        ) =>
          l.includes(
            'MEDSCHOOLS_DEDUPE_SECRET',
          ),
      ),
    ).toBe(
      true,
    );
  });

  it('an archive thread is never selected by the live run', async () => {
    const s =
      setup(
        feedRoutes(
          [
            A,
          ],
        ),
      );
    s.tables.medSdnThread!.push(
      {
        threadId: 999,
        slug: 'old',
        schoolId:
          's2',
        cycleYear: 2025,
        degree:
          'MD',
        archive: true,
        repliesSeen: 5,
        repliesDone:
          -1,
        lastActivityAt:
          null,
        cursorPage: 1,
        cursorPostHash:
          null,
        postsProcessed: 0,
      },
    );
    await s.run();
    expect(
      s.requested.some(
        (
          p,
        ) =>
          p.includes(
            '.999/',
          ),
      ),
    ).toBe(
      false,
    );
  });

  it('re-rolls the cells of already-stored events (self-healing roll-up)', async () => {
    const s =
      setup(
        feedRoutes(
          [
            A,
          ],
        ),
      );
    await s.run();
    s.tables.medCycleCount!.length = 0;
    s.clock.t =
      new Date(
        NOW.getTime() +
          25 *
            3_600_000,
      );
    const r =
      await s.run();
    expect(
      r.rolledUp,
    ).toBeGreaterThan(
      0,
    );
    expect(
      s
        .tables
        .medCycleCount!
        .length,
    ).toBeGreaterThan(
      0,
    );
  });
});

describe('sdnBackfillOwed', () => {
  const owed =
    async (
      stats:
        | unknown
        | null,
      now = NOW,
      ai = true,
    ) => {
      const {
        prisma,
        tables,
      } =
        createFakePrisma();
      if (
        stats !==
        null
      )
        tables.medSourceRun!.push(
          {
            source:
              'SDN',
            job: 'sdn-backfill',
            stats,
            startedAt:
              now,
          },
        );
      return sdnBackfillOwed(
        prisma,
        now,
        ai,
      );
    };
  it('is true with no run, false without AI, done, or paused this month', async () => {
    expect(
      await owed(
        null,
      ),
    ).toBe(
      true,
    );
    expect(
      await owed(
        null,
        NOW,
        false,
      ),
    ).toBe(
      false,
    );
    expect(
      await owed(
        {
          cursor:
            {
              stage:
                'done',
            },
        },
      ),
    ).toBe(
      false,
    );
    expect(
      await owed(
        {
          pausedMonth:
            '2026-11',
        },
      ),
    ).toBe(
      false,
    );
    expect(
      await owed(
        {
          pausedMonth:
            '2026-10',
        },
      ),
    ).toBe(
      true,
    );
  });
  it('is false while peak-paused and still peak', async () => {
    const peak =
      new Date(
        '2026-11-20T07:00:00Z',
      ); // Friday 07:00 UTC
    const off =
      new Date(
        '2026-11-20T12:00:00Z',
      );
    expect(
      await owed(
        {
          peakPaused: true,
        },
        peak,
      ),
    ).toBe(
      false,
    );
    expect(
      await owed(
        {
          peakPaused: true,
        },
        off,
      ),
    ).toBe(
      true,
    );
  });
});
