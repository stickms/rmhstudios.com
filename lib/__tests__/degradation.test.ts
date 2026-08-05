import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * ──────────── what still works when a dependency is gone (E8) ────────────
 *
 * Almost every optional dependency in this codebase is documented as
 * "degrades gracefully": Redis (`lib/redis.server.ts` — "entirely optional…
 * every helper degrades to a no-op/null"), object storage (`s3Configured()`
 * falls back to the local filesystem), web push (no VAPID keys → notifications
 * simply don't mirror), AI (`isAITextConfigured()` gates every call site).
 *
 * The failure mode this file exists for is that "degrades gracefully" is
 * ambiguous in exactly the wrong direction, and prose cannot disambiguate it.
 * For a *cache* it means "slower". For a **rate limiter** it could mean either
 * "looser" (the counters go per-process instead of shared) or "absent" (the
 * check returns nothing and the route runs unprotected) — and only one of those
 * is a graceful degradation. The second is an availability bug that turns into
 * a security bug the moment Redis blips: every write endpoint on the site
 * unthrottled, silently, with no error anywhere because the code "handled" the
 * outage.
 *
 * `checkRateLimit` gets that right today (Redis miss → `rateLimit()` from
 * `lib/rate-limit.ts`, which still counts, just per-process). This test pins it
 * so a future refactor of the Redis path cannot quietly turn the `return null`
 * on the Redis side into an early `return { allowed: true }` on the caller side.
 *
 * These assertions are deliberately runnable with **no live dependency at all**
 * — no Postgres, no Redis, no network. A degradation test that needs the thing
 * it is testing the absence of never runs in CI, which is why the matrix at the
 * bottom carries the entries that cannot be executed here.
 */

/**
 * Redis is absent for this whole file. `lib/rate-limit.server.ts` imports
 * exactly one symbol from the backplane, and `null` is what the real module
 * returns when `REDIS_URL` is unset (`redisRateLimit` → `init()` →
 * `if (!statePublisher) return null`), so this mock reproduces the unconfigured
 * production path rather than inventing a new one. Mocking also keeps `ioredis`
 * out of the test process entirely.
 */
const redisRateLimit = vi.fn<
  (
    key: string,
    limit: number,
    windowMs: number,
  ) => Promise<{
    allowed: boolean;
    retryAfter: number;
    limit: number;
    remaining: number;
    reset: number;
  } | null>
>(async () => null);

vi.mock('@/lib/redis.server', () => ({
  redisRateLimit: (key: string, limit: number, windowMs: number) =>
    redisRateLimit(key, limit, windowMs),
}));

import { checkRateLimit, distributedLimitsAvailable } from '@/lib/rate-limit.server';
import { RATE_LIMIT_MULTIPLIER, type RateLimitResult } from '@/lib/rate-limit';

/** A fresh bucket per assertion, so ordering between tests cannot matter. */
let bucket = 0;
const nextPrefix = (): string => `degradation-${bucket++}`;

beforeEach(() => {
  redisRateLimit.mockClear();
});

describe('Redis down — rate limiting gets LOOSER, never absent', () => {
  it('still returns a well-formed RateLimitResult', async () => {
    const result: RateLimitResult = await checkRateLimit('1.2.3.4', {
      limit: 5,
      windowMs: 60_000,
      prefix: nextPrefix(),
    });

    // The shape is the contract `withRateLimitAsync` turns into `Retry-After` /
    // `X-RateLimit-*` headers. A partially-populated object here becomes
    // `X-RateLimit-Limit: undefined` on the wire.
    expect(result.allowed).toBe(true);
    expect(typeof result.retryAfter).toBe('number');
    expect(typeof result.limit).toBe('number');
    expect(typeof result.remaining).toBe('number');
    expect(typeof result.reset).toBe('number');
    expect(result.limit).toBeGreaterThan(0);
    expect(result.remaining).toBe(result.limit - 1);
    expect(result.reset).toBeGreaterThan(Date.now());
  });

  it('consults Redis first, then falls through — the fallback is a FALLBACK', async () => {
    // If this ever stops being called, the shared-counter path has been dropped
    // and every instance is limiting on its own again with nobody noticing.
    await checkRateLimit('1.2.3.4', { limit: 5, windowMs: 60_000, prefix: nextPrefix() });
    expect(redisRateLimit).toHaveBeenCalledTimes(1);
  });

  it('still blocks once the in-process ceiling is passed', async () => {
    const prefix = nextPrefix();
    const limit = 3;
    // The in-process limiter applies the global generosity multiplier itself,
    // so the real ceiling is `limit × RATE_LIMIT_MULTIPLIER`. Drive past it,
    // with headroom, and assert it closes — this is the whole point of the
    // file: "no Redis" must not mean "no limit".
    const ceiling = Math.ceil(limit * RATE_LIMIT_MULTIPLIER);
    let last: RateLimitResult | null = null;
    for (let i = 0; i < ceiling + 1; i++) {
      last = await checkRateLimit('5.6.7.8', { limit, windowMs: 60_000, prefix });
    }

    expect(last?.allowed).toBe(false);
    expect(last?.remaining).toBe(0);
    expect(last?.retryAfter).toBeGreaterThan(0);
  });

  it('is looser than the configured limit, not tighter — a fallback must not lock users out', async () => {
    // The other way this could fail badly: a fallback that returns
    // `{ allowed: false }` on a Redis miss would take the site down every time
    // the cache blinked. The first request through a cold bucket is allowed.
    const first = await checkRateLimit('9.9.9.9', {
      limit: 1,
      windowMs: 60_000,
      prefix: nextPrefix(),
    });
    expect(first.allowed).toBe(true);
    // …and the effective ceiling is at least the requested limit.
    expect(first.limit).toBeGreaterThanOrEqual(1);
  });

  it('honours applyMultiplier:false without dropping the limit entirely', async () => {
    // Security-critical limiters (auth, abuse) opt out of the multiplier. The
    // fallback emulates that by pre-dividing; the risk is an off-by-a-factor
    // that silently un-limits the most sensitive endpoints on the site.
    const prefix = nextPrefix();
    const limit = 8;
    let last: RateLimitResult | null = null;
    for (let i = 0; i < limit + 4; i++) {
      last = await checkRateLimit('4.4.4.4', {
        limit,
        windowMs: 60_000,
        prefix,
        applyMultiplier: false,
      });
    }
    expect(last?.allowed).toBe(false);
  });

  it('reports that distributed limits are unavailable rather than pretending', async () => {
    // Honest self-reporting is what makes the looseness auditable — the ops
    // runbook can alert on it instead of discovering it during an incident.
    const saved = {
      url: process.env.REDIS_URL,
      conn: process.env.REDIS_CONNECTION_STRING,
      state: process.env.REDIS_STATE_URL,
    };
    delete process.env.REDIS_URL;
    delete process.env.REDIS_CONNECTION_STRING;
    delete process.env.REDIS_STATE_URL;
    try {
      expect(distributedLimitsAvailable()).toBe(false);
    } finally {
      if (saved.url !== undefined) process.env.REDIS_URL = saved.url;
      if (saved.conn !== undefined) process.env.REDIS_CONNECTION_STRING = saved.conn;
      if (saved.state !== undefined) process.env.REDIS_STATE_URL = saved.state;
    }
  });
});

describe('AI unconfigured — the module graph still loads', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('reports itself unconfigured with DEEPSEEK_API_KEY unset', async () => {
    vi.stubEnv('DEEPSEEK_API_KEY', '');
    const { isAITextConfigured } = await import('@/lib/ai/text.server');
    expect(isAITextConfigured()).toBe(false);
  });

  it('imports cleanly anyway — AI off must not break unrelated routes', async () => {
    // `lib/ai/text.server.ts` constructs the OpenAI client at MODULE scope. If
    // that constructor were ever allowed to throw on a missing key (the SDK's
    // default behaviour, which the `|| 'missing'` placeholder exists to avoid),
    // the throw would happen at import time — so every route that imports this
    // module for one optional feature would 500 on a deployment with no AI key,
    // not just the AI endpoints. That is a whole-module-graph failure caused by
    // an unset optional env var, and it is invisible in any environment where
    // the key happens to be set.
    vi.stubEnv('DEEPSEEK_API_KEY', '');
    const mod = await import('@/lib/ai/text.server');
    expect(typeof mod.transformText).toBe('function');
    expect(typeof mod.translateText).toBe('function');
    expect(typeof mod.isAITextConfigured).toBe('function');
  });
});

/**
 * ───────────────────────── the degradation matrix ─────────────────────────
 *
 * The table of record for "what happens when X is gone". It is data, not prose,
 * for two reasons: the test below can enforce that every row is actually filled
 * in, and a row is a place to hang an executable check when one becomes
 * possible. `verified: 'test'` rows are proven above; `verified: 'review'` rows
 * need a live dependency (or its absence) that a unit test cannot arrange, so
 * they are documentation with a shape — the point of writing them down is that
 * a reviewer touching that subsystem can see what behaviour was promised.
 *
 * `severity` records what the user actually experiences, and is the field to
 * argue about in review:
 *   - 'transparent' — nothing user-visible; the system is slower or less
 *     efficient and that is all.
 *   - 'reduced'     — a named feature stops working, cleanly, by design.
 *   - 'unsafe'      — the degradation weakens a guarantee (a limit, an
 *     isolation boundary). Allowed only where the alternative is a hard outage,
 *     and always paired with a way to detect it.
 *   - 'fatal'       — not optional at all. Listing it here is the point: it
 *     stops someone assuming a fallback exists.
 */
interface DegradationEntry {
  /** The dependency, named as it appears in config. */
  dependency: string;
  /** The subsystems that read it. */
  affects: string;
  /** What the platform does when it is absent. Must be specific. */
  expectation: string;
  severity: 'transparent' | 'reduced' | 'unsafe' | 'fatal';
  /** 'test' — asserted in this file. 'review' — needs a live/absent dependency. */
  verified: 'test' | 'review';
}

const DEGRADATION_MATRIX: readonly DegradationEntry[] = [
  {
    dependency: 'REDIS_URL / REDIS_STATE_URL (rate limiting)',
    affects: 'lib/rate-limit.server.ts → checkRateLimit, withRateLimitAsync',
    expectation:
      'Counters fall back to the in-process limiter in lib/rate-limit.ts. Limits are ' +
      'still enforced, but per-process: the effective ceiling becomes ' +
      'limit x RATE_LIMIT_MULTIPLIER x live web processes, and every deploy resets ' +
      'the window. Looser, never absent. distributedLimitsAvailable() reports false ' +
      'so the looseness is detectable rather than assumed.',
    severity: 'unsafe',
    verified: 'test',
  },
  {
    dependency: 'REDIS_URL (pub/sub backplane)',
    affects: 'lib/realtime-bus.server.ts → every SSE stream, feed fan-out, presence',
    expectation:
      'createBus degrades to a process-local EventEmitter. Events still reach clients ' +
      'connected to the SAME web process; a client on the other half of a blue/green ' +
      'pair (7005 vs 7015) misses them until it refetches. No error surfaces.',
    severity: 'reduced',
    verified: 'review',
  },
  {
    dependency: 'REDIS_URL (cache plane)',
    affects: 'lib/cache.ts apiCache L2, ranking cache, user-display map',
    expectation:
      'Reads miss and fall through to Postgres. enableOfflineQueue:false on the ' +
      'command connections is load-bearing here: with ioredis buffering instead, a ' +
      'miss awaits a reconnect that never settles and the request hangs (~28s on the ' +
      'anonymous homepage) instead of degrading to a database read.',
    severity: 'transparent',
    verified: 'review',
  },
  {
    dependency: 'DEEPSEEK_API_KEY',
    affects: 'lib/ai/text.server.ts, ai/recap, ai/summarize, rmhark-ai bot',
    expectation:
      'isAITextConfigured() returns false and each call site returns an empty result ' +
      'or a 503 rather than calling out. The module still imports — the OpenAI client ' +
      "is constructed with a 'missing' placeholder key at module scope, so an unset " +
      'key cannot break the import graph for routes that only touch AI optionally.',
    severity: 'reduced',
    verified: 'test',
  },
  {
    dependency: 'S3_BUCKET / S3_ENDPOINT / S3_ACCESS_KEY_ID / S3_SECRET_ACCESS_KEY',
    affects: 'lib/storage/s3.server.ts → avatars, feed images, library files, uploads',
    expectation:
      's3Configured() returns false and objects are written to the local filesystem ' +
      'under LOCAL_ROOT, with a one-time console warning. Uploads keep working; the ' +
      'files are node-local, so a multi-instance deployment serves 404s for anything ' +
      'stored on the other instance.',
    severity: 'unsafe',
    verified: 'review',
  },
  {
    dependency: 'VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY',
    affects: 'lib/push/send.server.ts → web push mirroring of notifications',
    expectation:
      'Push is marked unconfigured once (the flag is memoised) and every send is a ' +
      'no-op. In-app notifications are unaffected — the database row is still ' +
      'created; only the browser push mirror is skipped.',
    severity: 'reduced',
    verified: 'review',
  },
  {
    dependency: 'DATABASE_URL',
    affects: 'everything',
    expectation:
      'No fallback exists and none should be added. Postgres is the system of record; ' +
      'a cached-read degradation would serve stale coin balances and stale ' +
      'entitlements. Routes fail closed: defineHandler turns the thrown Prisma error ' +
      'into a bare 500 with no message leaked.',
    severity: 'fatal',
    verified: 'review',
  },
] as const;

describe('the degradation matrix is complete', () => {
  it('documents a non-trivial set of dependencies', () => {
    expect(DEGRADATION_MATRIX.length).toBeGreaterThanOrEqual(5);
  });

  it('fills in every field of every row', () => {
    // A half-filled table is worse than no table: it reads as "reviewed" while
    // the empty cell is the one nobody thought about. Each row must say what
    // happens, in a sentence, not a shrug.
    const incomplete: string[] = [];
    for (const entry of DEGRADATION_MATRIX) {
      if (entry.dependency.trim() === '') incomplete.push('(unnamed row) — empty dependency');
      if (entry.affects.trim() === '') incomplete.push(`${entry.dependency} — empty affects`);
      if (entry.expectation.trim().length < 40) {
        incomplete.push(
          `${entry.dependency} — expectation is missing or too short to be specific ` +
            `(got ${entry.expectation.trim().length} chars)`,
        );
      }
    }
    expect(
      incomplete,
      `\nIncomplete degradation matrix rows:\n${incomplete.map((s) => `  ${s}`).join('\n')}\n\n` +
        `Every row states what the platform DOES when the dependency is absent — ` +
        `"degrades gracefully" is exactly the phrase this table exists to replace.\n`,
    ).toEqual([]);
  });

  it('names each dependency once', () => {
    const names = DEGRADATION_MATRIX.map((e) => e.dependency);
    expect(new Set(names).size, `duplicate rows: ${names.join(', ')}`).toBe(names.length);
  });

  it('keeps every `unsafe` degradation paired with a way to detect it', () => {
    // An 'unsafe' row is a deliberate trade: a weaker guarantee instead of an
    // outage. That is only defensible if the weakened state is observable —
    // otherwise it is just a silent hole that shows up in a post-mortem.
    const undetectable = DEGRADATION_MATRIX.filter(
      (e) => e.severity === 'unsafe' && !/report|warn|detect|log|false/i.test(e.expectation),
    ).map((e) => e.dependency);
    expect(
      undetectable,
      `\nThese degradations weaken a guarantee without saying how anyone would know:\n` +
        `${undetectable.map((s) => `  ${s}`).join('\n')}\n\n` +
        `Say what surfaces it — a configured() predicate, a startup warning, a log line.\n`,
    ).toEqual([]);
  });

  it('proves the rows it claims to prove', () => {
    // Guards against a row being downgraded to `verified: 'test'` as a
    // paperwork exercise. The two tested dependencies are the ones with
    // assertions above; adding a third means adding the assertions too.
    const tested = DEGRADATION_MATRIX.filter((e) => e.verified === 'test').map((e) => e.dependency);
    expect(tested).toEqual(['REDIS_URL / REDIS_STATE_URL (rate limiting)', 'DEEPSEEK_API_KEY']);
  });
});
