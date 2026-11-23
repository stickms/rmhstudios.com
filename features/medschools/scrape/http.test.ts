import { describe, expect, it } from 'vitest';
import { BudgetExhaustedError, createPoliteHost, SourceHaltedError, type PoliteHostDeps } from './http';
import { createDailyBudget } from './request-budget';
import { createFakePrisma } from './test-support';
import { MEDSCHOOLS_USER_AGENT, SOURCES } from './sources';

type Handler = (url: string, init: RequestInit, n: number) => Response | Promise<Response> | Error;

function harness(handler: Handler, config = SOURCES.CYCLETRACK) {
  let t = 1_000_000;
  const sleeps: number[] = [];
  const calls: {
    url: string;
    at: number;
    headers: Record<string, string>;
    method: string;
    body: string | undefined;
  }[] = [];
  let inFlight = 0;
  let maxInFlight = 0;
  const fetchImpl = (async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = String(input);
    inFlight++;
    maxInFlight = Math.max(maxInFlight, inFlight);
    calls.push({
      url,
      at: t,
      headers: { ...(init.headers as Record<string, string>) },
      method: init.method ?? 'GET',
      body: init.body as string | undefined,
    });
    try {
      // yield so overlapping callers would be observed
      await Promise.resolve();
      await Promise.resolve();
      const out = await handler(url, init, calls.length);
      if (out instanceof Error) throw out;
      return out;
    } finally {
      inFlight--;
    }
  }) as typeof fetch;
  const host = createPoliteHost(config, {
    fetchImpl,
    sleep: async (ms) => {
      sleeps.push(ms);
      t += ms;
    },
    now: () => t,
  });
  return {
    host,
    calls,
    sleeps,
    maxInFlight: () => maxInFlight,
    /** Advance the injected clock. */
    sleepFor: async (ms: number) => {
      t += ms;
    },
  };
}

const ok = (body = 'ok') => new Response(body, { status: 200 });
const robotsOpen = (url: string) => (url.endsWith('/robots.txt') ? ok('User-agent: *\nAllow: /') : null);

describe('createPoliteHost', () => {
  it('sends the descriptive User-Agent on every request', async () => {
    const h = harness((url) => robotsOpen(url) ?? ok());
    const s = h.host.session();
    await s.get('/a');
    await s.get('/b');
    expect(h.calls.length).toBeGreaterThanOrEqual(3);
    for (const c of h.calls) {
      expect(c.headers['user-agent']).toBe(MEDSCHOOLS_USER_AGENT);
    }
    expect(MEDSCHOOLS_USER_AGENT).toBe('MarlonJack/1.0 (contact: admin@rmhstudios.com)');
  });

  it('spaces consecutive requests by at least 1000 ms (2000 with a session override)', async () => {
    const h = harness((url) => robotsOpen(url) ?? ok());
    const s = h.host.session();
    await s.get('/a');
    await s.get('/b');
    const pages = h.calls.filter((c) => !c.url.endsWith('/robots.txt'));
    expect(pages[1]!.at - pages[0]!.at).toBeGreaterThanOrEqual(1000);

    const h2 = harness((url) => robotsOpen(url) ?? ok());
    const s2 = h2.host.session({ spacingMs: 2000 });
    await s2.get('/a');
    await s2.get('/b');
    const p2 = h2.calls.filter((c) => !c.url.endsWith('/robots.txt'));
    expect(p2[1]!.at - p2[0]!.at).toBeGreaterThanOrEqual(2000);
  });

  it('serializes concurrent callers across sessions', async () => {
    const h = harness((url) => robotsOpen(url) ?? ok());
    const a = h.host.session();
    const b = h.host.session();
    await Promise.all([a.get('/a'), b.get('/b'), a.get('/c'), b.get('/d')]);
    expect(h.maxInFlight()).toBe(1);
  });

  it('honours Retry-After, caps it, and backs off without it', async () => {
    let n = 0;
    const h = harness((url) => {
      const r = robotsOpen(url);
      if (r) return r;
      n++;
      return n === 1 ? new Response('', { status: 429, headers: { 'retry-after': '7' } }) : ok();
    });
    const res = await h.host.session().get('/a');
    expect(res.ok).toBe(true);
    expect(h.sleeps).toContain(7000);

    let m = 0;
    const h2 = harness((url) => {
      const r = robotsOpen(url);
      if (r) return r;
      m++;
      return m === 1 ? new Response('', { status: 429, headers: { 'retry-after': '9999' } }) : ok();
    });
    await h2.host.session().get('/a');
    expect(h2.sleeps).toContain(120_000);
    expect(h2.sleeps).not.toContain(9_999_000);

    let k = 0;
    const h3 = harness((url) => {
      const r = robotsOpen(url);
      if (r) return r;
      k++;
      return k <= 2 ? new Response('', { status: 503 }) : ok();
    });
    const r3 = await h3.host.session().get('/a');
    expect(r3.ok).toBe(true);
    expect(h3.sleeps.filter((s) => s >= 2000)).toEqual([2000, 4000]);
  });

  it('resolves {ok:false} after maxRetries and counts exactly one failure', async () => {
    const h = harness((url) => robotsOpen(url) ?? new Response('', { status: 503 }));
    const s = h.host.session();
    const before = h.calls.length;
    const res = await s.get('/a');
    expect(res.ok).toBe(false);
    expect(res.status).toBe(503);
    expect(h.calls.length - before).toBe(1 + 1 + SOURCES.CYCLETRACK.maxRetries); // robots + attempts
    // one failure only: two more failing gets are needed to halt
    expect(s.halted).toBe(false);
    await s.get('/b');
    expect(s.halted).toBe(false);
    await s.get('/c');
    expect(s.halted).toBe(true);
    expect(s.lastFailure).toBeTruthy();
  });

  it('counts network errors as failures', async () => {
    const h = harness((url) => robotsOpen(url) ?? new Error('ECONNRESET'));
    const res = await h.host.session().get('/a');
    expect(res).toMatchObject({ ok: false, status: 0 });
  });

  it('halts after 3 consecutive failures; noteSuccess resets; noteFailure counts; 404 does not', async () => {
    const h = harness((url) => robotsOpen(url) ?? new Response('', { status: 500 }));
    const s = h.host.session();
    await s.get('/1');
    await s.get('/2');
    await s.get('/3');
    expect(s.halted).toBe(true);
    const count = h.calls.length;
    await expect(s.get('/4')).rejects.toBeInstanceOf(SourceHaltedError);
    expect(h.calls.length).toBe(count);

    const h2 = harness((url) => robotsOpen(url) ?? new Response('', { status: 500 }));
    const s2 = h2.host.session();
    await s2.get('/1');
    await s2.get('/2');
    s2.noteSuccess();
    await s2.get('/3');
    expect(s2.halted).toBe(false);

    const h3 = harness((url) => robotsOpen(url) ?? ok());
    const s3 = h3.host.session();
    s3.noteFailure('bad page 1');
    s3.noteFailure('bad page 2');
    expect(s3.halted).toBe(false);
    s3.noteFailure('bad page 3');
    expect(s3.halted).toBe(true);
    expect(s3.lastFailure).toBe('bad page 3');
    await expect(s3.get('/x')).rejects.toBeInstanceOf(SourceHaltedError);

    const h4 = harness((url) => robotsOpen(url) ?? new Response('nope', { status: 404 }));
    const s4 = h4.host.session();
    for (let i = 0; i < 5; i++) {
      expect(await s4.get(`/missing${i}`)).toMatchObject({ ok: false, status: 404 });
    }
    expect(s4.halted).toBe(false);
    expect(s4.lastFailure).toBeNull();
  });

  it('fetches robots.txt once per host and refuses disallowed paths', async () => {
    const h = harness((url) =>
      url.endsWith('/robots.txt') ? ok('User-agent: *\nDisallow: /amcas/account/\nDisallow: /_internal/') : ok(),
    );
    const a = h.host.session();
    const b = h.host.session();
    const res = await a.get('/amcas/account/x');
    expect(res).toMatchObject({ ok: false, status: 0 });
    expect(h.calls.some((c) => c.url.includes('/amcas/account/x'))).toBe(false);
    expect(a.halted).toBe(false);
    expect((await b.get('/_internal/y')).ok).toBe(false);
    expect((await b.get('/fine')).ok).toBe(true);
    expect(h.calls.filter((c) => c.url.endsWith('/robots.txt')).length).toBe(1);
  });

  it('treats an unreachable robots.txt as allowed', async () => {
    const h = harness((url) => (url.endsWith('/robots.txt') ? new Error('down') : ok('page')));
    const res = await h.host.session().get('/a');
    expect(res).toMatchObject({ ok: true, body: 'page' });
  });

  it('sends If-None-Match and maps 304 to notModified', async () => {
    const h = harness((url, init) => {
      const r = robotsOpen(url);
      if (r) return r;
      expect((init.headers as Record<string, string>)['if-none-match']).toBe('"abc"');
      return new Response(null, { status: 304 });
    });
    expect(await h.host.session().get('/a', { etag: '"abc"' })).toMatchObject({
      ok: true,
      status: 304,
      notModified: true,
    });
  });

  it('rejects absolute URLs on another origin', async () => {
    const h = harness((url) => robotsOpen(url) ?? ok());
    await expect(h.host.session().get('https://evil.example/x')).rejects.toThrow(/origin/);
  });
  describe('robots.txt cache', () => {
    const robots = (h: ReturnType<typeof harness>) => h.calls.filter((c) => c.url.endsWith('/robots.txt'));
    const HOUR = 60 * 60 * 1000;

    it('refetches a successful robots.txt after 24 h, not before', async () => {
      const h = harness((url) => robotsOpen(url) ?? ok());
      const s = h.host.session();
      await s.get('/a');
      await s.get('/b');
      expect(robots(h)).toHaveLength(1);
      await h.sleepFor(23 * HOUR);
      await s.get('/c');
      expect(robots(h)).toHaveLength(1);
      await h.sleepFor(2 * HOUR);
      await s.get('/d');
      expect(robots(h)).toHaveLength(2);
    });

    it('retries a failed robots.txt fetch after 1 h instead of treating it as allow-all for the process lifetime', async () => {
      const h = harness((url) => (url.endsWith('/robots.txt') ? new Response('', { status: 404 }) : ok()));
      const s = h.host.session();
      await s.get('/a');
      await s.get('/b');
      expect(robots(h)).toHaveLength(1);
      await h.sleepFor(HOUR + 1000);
      await s.get('/c');
      expect(robots(h)).toHaveLength(2);
    });
  });

  describe('post', () => {
    const GQL = '/graphql';
    const BODY = '{"operationName":"x","query":"query x { a }","variables":{}}';
    const admit = (handler: Handler) => harness(handler, SOURCES.ADMIT);

    it('post sends POST, the body, content-type, the Origin header from config and the UA', async () => {
      const h = admit((url) => robotsOpen(url) ?? ok('{}'));
      const res = await h.host.session().post(GQL, BODY);
      expect(res.ok).toBe(true);
      const c = h.calls.find((x) => x.url.endsWith(GQL))!;
      expect(c.method).toBe('POST');
      expect(c.body).toBe(BODY);
      expect(c.headers['content-type']).toBe('application/json');
      expect(c.headers['accept']).toBe('application/json');
      expect(c.headers['origin']).toBe('https://med.admit.org');
      expect(c.headers['user-agent']).toBe(MEDSCHOOLS_USER_AGENT);
    });

    it('post and get are serialized and spaced on one host', async () => {
      const h = admit((url) => robotsOpen(url) ?? ok());
      const a = h.host.session();
      const b = h.host.session();
      await Promise.all([a.post(GQL, BODY), b.get('/x'), a.post(GQL, BODY)]);
      expect(h.maxInFlight()).toBe(1);
      const pages = h.calls.filter((c) => !c.url.endsWith('/robots.txt'));
      expect(pages.length).toBe(3);
      for (let i = 1; i < pages.length; i++) {
        expect(pages[i]!.at - pages[i - 1]!.at).toBeGreaterThanOrEqual(1000);
      }
    });

    it('post 429 with Retry-After retries the same body', async () => {
      let n = 0;
      const h = admit((url) => {
        const r = robotsOpen(url);
        if (r) return r;
        n++;
        return n === 1 ? new Response('', { status: 429, headers: { 'retry-after': '3' } }) : ok('{}');
      });
      const res = await h.host.session().post(GQL, BODY);
      expect(res.ok).toBe(true);
      expect(h.sleeps).toContain(3000);
      const posts = h.calls.filter((c) => c.method === 'POST');
      expect(posts.map((p) => p.body)).toEqual([BODY, BODY]);
    });

    it('post to a robots-disallowed path resolves { ok:false, status:0 } without fetching', async () => {
      const h = admit((url) => (url.endsWith('/robots.txt') ? ok('User-agent: *\nDisallow: /graphql') : ok()));
      const s = h.host.session();
      expect(await s.post(GQL, BODY)).toMatchObject({ ok: false, status: 0 });
      expect(h.calls.some((c) => c.method === 'POST')).toBe(false);
      expect(s.halted).toBe(false);
    });

    it('post counts toward the 3-strike halt', async () => {
      const h = admit((url) => robotsOpen(url) ?? new Response('', { status: 500 }));
      const s = h.host.session();
      for (let i = 0; i < 3; i++) expect((await s.post(GQL, BODY)).ok).toBe(false);
      expect(s.halted).toBe(true);
      await expect(s.post(GQL, BODY)).rejects.toBeInstanceOf(SourceHaltedError);
    });
  });
});

describe('jitter and the daily budget (fake clock)', () => {
  function rig(over: Partial<PoliteHostDeps> = {}, config = SOURCES.ADMIT) {
    let t = Date.UTC(2026, 10, 23, 3, 0, 0);
    const sleeps: number[] = [];
    const at: number[] = [];
    const fetchImpl = (async (input: string | URL | Request) => {
      const url = String(input);
      if (!url.endsWith('/robots.txt')) at.push(t);
      return url.endsWith('/robots.txt')
        ? new Response('User-agent: *\nAllow: /', { status: 200 })
        : new Response('{}');
    }) as typeof fetch;
    const host = createPoliteHost(config, {
      fetchImpl,
      sleep: async (ms) => {
        sleeps.push(ms);
        t += ms;
      },
      now: () => t,
      ...over,
    });
    return { host, at, sleeps, clock: () => t, advance: (ms: number) => (t += ms) };
  }
  const gaps = (at: number[]) => at.slice(1).map((x, i) => x - at[i]!);

  it('the backfill session waits at least 3 s plus 0..1 s between requests', async () => {
    for (const r of [0, 0.5, 0.999999]) {
      const h = rig({ random: () => r });
      const s = h.host.session({
        spacingMs: SOURCES.ADMIT.backfillSpacingMs,
        jitterMs: SOURCES.ADMIT.backfillJitterMs,
      });
      await s.post('/graphql', '{}');
      await s.post('/graphql', '{}');
      await s.post('/graphql', '{}');
      for (const g of gaps(h.at)) {
        expect(g).toBeGreaterThanOrEqual(3000);
        expect(g).toBeLessThanOrEqual(4000);
      }
      expect(gaps(h.at)[0]).toBe(3000 + Math.floor(r * 1001));
    }
  });

  it('the live session keeps its plain spacing: no jitter unless asked', async () => {
    const h = rig({ random: () => 0.9 });
    const s = h.host.session();
    await s.post('/graphql', '{}');
    await s.post('/graphql', '{}');
    expect(gaps(h.at)).toEqual([SOURCES.ADMIT.spacingMs]);
  });

  it('the SDN forums host spaces every session at 3 s plus jitter, live included', async () => {
    const h = rig({ random: () => 0.5 }, SOURCES.SDN_FORUMS);
    const s = h.host.session();
    await s.get('/forums/a');
    await s.get('/forums/b');
    expect(gaps(h.at)).toEqual([3000 + 500]);
  });

  it('a different jitter draw per request', async () => {
    const draws = [0, 1 - 1e-9, 0.25];
    let i = 0;
    const h = rig({ random: () => draws[i++ % draws.length]! });
    const s = h.host.session({ spacingMs: 3000, jitterMs: 1000 });
    for (let n = 0; n < 4; n++) await s.post('/graphql', '{}');
    // the first draw went to robots.txt, the next three to the requests
    expect(new Set(gaps(h.at)).size).toBeGreaterThan(1);
  });

  it('every attempt spends the budget; when it is spent the session halts and no request is made', async () => {
    const fake = createFakePrisma();
    let t = Date.UTC(2026, 10, 23, 3, 0, 0);
    const budget = createDailyBudget(
      fake.prisma,
      'ADMIT',
      () => 3,
      () => new Date(t),
    );
    const h = rig({ budget, now: () => t });
    const s = h.host.session({ spacingMs: 10 });
    // robots.txt (1) + two requests (2) = the budget of 3
    await s.post('/graphql', '{}');
    await s.post('/graphql', '{}');
    expect(h.at).toHaveLength(2);
    await expect(s.post('/graphql', '{}')).rejects.toBeInstanceOf(BudgetExhaustedError);
    expect(h.at).toHaveLength(2);
    expect(s.halted).toBe(true);
    expect(s.lastFailure).toMatch(/daily request budget/);
    await expect(s.post('/graphql', '{}')).rejects.toBeInstanceOf(SourceHaltedError);
    expect(h.at).toHaveLength(2);
    void t;
  });

  it('retries spend the budget too', async () => {
    const fake = createFakePrisma();
    const budget = createDailyBudget(
      fake.prisma,
      'ADMIT',
      () => 3,
      () => new Date(Date.UTC(2026, 10, 23)),
    );
    let n = 0;
    const fetchImpl = (async (input: string | URL | Request) => {
      n++;
      return String(input).endsWith('/robots.txt')
        ? new Response('User-agent: *\nAllow: /', { status: 200 })
        : new Response('', { status: 503 });
    }) as typeof fetch;
    const host = createPoliteHost(SOURCES.ADMIT, { fetchImpl, sleep: async () => undefined, budget });
    await expect(host.session().post('/graphql', '{}')).rejects.toBeInstanceOf(BudgetExhaustedError);
    expect(n).toBe(3); // robots.txt, then two 503 attempts, then the budget said no
  });

  it('the static user agent is matched by robots.txt: its own group wins, otherwise the * group', async () => {
    const { isPathAllowed } = await import('@/lib/rmhladder/adapters/robots');
    const robots = 'User-agent: *\nDisallow: /members/\n\nUser-agent: MarlonJack\nDisallow: /private/\n';
    expect(isPathAllowed(robots, MEDSCHOOLS_USER_AGENT, '/private/x')).toBe(false);
    expect(isPathAllowed(robots, MEDSCHOOLS_USER_AGENT, '/members/x')).toBe(true); // its own group replaces *
    const star = 'User-agent: *\nDisallow: /members/\n';
    expect(isPathAllowed(star, MEDSCHOOLS_USER_AGENT, '/members/x')).toBe(false);
    expect(isPathAllowed(star, MEDSCHOOLS_USER_AGENT, '/threads/x')).toBe(true);
    expect(MEDSCHOOLS_USER_AGENT).not.toMatch(/https?:|rmhstudios\.com\/|mozilla/i);
  });
});
