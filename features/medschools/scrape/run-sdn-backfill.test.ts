import { describe, expect, it } from 'vitest';
import { parseThreadTitle } from '../engine/sdn-title';
import { NEEDLES, assertNoLeak, createFakeHost, createFakePrisma, httpStatusRoute } from './test-support';
import { runSdnBackfill, type SdnBackfillDeps } from './run-sdn-backfill';
import { sdnBackfillOwed, type SdnForumsFile } from './run-sdn-live';
import type { SdnAi } from './sdn/extract';

const SECRET = 'unit-test-secret-0123456789';
const NOW = new Date('2026-11-20T18:00:00.000Z'); // Friday, off-peak
const FORUMS: SdnForumsFile = {
  generatedAt: NOW.toISOString(),
  current: [],
  archive: [
    {
      node: 962,
      slug: 'md-prior',
      degree: 'MD',
      cycleYear: null,
    },
    {
      node: 603,
      slug: 'do-prior',
      degree: 'DO',
      cycleYear: null,
    },
  ],
};

interface T {
  id: number;
  name: string;
  slug: string;
  replies: number;
  label?: string | null;
}
const titleOf = (t: T) => (t.label === null ? t.name : `${t.label ?? '2025-2026'} ${t.name}`);
const stemOf = (name: string) => parseThreadTitle(`2025-2026 ${name}`)!.stem;

const listing = (items: T[], next = false) =>
  `<html><head>${next ? '<link rel="next" href="x">' : ''}</head><body>${items.length === 0 ? 'There are no threads' : ''}${items
    .map(
      (t) =>
        `<div class="structItem structItem--thread"><div class="structItem-cell--main"><div class="structItem-title"><a data-tp-primary href="/threads/${t.slug}.${t.id}/">${titleOf(t)}</a></div></div><div class="structItem-cell structItem-cell--meta"><dl class="pairs pairs--justified"><dt>Replies</dt><dd>${t.replies}</dd></dl></div><div class="structItem-cell--latest"><time class="structItem-latestDate" datetime="2025-03-20T10:00:00-0500"></time></div></div>`,
    )
    .join('')}</body></html>`;
const post = (id: number) =>
  `<article class="message message--post" data-author="authorzz${id}" data-content="post-${id}" id="js-post-${id}"><header class="message-attribution"><ul class="message-attribution-main"><li><time class="u-dt" datetime="2025-03-20T10:00:00-0500" data-timestamp="1795186800"></time></li></ul></header><div class="bbWrapper">I got an interview invite today</div></article>`;
const threadPage = (ids: number[]) =>
  `<html><body><ul><li class="pageNav-page"><a>1</a></li></ul>${ids.map(post).join('')}</body></html>`;

const answer = (user: string): string => {
  const reqs = JSON.parse(user.slice(user.indexOf('['), user.lastIndexOf(']') + 1)) as Array<{
    ref: number;
  }>;
  return JSON.stringify({
    posts: reqs.map((r) => ({
      postRef: r.ref,
      events: [
        {
          type: 'INTERVIEW',
          date: '2025-03-18',
        },
      ],
      questions: [],
    })),
  });
};

const Y25: T = {
  id: 25,
  name: 'Harvard Medical School',
  slug: 'harvard-25',
  replies: 1,
  label: '2024-2025',
};
const Y24: T = {
  id: 24,
  name: 'Yale School of Medicine',
  slug: 'yale-24',
  replies: 1,
  label: '2023-2024',
};
const Y26: T = {
  id: 26,
  name: 'Harvard Medical School',
  slug: 'harvard-26',
  replies: 1,
  label: '2025-2026',
};
const Y23: T = {
  id: 23,
  name: 'Yale School of Medicine',
  slug: 'yale-23',
  replies: 1,
  label: '2022-2023',
};

function setup(routes: Record<string, string | null>, over: Partial<SdnBackfillDeps> = {}) {
  const fake = createFakePrisma();
  fake.tables.medSchool!.push(
    {
      id: 's1',
      slug: 'harvard',
      active: true,
      degree: 'MD',
    },
    {
      id: 's2',
      slug: 'yale',
      active: true,
      degree: 'MD',
    },
  );
  fake.tables.medSchoolAlias!.push(
    {
      id: 'a1',
      schoolId: 's1',
      source: 'SDN',
      sourceKey: stemOf('Harvard Medical School'),
    },
    {
      id: 'a2',
      schoolId: 's2',
      source: 'SDN',
      sourceKey: stemOf('Yale School of Medicine'),
    },
  );
  const live = {
    routes,
  };
  const fh = createFakeHost((p) => live.routes[p] ?? null);
  const logs: string[] = [];
  const log = {
    info: (l: string) => logs.push(l),
    warn: (l: string) => logs.push(l),
    error: (l: string) => logs.push(l),
  };
  const clock = {
    t: NOW,
  };
  const flags = {
    configured: true,
    allow: true,
  };
  const calls = {
    n: 0,
  };
  const ai: SdnAi = {
    configured: () => flags.configured,
    run: async (_s, user) => {
      calls.n++;
      return answer(user);
    },
  };
  const run = (
    opts: {
      trigger?: 'CRON' | 'MANUAL';
      rediscover?: boolean;
    } = {},
  ) =>
    runSdnBackfill(
      {
        prisma: fake.prisma,
        host: fh.host,
        ai,
        budget: {
          allow: async () => flags.allow,
        },
        secret: SECRET,
        forums: FORUMS,
        shouldStop: () => false,
        log,
        now: () => clock.t,
        ...over,
      },
      {
        trigger: opts.trigger ?? 'MANUAL',
        rediscover: opts.rediscover,
      },
    );
  const tables = fake.tables as Record<string, Array<Record<string, unknown>>>;
  return {
    ...fake,
    tables,
    ...fh,
    live,
    logs,
    flags,
    clock,
    calls,
    run,
  };
}

const archiveRoutes = (items: T[] = [Y25, Y24, Y26, Y23]) => {
  const r: Record<string, string> = {
    '/forums/962/': listing(items),
    '/forums/603/': listing([]),
  };
  for (const t of items) r[`/threads/${t.slug}.${t.id}/`] = threadPage([t.id * 10]);
  return r;
};
const threadRequests = (s: { requested: string[] }) => s.requested.filter((p) => p.startsWith('/threads/'));

describe('runSdnBackfill', () => {
  it('discovery walks every archive forum, persists the cursor after each page and records misses', async () => {
    const miss: T = {
      id: 90,
      name: 'Unknown Academy',
      slug: 'unk',
      replies: 1,
    };
    const nolabel: T = {
      id: 91,
      name: 'Harvard Medical School',
      slug: 'nl',
      replies: 1,
      label: null,
    };
    const routes = {
      '/forums/962/': listing([Y25, miss], true),
      '/forums/962/page-2': listing([Y24, nolabel]),
      '/forums/603/': listing([]),
      [`/threads/${Y25.slug}.${Y25.id}/`]: threadPage([1]),
      [`/threads/${Y24.slug}.${Y24.id}/`]: threadPage([2]),
    };
    const s = setup(routes);
    const r = await s.run();
    expect(r.status).toBe('OK');
    expect(r.listingPages).toBe(3);
    expect(r.misses).toBe(1);
    expect(r.unlabelled).toBe(1);
    expect(s.tables.medSdnThread!.map((t) => t.archive)).toEqual([true, true]);
    expect(s.tables.medSchoolAliasMiss!.length).toBe(1);
    expect(s.sessions[0]!.spacingMs).toBe(2000);
    expect(r.cursor.stage).toBe('done');
  });

  it('kill after listing page 2, resume starts at page 3', async () => {
    const pages = [1, 2, 3].map((n) => ({
      id: 100 + n,
      name: 'Harvard Medical School',
      slug: `h${n}`,
      replies: 0,
      label: '2024-2025',
    }));
    const routes: Record<string, string> = {
      '/forums/962/': listing([pages[0]!], true),
      '/forums/962/page-2': listing([pages[1]!], true),
      '/forums/962/page-3': listing([pages[2]!]),
      '/forums/603/': listing([]),
      ...Object.fromEntries(pages.map((t) => [`/threads/${t.slug}.${t.id}/`, threadPage([t.id])])),
    };
    const s = setup(routes, {
      maxPages: 2,
    });
    const r1 = await s.run();
    expect(r1.status).toBe('PARTIAL');
    expect(r1.cursor).toMatchObject({
      stage: 'discover',
      forumNode: 962,
      page: 3,
    });
    const before = s.requested.length;
    // Same store and host, new run with a larger cap.
    const r2 = await runSdnBackfill(
      {
        prisma: s.prisma,
        host: s.host,
        ai: {
          configured: () => true,
          run: async (_s, u) => answer(u),
        },
        budget: {
          allow: async () => true,
        },
        secret: SECRET,
        forums: FORUMS,
        shouldStop: () => false,
        log: {
          info() {},
          warn() {},
          error() {},
        },
        now: () => NOW,
      },
      {
        trigger: 'CRON',
      },
    );
    expect(s.requested.slice(before)[0]).toBe('/forums/962/page-3');
    expect(s.requested.slice(before)).not.toContain('/forums/962/');
    expect(r2.status).toBe('OK');
  });

  it('threads are processed newest cycle first', async () => {
    const s = setup(archiveRoutes());
    await s.run();
    expect(threadRequests(s)).toEqual([
      `/threads/${Y26.slug}.${Y26.id}/`,
      `/threads/${Y25.slug}.${Y25.id}/`,
      `/threads/${Y24.slug}.${Y24.id}/`,
      `/threads/${Y23.slug}.${Y23.id}/`,
    ]);
  });

  it('per-run caps stop the run PARTIAL and the next run continues', async () => {
    const s = setup(archiveRoutes(), {
      maxLlmCalls: 2,
    });
    const r1 = await s.run();
    expect(r1.status).toBe('PARTIAL');
    expect(r1.capPaused).toBe(true);
    expect(r1.processed).toBe(2);
    const r2 = await s.run();
    expect(r2.processed).toBe(2);
    expect(r2.status).toBe('OK');
  });

  it('budget refusal sets pausedMonth and PARTIAL; owed follows the UTC month; the resume does not refetch finished threads', async () => {
    const t = setup(archiveRoutes());
    t.flags.allow = false;
    const r = await t.run();
    expect(r.status).toBe('PARTIAL');
    expect(r.budgetPaused).toBe(true);
    expect(r.pausedMonth).toBe('2026-11');
    expect(threadRequests(t)).toEqual([]);
    expect(await sdnBackfillOwed(t.prisma, NOW, true)).toBe(false);
    expect(await sdnBackfillOwed(t.prisma, new Date('2026-12-01T12:00:00Z'), true)).toBe(true);
    // Resume next month: allow again, only unfinished threads are fetched.
    t.flags.allow = true;
    t.clock.t = new Date('2026-12-01T12:00:00Z'); // Tuesday off-peak
    const before = t.requested.length;
    const r2 = await t.run();
    expect(r2.status).toBe('OK');
    expect(t.requested.slice(before).filter((p) => p.startsWith('/forums/'))).toEqual([]);
    expect(r2.processed).toBe(4);
  });

  it('a mid-backfill budget stop resumes from the stored per-thread cursors', async () => {
    const s = setup(archiveRoutes());
    let allowed = 2;
    const r1 = await runSdnBackfill(
      {
        prisma: s.prisma,
        host: s.host,
        ai: {
          configured: () => true,
          run: async (_s, u) => answer(u),
        },
        budget: {
          allow: async () => allowed-- > 0,
        },
        secret: SECRET,
        forums: FORUMS,
        shouldStop: () => false,
        log: {
          info() {},
          warn() {},
          error() {},
        },
        now: () => NOW,
      },
      {
        trigger: 'CRON',
      },
    );
    expect(r1.status).toBe('PARTIAL');
    expect(r1.pausedMonth).toBe('2026-11');
    const done = r1.processed;
    expect(done).toBeGreaterThan(0);
    const before = s.requested.length;
    const r2 = await s.run();
    const again = threadRequests({
      requested: s.requested.slice(before),
    });
    expect(again.length).toBe(4 - done);
    expect(r2.status).toBe('OK');
  });

  it('peak hour: PARTIAL peakPaused with zero requests; off-peak proceeds', async () => {
    const s = setup(archiveRoutes());
    s.clock.t = new Date('2026-11-20T07:00:00Z');
    const r = await s.run();
    expect(r.status).toBe('PARTIAL');
    expect(r.peakPaused).toBe(true);
    expect(s.requested).toEqual([]);
    expect(s.calls.n).toBe(0);
    expect(await sdnBackfillOwed(s.prisma, s.clock.t, true)).toBe(false);
    s.clock.t = new Date('2026-11-20T12:00:00Z');
    const r2 = await s.run();
    expect(r2.status).toBe('OK');
  });

  it('AI not configured: PARTIAL, no request, owed false', async () => {
    const s = setup(archiveRoutes());
    s.flags.configured = false;
    const r = await s.run();
    expect(r.status).toBe('PARTIAL');
    expect(r.aiConfigured).toBe(false);
    expect(s.requested).toEqual([]);
    expect(await sdnBackfillOwed(s.prisma, NOW, false)).toBe(false);
  });

  it('3 consecutive failures halt: FAILED, stage unchanged', async () => {
    const s = setup(archiveRoutes());
    const r1 = await s.run(); // discovery + threads done
    expect(r1.status).toBe('OK');
    const t = setup(archiveRoutes());
    for (const x of [Y25, Y24, Y26, Y23])
      t.live.routes[`/threads/${x.slug}.${x.id}/`] = '<html><head><title>Just a moment...</title></head></html>';
    const r = await t.run();
    expect(r.status).toBe('FAILED');
    expect(r.halted).toBe(true);
    expect(r.cursor.stage).toBe('threads');
  });

  it('three 403s with no challenge text halt the backfill too', async () => {
    const t = setup(archiveRoutes());
    for (const x of [Y25, Y24, Y26, Y23]) t.live.routes[`/threads/${x.slug}.${x.id}/`] = httpStatusRoute(403);
    const r = await t.run();
    expect(r.status).toBe('FAILED');
    expect(r.halted).toBe(true);
  });

  it('a completed backfill is a no-op next call; rediscover resets the stage', async () => {
    const s = setup(archiveRoutes());
    await s.run();
    const before = s.requested.length;
    const r = await s.run({
      trigger: 'CRON',
    });
    expect(r.noop).toBe(true);
    expect(r.status).toBe('OK');
    expect(s.requested.length).toBe(before);
    const r2 = await s.run({
      rediscover: true,
    });
    expect(r2.noop).toBe(false);
    expect(s.requested.length).toBeGreaterThan(before);
    expect(r2.cursor.stage).toBe('done');
  });

  it('live and backfill sets never overlap', async () => {
    const s = setup(archiveRoutes());
    s.tables.medSdnThread!.push({
      threadId: 777,
      slug: 'live',
      schoolId: 's1',
      cycleYear: 2027,
      degree: 'MD',
      archive: false,
      repliesSeen: 5,
      repliesDone: -1,
      cursorPage: 1,
      cursorPostHash: null,
      postsProcessed: 0,
      parkedAt: null,
      failCount: 0,
    });
    await s.run();
    const live = s.tables.medSdnThread!.find((t) => t.threadId === 777)!;
    expect(live.archive).toBe(false);
    expect(live.repliesDone).toBe(-1);
    expect(threadRequests(s).some((p) => p.includes('.777'))).toBe(false);
  });

  it('stats hold counters only', async () => {
    const s = setup(archiveRoutes());
    await s.run();
    const stats = s.tables.medSourceRun![0]!.stats as Record<string, unknown>;
    expect(Object.keys(stats).filter((k) => /author|user|post|title|text/i.test(k))).toEqual([]);
    for (const [k, v] of Object.entries(stats))
      if (!['cursor', 'listingFail', 'skippedListingPages', 'rollupPending'].includes(k))
        expect(v === null || typeof v !== 'object').toBe(true);
    assertNoLeak(s.tables.medSourceRun!, NEEDLES);
    assertNoLeak(s.writes, ['authorzz']);
    expect(s.logs.join('\n')).not.toContain('authorzz');
  });
});

describe('parked threads and failed roll-ups', () => {
  const hours = (n: number) => n * 3_600_000;
  const gone = () => {
    const routes = archiveRoutes();
    delete routes[`/threads/${Y23.slug}.${Y23.id}/`]; // 404
    return routes;
  };

  it('a parked archive thread keeps the backfill open, is not owed for 24 h, then is retried and the stage reaches done', async () => {
    const s = setup(gone());
    const r1 = await s.run();
    expect(r1.threadsSkipped).toBe(1);
    expect(r1.waitingOnParked).toBe(true);
    expect(r1.cursor.stage).toBe('threads');
    expect(r1.parkedUntil).toBe(new Date(NOW.getTime() + hours(24)).toISOString());
    // Benign: no back-off streak, and not owed every tick.
    expect((s.tables.medSourceRun!.at(-1)!.stats as { failStreak: number }).failStreak).toBe(0);
    for (const h of [0.02, 1, 23])
      expect(await sdnBackfillOwed(s.prisma, new Date(NOW.getTime() + hours(h)), true)).toBe(false);
    expect(await sdnBackfillOwed(s.prisma, new Date(NOW.getTime() + hours(25)), true)).toBe(true);

    // A run before the 24 h are up makes no thread request and stays open.
    s.clock.t = new Date(NOW.getTime() + hours(2));
    const before = threadRequests(s).length;
    const idle = await s.run();
    expect(threadRequests(s).length).toBe(before);
    expect(idle.waitingOnParked).toBe(true);
    expect(idle.cursor.stage).toBe('threads');

    // The thread is back; after 24 h it is retried and the backfill finishes.
    s.live.routes[`/threads/${Y23.slug}.${Y23.id}/`] = threadPage([Y23.id * 10]);
    s.clock.t = new Date(NOW.getTime() + hours(25));
    const r2 = await s.run();
    expect(threadRequests(s).filter((p) => p.includes(`.${Y23.id}/`)).length).toBe(2);
    expect(r2.processed).toBe(1);
    expect(r2.status).toBe('OK');
    expect(r2.waitingOnParked).toBe(false);
    expect(r2.cursor.stage).toBe('done');
    expect(await sdnBackfillOwed(s.prisma, new Date(NOW.getTime() + hours(60)), true)).toBe(false);
  });

  it('a failed roll-up is kept in the stats as bare cells and the next run repairs the counts', async () => {
    const s = setup(archiveRoutes());
    const real = s.prisma.medCycleCount.findMany.bind(s.prisma.medCycleCount);
    let down = true;
    s.prisma.medCycleCount.findMany = (async (a: never) => {
      if (down) throw new Error('db down');
      return real(a);
    }) as never;
    const r1 = await s.run();
    expect(r1.rollupErrors).toBeGreaterThan(0);
    expect(r1.status).toBe('PARTIAL');
    expect(r1.cursor.stage).toBe('threads');
    expect(s.tables.medCycleEvent!.length).toBeGreaterThan(0);
    expect(s.tables.medCycleCount!.length).toBe(0);
    const pending = (s.tables.medSourceRun!.at(-1)!.stats as { rollupPending: Array<Record<string, unknown>> })
      .rollupPending;
    expect(pending.length).toBeGreaterThan(0);
    for (const c of pending) expect(Object.keys(c).sort()).toEqual(['cycleYear', 'date', 'program', 'schoolId']);

    down = false;
    s.clock.t = new Date(NOW.getTime() + hours(2));
    const r2 = await s.run();
    expect(r2.rolledUp).toBeGreaterThan(0);
    expect(s.tables.medCycleCount!.length).toBeGreaterThan(0);
    expect(r2.status).toBe('OK');
    expect(r2.cursor.stage).toBe('done');
    expect((s.tables.medSourceRun!.at(-1)!.stats as { rollupPending: unknown[] }).rollupPending).toEqual([]);
  });
});

describe('backfill back-off and listing skip (Q23)', () => {
  const minutes = (n: number) => n * 60_000;
  const challengeAll = (s: ReturnType<typeof setup>) => {
    for (const x of [Y25, Y24, Y26, Y23])
      s.live.routes[`/threads/${x.slug}.${x.id}/`] = '<html><head><title>Just a moment...</title></head></html>';
  };
  const failingRun = async (s: ReturnType<typeof setup>) => {
    challengeAll(s);
    const r = await s.run();
    expect(r.status).toBe('FAILED');
    return r;
  };

  it('a FAILED run is not owed at +30 min and owed at +61 min', async () => {
    const s = setup(archiveRoutes());
    await failingRun(s);
    expect(await sdnBackfillOwed(s.prisma, new Date(NOW.getTime() + minutes(30)), true)).toBe(false);
    expect(await sdnBackfillOwed(s.prisma, new Date(NOW.getTime() + minutes(61)), true)).toBe(true);
  });

  it('two consecutive failures give a 2 h window', async () => {
    const s = setup(archiveRoutes());
    await failingRun(s);
    s.clock.t = new Date(NOW.getTime() + minutes(61));
    await failingRun(s);
    const second = s.clock.t.getTime();
    expect(
      (
        s.tables.medSourceRun!.at(-1)!.stats as {
          failStreak: number;
        }
      ).failStreak,
    ).toBe(2);
    expect(await sdnBackfillOwed(s.prisma, new Date(second + minutes(90)), true)).toBe(false);
    expect(await sdnBackfillOwed(s.prisma, new Date(second + minutes(121)), true)).toBe(true);
  });

  it('a cap-pause PARTIAL is owed on the next tick and a success resets the count', async () => {
    const s = setup(archiveRoutes(), {
      maxLlmCalls: 2,
    });
    await failingRun(setup(archiveRoutes())); // unrelated store: failures do not leak
    const r = await s.run();
    expect(r.status).toBe('PARTIAL');
    expect(await sdnBackfillOwed(s.prisma, new Date(NOW.getTime() + minutes(1)), true)).toBe(true);
    expect(
      (
        s.tables.medSourceRun!.at(-1)!.stats as {
          failStreak: number;
        }
      ).failStreak,
    ).toBe(0);
  });

  it('a success after failures resets failStreak', async () => {
    const s = setup(archiveRoutes());
    await failingRun(s);
    for (const x of [Y25, Y24, Y26, Y23]) s.live.routes[`/threads/${x.slug}.${x.id}/`] = threadPage([x.id * 10]);
    s.clock.t = new Date(NOW.getTime() + minutes(61));
    const r = await s.run();
    expect(r.status).toBe('OK');
    expect(
      (
        s.tables.medSourceRun!.at(-1)!.stats as {
          failStreak: number;
        }
      ).failStreak,
    ).toBe(0);
  });

  it('a listing page that fails in 3 runs is skipped and recorded', async () => {
    const routes = archiveRoutes();
    routes['/forums/962/'] = listing([Y25], true);
    delete routes['/forums/962/page-2']; // 404
    routes['/forums/962/page-3'] = listing([Y24]);
    const s = setup(routes);
    for (let i = 0; i < 2; i++) {
      const r = await s.run();
      expect(r.status).toBe('PARTIAL');
      expect(r.cursor).toMatchObject({
        stage: 'discover',
        page: 2,
      });
      s.clock.t = new Date(s.clock.t.getTime() + minutes(1500));
    }
    const r3 = await s.run();
    expect(
      (
        s.tables.medSourceRun!.at(-1)!.stats as {
          skippedListingPages: string[];
        }
      ).skippedListingPages,
    ).toEqual(['962:2']);
    expect(r3.listingPages).toBeGreaterThanOrEqual(2);
    expect(s.requested).toContain('/forums/962/page-3');
  });

  it('pausedMonth survives a later run that does not carry it', async () => {
    const { prisma, tables } = createFakePrisma();
    tables.medSourceRun!.push(
      {
        source: 'SDN',
        job: 'sdn-backfill',
        status: 'PARTIAL',
        stats: {
          pausedMonth: '2026-11',
        },
        startedAt: new Date('2026-11-10T00:00:00Z'),
      },
      {
        source: 'SDN',
        job: 'sdn-backfill',
        status: 'PARTIAL',
        stats: {
          listingFailed: 0,
        },
        startedAt: new Date('2026-11-12T00:00:00Z'),
      },
    );
    expect(await sdnBackfillOwed(prisma, NOW, true)).toBe(false);
    expect(await sdnBackfillOwed(prisma, new Date('2026-12-02T12:00:00Z'), true)).toBe(true);
  });
});
