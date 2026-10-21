/**
 * `x-rmh-queries` — the bench-only query-count header (`server/nitro/otel.ts`).
 *
 * Server-Timing is readable by any page script, and this header would hand the
 * same audience a per-request database call count. So the property under test
 * is the default: absent unless `RMH_PERF_HEADERS=1`, and a bare integer when
 * present.
 */

import { describe, it, expect, afterEach } from 'vitest';

type Hook = (...args: unknown[]) => void;

async function loadPlugin() {
  process.env.DATABASE_URL ||= 'postgresql://perf:perf@127.0.0.1:1/perf';
  const mod = await import('@/server/nitro/otel');
  const prisma = await import('@/lib/prisma.server');
  const hooks = new Map<string, Hook>();
  mod.default({ hooks: { hook: (name, fn) => void hooks.set(name, fn as Hook) } });
  // The plugin loads the budget API asynchronously; let that settle.
  await new Promise((r) => setTimeout(r, 50));
  return { hooks, prisma };
}

/** One request through the plugin: n recorded queries, then the response hook. */
async function runRequest(n: number): Promise<Headers> {
  const { hooks, prisma } = await loadPlugin();
  const event = { req: { url: '/api/x/y', method: 'GET', headers: new Headers() } };
  const res = { headers: new Headers() };
  await new Promise<void>((resolve) => {
    setImmediate(() => {
      hooks.get('request')!(event);
      for (let i = 0; i < n; i++) prisma.recordQuery('User', 'findFirst');
      hooks.get('response')!(res, event);
      resolve();
    });
  });
  return res.headers;
}

const SAVED = process.env.RMH_PERF_HEADERS;
afterEach(() => {
  if (SAVED === undefined) delete process.env.RMH_PERF_HEADERS;
  else process.env.RMH_PERF_HEADERS = SAVED;
});

describe('x-rmh-queries', () => {
  it('is absent by default', async () => {
    delete process.env.RMH_PERF_HEADERS;
    const headers = await runRequest(3);
    expect(headers.has('x-rmh-queries')).toBe(false);
    // The always-on header is unaffected.
    expect(headers.get('server-timing')).toContain('total;dur=');
  });

  it('is absent for any value other than "1"', async () => {
    for (const v of ['0', 'true', '', 'yes']) {
      process.env.RMH_PERF_HEADERS = v;
      expect((await runRequest(2)).has('x-rmh-queries')).toBe(false);
    }
  });

  it('carries the bare query count when RMH_PERF_HEADERS=1', async () => {
    process.env.RMH_PERF_HEADERS = '1';
    expect((await runRequest(4)).get('x-rmh-queries')).toBe('4');
    expect((await runRequest(0)).get('x-rmh-queries')).toBe('0');
  });

  it('never leaks into Server-Timing', async () => {
    process.env.RMH_PERF_HEADERS = '1';
    expect((await runRequest(2)).get('server-timing')).not.toContain('quer');
  });
});
