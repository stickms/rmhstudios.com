import { describe, expect, it } from 'vitest';
import { createPoliteHost, SourceHaltedError } from './http';
import { MEDSCHOOLS_USER_AGENT, SOURCES } from './sources';

type Handler = (url: string, init: RequestInit, n: number) => Response | Promise<Response> | Error;

function harness(handler: Handler, config = SOURCES.CYCLETRACK) {
  let t = 1_000_000;
  const sleeps: number[] = [];
  const calls: { url: string; at: number; headers: Record<string, string> }[] = [];
  let inFlight = 0;
  let maxInFlight = 0;
  const fetchImpl = (async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = String(input);
    inFlight++;
    maxInFlight = Math.max(maxInFlight, inFlight);
    calls.push({ url, at: t, headers: { ...(init.headers as Record<string, string>) } });
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
    expect(MEDSCHOOLS_USER_AGENT).toBe('RMHStudiosMedSchools/1.0 (+https://rmhstudios.com/rmh-medschool)');
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
});
