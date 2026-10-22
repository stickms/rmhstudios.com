/**
 * The proof behind every `visibility: 'public'` API cache declaration.
 *
 * `defineHandler` refuses `public` on an authenticated route at module load, but
 * `auth: 'none'` is NOT proof a response is anonymous-invariant: 46 of 69
 * `auth: 'none'` handlers read the session themselves
 * (docs/loading-audit-2026-08-11/03-api-caching.md §2). A public policy on one of
 * those stores the first caller's personalised body and serves it to everyone.
 * Nothing in the wrapper can see that, so this file does, two ways:
 *
 *  1. **Static** — `scripts/api-cache-triage.ts` walks each GET handler and every
 *     repo function it calls and reports any session / cookie / header / viewer
 *     signal. A route that declares a public cache must come back clean.
 *  2. **Dynamic** — each public route is actually called, anonymously and with a
 *     cookie + `Authorization` + `Accept-Language` attached, while the request's
 *     headers are instrumented. The session must never be read and the only
 *     headers the route may touch are the ones that identify the client for rate
 *     limiting or negotiate transport. (Prisma is stubbed, so a handler may 500
 *     partway; the claim is about what it READS, and the static pass covers the
 *     rest of the body.)
 *
 * It also holds the policy table as a countdown: every GET that the scan finds
 * viewer-independent but that has no policy must be listed here WITH A REASON,
 * and an entry that stops being true must be deleted.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const { getSession, stub } = vi.hoisted(() => ({
  getSession: vi.fn(),
  // `rows` is what every stubbed Prisma call resolves to; the dynamic test runs each
  // route once with [] and once with a populated row so a body that varies by caller
  // is compared when it has something in it (an empty `[]` is trivially equal).
  stub: {
    rows: [] as unknown[],
  },
}));

vi.mock('@/lib/auth', () => ({
  auth: { api: { getSession: (...a: unknown[]) => getSession(...a) } },
}));

// A Prisma that answers every call with an empty result. Deep, callable, and
// thenable-safe: `prisma.a.b.c(...)` -> `[]`, `$transaction(fn)` runs `fn`.
vi.mock('@/lib/prisma.server', () => {
  const make = (): unknown =>
    new Proxy(function () {}, {
      get: (_t, prop) => {
        if (prop === 'then') return undefined;
        if (prop === '$transaction')
          return async (arg: unknown) => (typeof arg === 'function' ? arg(make()) : []);
        return make();
      },
      apply: async () => stub.rows,
    });
  return { prisma: make(), prismaRead: make() };
});
vi.mock('@/lib/prisma', () => ({ prisma: new Proxy({}, { get: () => () => [] }) }));

import { clearResponseCache } from '@/lib/api/response-cache.server';
import { triage, type Row } from '../../scripts/api-cache-triage';

const rows = triage();
const isPublicDeclared = (r: Row) => !!r.declared && /visibility: 'public'/.test(r.declared);
const undeclared = (r: Row) => !r.declared && !r.handRolled;

/* -------------------------------------------------------------------------- */
/* Static                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Public-declared routes whose scan verdict is not `public`, and why that is
 * fine. Each is a viewer-independent GET that WRITES: it materialises today's
 * row on first read (idempotent), so serving later requests from a cache loses
 * nothing. Deleting an entry means the scan now finds it clean.
 */
const IDEMPOTENT_SEED_ON_READ: Record<string, string> = {
  '/api/games/$id/leaderboard':
    'adapter backfills gameStat rows for the ranked board; idempotent upsert',
  '/api/badge/$userId/$gameId': 'same adapter path as the leaderboard; idempotent upsert',
  '/api/doctrine/puzzles/today': "creates the day's puzzle on first read; second read finds it",
  '/api/daily-puzzles/puzzle': "creates the day's puzzle on first read; second read finds it",
  '/api/fortune/today': "marks the day's fortune served; same row for everyone",
  '/api/kaikai-debt': 'seeds the ledger rows on first read',
  '/api/pf2ecal/calendar.ics': 'seeds the recurring sessions on first read',
};

/**
 * Declared public although the scan reports a header read. `translate` calls
 * `getClientIp(request)` for its OWN rate limit and nothing in the body depends on
 * it; the dynamic test below confirms only IP headers are touched.
 */
const PUBLIC_DESPITE_SCAN: Record<string, string> = {
  '/api/comments/$commentId/translate':
    'client IP feeds the rate limit only; body is a function of (comment, ?to=)',
};

/**
 * Viewer-independent GETs with NO cache policy, and why not. The scan says they
 * are anonymous-invariant; that is necessary, not sufficient. An entry here is a
 * decision, not a to-do.
 */
const PUBLIC_BUT_NOT_CACHED: Record<string, string> = {
  '/api/spaces': 'raw handler (no defineHandler options to declare on); live room list',
  '/api/spaces/$id': 'raw handler; live room state and chat transcript',
  '/api/discord/embed': 'raw handler; Discord Activity lobby state, polled for freshness',
  '/api/discord/race': 'raw handler; race lobby state, polled for freshness',
  '/api/gift-sub':
    'raw handler; constant price table, cacheable once adopted onto defineHandler (body edit, WS4)',
  '/api/versecraft/world': 'raw handler; GET also writes',
  '/api/market/listings':
    'a seller or buyer must see their own action at once and a browser copy cannot be purged',
  '/api/awards': 'the giver must see the award immediately after paying coins for it',
  '/api/ai/takeaways':
    "returns 200 [] when the AI call fails; an HTTP cache would pin that failure (the handler's own memo deliberately never does)",
  '/api/pf2ecal/sessions/$id/recap': 'GET writes (generates the recap); low traffic',
  '/api/rmhladder/interview-reports':
    'user-submitted reports behind a visibility flag; removal must not be stale',
  '/api/slice-it/replay': 'replays have a visibility flag; a flip to private must not be stale',
  '/api/slice-it/replay/$id': 'replays have a visibility flag; a flip to private must not be stale',
  '/api/user-builds/$id/comments': 'user comments; deletion and moderation must not be stale',
  '/api/handles/history': 'impersonation signal that changes at a rename; low traffic',
};

describe('public cache declarations are anonymous-invariant (static)', () => {
  const publicRoutes = rows.filter(isPublicDeclared);

  it('finds the declarations (guards against the scan silently matching nothing)', () => {
    expect(publicRoutes.length).toBeGreaterThan(30);
    expect(rows.length).toBeGreaterThan(450);
  });

  it('every public declaration comes back clean from the scan', () => {
    const offenders = publicRoutes
      .filter((r) => r.klass !== 'public')
      .filter((r) => !(r.url in IDEMPOTENT_SEED_ON_READ) && !(r.url in PUBLIC_DESPITE_SCAN))
      .map((r) => `${r.url} [${r.klass}] ${r.reasons.join('; ')}`);
    expect(
      offenders,
      'a public cache on a viewer-dependent handler leaks one user to another',
    ).toEqual([]);
  });

  it('no public declaration sits on an auth: optional handler', () => {
    // `optional` means the wrapper resolves a session the handler may branch on.
    // A route that does not use it should say `none` (and avoid the lookup).
    expect(
      publicRoutes.filter((r) => r.auth !== 'none').map((r) => `${r.url} (${r.auth})`),
    ).toEqual([]);
  });

  it('the exception tables name only routes that still need them', () => {
    const byUrl = new Map(rows.map((r) => [r.url, r]));
    for (const url of Object.keys(IDEMPOTENT_SEED_ON_READ)) {
      expect(byUrl.get(url)?.klass, `${url}: no longer a writing GET — delete the entry`).toBe(
        'review',
      );
    }
    for (const url of Object.keys(PUBLIC_DESPITE_SCAN)) {
      expect(byUrl.get(url)?.klass, `${url}: scan is now clean — delete the entry`).not.toBe(
        'public',
      );
    }
  });

  it('every viewer-independent GET without a policy has a written reason (and only those)', () => {
    const open = rows
      .filter((r) => undeclared(r) && (r.klass === 'public' || r.klass === 'review'))
      .map((r) => r.url);
    expect(
      open.filter((u) => !(u in PUBLIC_BUT_NOT_CACHED)),
      'new viewer-independent GET with no cache policy: declare one (lib/api/cache-policies.ts) or add a reason',
    ).toEqual([]);
    expect(
      Object.keys(PUBLIC_BUT_NOT_CACHED).filter((u) => !open.includes(u)),
      'stale entry: this route now has a policy or is no longer viewer-independent — delete it',
    ).toEqual([]);
  });
});

/* -------------------------------------------------------------------------- */
/* Dynamic                                                                    */
/* -------------------------------------------------------------------------- */

/** Headers a public route may read: who is calling (for the rate limit) and transport. */
const ALLOWED_HEADER_READS = new Set([
  'cf-connecting-ip',
  'x-forwarded-for',
  'x-real-ip',
  'if-none-match',
  'accept-encoding',
]);

const loaders = import.meta.glob('../../app/routes/api/**/*.ts') as Record<
  string,
  () => Promise<{ Route?: { options?: { server?: { handlers?: Record<string, unknown> } } } }>
>;

type Handler = (a: { request: Request; params: Record<string, string> }) => Promise<Response>;

function instrument(request: Request): { request: Request; reads: Set<string> } {
  const reads = new Set<string>();
  const real = request.headers;
  const spy = new Proxy(real, {
    get(target, prop) {
      if (prop === 'get' || prop === 'has' || prop === 'getSetCookie') {
        return (name?: string) => {
          reads.add(String(name ?? '*').toLowerCase());
          return (target as unknown as Record<string, (n?: string) => unknown>)[prop as string](
            name,
          );
        };
      }
      if (
        prop === 'entries' ||
        prop === 'keys' ||
        prop === 'values' ||
        prop === 'forEach' ||
        prop === Symbol.iterator
      ) {
        reads.add('*');
      }
      const v = Reflect.get(target, prop, target);
      return typeof v === 'function' ? v.bind(target) : v;
    },
  });
  Object.defineProperty(request, 'headers', { value: spy });
  return { request, reads };
}

const concretePath = (url: string) => url.replace(/\$[A-Za-z]+/g, 'x');
const paramsOf = (url: string) =>
  Object.fromEntries([...url.matchAll(/\$([A-Za-z]+)/g)].map((m) => [m[1], 'x']));

const POPULATED_FLOOR = 15;

describe('public cache declarations are anonymous-invariant (dynamic)', () => {
  const targets = rows.filter(isPublicDeclared);
  const statuses = new Map<string, number>();
  /** Routes whose populated-stub body actually carried the stub row, i.e. were really compared. */
  const populated = new Set<string>();
  const ROW = {
    id: 'row-1',
    userId: 'user-1',
    name: 'Row One',
    username: 'rowone',
    displayName: 'Row One',
    title: 'Row One',
    slug: 'row-one',
    score: 42,
    rating: 1500,
    count: 3,
    tag: 'row',
    createdAt: new Date('2026-10-20T00:00:00Z'),
    updatedAt: new Date('2026-10-20T00:00:00Z'),
    user: { id: 'user-1', name: 'Row One', username: 'rowone', image: null },
  };

  // A handler that stamps `Date.now()` into its body would differ between the two
  // calls for a reason that has nothing to do with the caller.
  beforeAll(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-21T12:00:00Z'));
  });
  afterAll(() => {
    vi.useRealTimers();
  });

  it('the probe itself sees a cookie read and a session read (negative control)', async () => {
    const { request, reads } = instrument(
      new Request('https://rmhstudios.com/x', { headers: { cookie: 'a=b' } }),
    );
    request.headers.get('Cookie');
    expect([...reads]).toEqual(['cookie']);
    getSession.mockReset();
    await getSession({ headers: request.headers });
    expect(getSession).toHaveBeenCalledTimes(1);
  });

  it.each(targets.map((r) => [r.url, r.file] as const))(
    '%s',
    async (url, file) => {
      const key = `../../${file}`;
      const load = loaders[key];
      expect(load, `import.meta.glob did not cover ${key}`).toBeTypeOf('function');
      const mod = await load();
      const handlers = mod.Route?.options?.server?.handlers as Record<string, Handler> | undefined;
      const GET = handlers?.GET;
      expect(GET, `${url} has no GET handler`).toBeTypeOf('function');

      const base = `https://rmhstudios.com${concretePath(url)}?limit=5&to=English&id=x&userId=x&slug=x`;
      const call = async (headers: Record<string, string>) => {
        clearResponseCache(); // each call must run the handler: the micro-cache would hide its header reads
        getSession.mockReset();
        getSession.mockResolvedValue({ user: { id: 'viewer-1', isAdmin: true, name: 'Viewer' } });
        const { request, reads } = instrument(
          new Request(base, {
            headers: {
              'cf-connecting-ip': `10.1.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`,
              ...headers,
            },
          }),
        );
        const res = await GET!({ request, params: paramsOf(url) });
        return { res, reads, sessionReads: getSession.mock.calls.length };
      };

      const credentialed = {
        cookie: 'better-auth.session_token=abc.def; rmh-lang=fr',
        authorization: 'Bearer secret',
        'accept-language': 'fr-FR,fr;q=0.9',
      };
      const textOf = async (r: Response) => r.clone().text();

      // Populated pass first: same checks, but the stub returns a real row so the
      // body has content that a viewer-dependent handler could vary.
      stub.rows = [ROW];
      try {
        const a = await call({});
        const b = await call(credentialed);
        expect(b.sessionReads, 'credentialed call read the session (populated)').toBe(0);
        expect(b.res.status).toBe(a.res.status);
        const bodyA = await textOf(a.res);
        expect(await textOf(b.res)).toBe(bodyA);
        if (a.res.ok && /row-1|user-1|Row One|rowone/.test(bodyA)) populated.add(url);
      } finally {
        stub.rows = [];
      }

      const anon = await call({});
      const authed = await call({
        ...credentialed,
      });

      statuses.set(url, anon.res.status);
      expect(anon.sessionReads, 'anonymous call read the session').toBe(0);
      expect(authed.sessionReads, 'credentialed call read the session').toBe(0);
      for (const reads of [anon.reads, authed.reads]) {
        expect([...reads].filter((h) => !ALLOWED_HEADER_READS.has(h))).toEqual([]);
      }
      // Same status, same cache policy, same body: credentials change nothing.
      expect(authed.res.status).toBe(anon.res.status);
      expect(authed.res.headers.get('cache-control')).toBe(anon.res.headers.get('cache-control'));
      if (anon.res.ok) {
        expect(anon.res.headers.get('cache-control')).toMatch(/^public, max-age=\d+/);
        expect(anon.res.headers.get('vary') ?? '').not.toMatch(/cookie/i);
        expect(await authed.res.text()).toBe(await anon.res.text());
      }
    },
    20_000,
  );

  it('the populated pass is not vacuous: a good share of routes compare a non-empty body', () => {
    expect(populated.size).toBeGreaterThanOrEqual(POPULATED_FLOOR);
  });

  it('is not vacuous: most public routes render 2xx under the empty stub', () => {
    // 33 of 47 at the time of writing; the rest 404/500 on the empty fixture, and
    // for those the header-read and session-read assertions above still hold.
    const ok = [...statuses.values()].filter((st) => st >= 200 && st < 300).length;
    expect(ok).toBeGreaterThanOrEqual(25);
  });
});
