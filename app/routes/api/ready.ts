/**
 * GET /api/ready — readiness: "can this process actually serve users?"
 *
 * Deliberately the opposite of `/api/health`, which answers "is the event loop
 * accepting connections" and touches nothing. Liveness keeps the hotswap gate
 * cheap; readiness is what the status page needs, because a web container that
 * answers `/api/health` in 1ms while Postgres is unreachable is *down* to every
 * real user and `up` on a liveness-only status page. That gap is the reason
 * this endpoint exists.
 *
 * Public by design (the status service probes it through the public origin), so
 * it exposes only component name / ok / latency — never a DSN, driver message,
 * version, or row count. Results are cached briefly so a tight probe interval
 * (or a scraper that finds it) can't turn the endpoint into load.
 */

import { createFileRoute } from '@tanstack/react-router';
import { prisma } from '@/lib/prisma.server';
import { redisEnabled, redisSetJSON, redisGetJSON } from '@/lib/redis.server';

/** Component slower than this is answering, but not acceptably. */
const DEGRADED_MS = 750;
/** Serve the same snapshot for this long — probes are frequent and identical. */
const CACHE_MS = 5_000;

interface Check {
  name: string;
  ok: boolean;
  /** Present when the check completed; null when it failed outright. */
  latencyMs: number | null;
  /** Coarse, non-sensitive outcome — never a driver error string. */
  detail: string;
}

interface Readiness {
  status: 'ok' | 'degraded' | 'down';
  checkedAt: string;
  checks: Check[];
}

let cached: { at: number; body: Readiness } | null = null;

/** Run one check, converting any throw into a failed (not crashed) result. */
async function timed(name: string, fn: () => Promise<void>): Promise<Check> {
  const start = Date.now();
  try {
    await fn();
    const latencyMs = Date.now() - start;
    return {
      name,
      ok: true,
      latencyMs,
      detail: latencyMs > DEGRADED_MS ? 'slow' : 'ok',
    };
  } catch {
    // The underlying error is logged nowhere user-visible on purpose: this
    // response is public.
    return { name, ok: false, latencyMs: null, detail: 'unreachable' };
  }
}

async function collect(): Promise<Readiness> {
  const checks: Check[] = [];

  // Connectivity: does the pool hand back a working connection at all?
  checks.push(
    await timed('database', async () => {
      await prisma.$queryRaw`SELECT 1`;
    })
  );

  // A real indexed read through the Prisma client — proves the generated
  // client, the adapter and the schema all still agree with the live database,
  // which `SELECT 1` on a raw connection does not.
  checks.push(
    await timed('database-read', async () => {
      await prisma.user.findFirst({ select: { id: true }, take: 1 });
    })
  );

  // Redis is optional everywhere in this codebase (everything degrades
  // gracefully without it), so only report it when it is actually configured —
  // otherwise every deployment without Redis would read as permanently broken.
  if (redisEnabled()) {
    checks.push(
      await timed('redis', async () => {
        const key = 'status:ready-probe';
        await redisSetJSON(key, { t: Date.now() }, 10_000);
        const got = await redisGetJSON<{ t: number }>(key);
        if (!got) throw new Error('roundtrip failed');
      })
    );
  }

  const anyDown = checks.some((c) => !c.ok);
  const anySlow = checks.some((c) => c.ok && c.detail === 'slow');

  return {
    status: anyDown ? 'down' : anySlow ? 'degraded' : 'ok',
    checkedAt: new Date().toISOString(),
    checks,
  };
}

export const Route = createFileRoute('/api/ready')({
  server: {
    handlers: {
      GET: async () => {
        try {
          const now = Date.now();
          if (!cached || now - cached.at > CACHE_MS) {
            cached = { at: now, body: await collect() };
          }
          const body = cached.body;
          return Response.json(body, {
            // 503 on `down` so any generic HTTP monitor — not just our own
            // status service — treats an unreachable database as a failure.
            status: body.status === 'down' ? 503 : 200,
            headers: { 'Cache-Control': 'no-store' },
          });
        } catch (error) {
          console.error('readiness probe error:', error);
          return Response.json(
            { status: 'down', checkedAt: new Date().toISOString(), checks: [] },
            { status: 503, headers: { 'Cache-Control': 'no-store' } }
          );
        }
      },
    },
  },
});
