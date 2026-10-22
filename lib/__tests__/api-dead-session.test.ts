/**
 * `auth: 'optional'` makes the wrapper resolve a session on every request so the
 * handler can branch on the viewer. A handler that never reads the viewer pays
 * that lookup for nothing — and, worse, cannot take a public cache policy.
 *
 * `scripts/api-cache-triage.ts` flags those (`deadSession`): `optional`, no
 * session / cookie / header / viewer use anywhere in the handler or the repo
 * functions it calls, no per-user rate-limit scope, no membership gate. This file
 * pins that none are left in the routes WS3 may edit, and that the eight that were
 * converted really do resolve zero sessions per request (it was one).
 */
import { describe, expect, it, vi } from 'vitest';

const { getSession } = vi.hoisted(() => ({ getSession: vi.fn() }));

vi.mock('@/lib/auth', () => ({
  auth: { api: { getSession: (...a: unknown[]) => getSession(...a) } },
}));
vi.mock('@/lib/prisma.server', () => {
  const make = (): unknown =>
    new Proxy(function () {}, {
      get: (_t, prop) => (prop === 'then' ? undefined : make()),
      apply: async () => [],
    });
  return { prisma: make(), prismaRead: make() };
});

import { triage } from '../../scripts/api-cache-triage';

const rows = triage();

const loaders = import.meta.glob('../../app/routes/api/**/*.ts') as Record<
  string,
  () => Promise<{ Route?: { options?: { server?: { handlers?: Record<string, unknown> } } } }>
>;

type Handler = (a: { request: Request; params: Record<string, string> }) => Promise<Response>;

const FORMERLY_DEAD_SESSION = [
  '/api/slice-it/showcase',
  '/api/ai/takeaways',
  '/api/canvas/log',
  '/api/canvas/state',
  '/api/slice-it/replay',
  '/api/slice-it/replay/$id',
  '/api/handles/history',
];

describe('dead session lookups', () => {
  it('no auth: optional handler in a WS3-editable route pays for a session nothing reads', () => {
    expect(rows.filter((r) => r.deadSession && r.owner === 'WS3').map((r) => r.url)).toEqual([]);
  });

  it.each(FORMERLY_DEAD_SESSION)('%s resolves no session', async (url) => {
    const row = rows.find((r) => r.url === url && r.method === 'GET')!;
    expect(row.auth).toBe('none');

    const mod = await loaders[`../../${row.file}`]();
    const GET = (mod.Route?.options?.server?.handlers as Record<string, Handler>).GET;
    getSession.mockReset();
    getSession.mockResolvedValue({ user: { id: 'viewer-1' } });

    await GET({
      request: new Request(
        `https://rmhstudios.com${url.replace(/\$[A-Za-z]+/g, 'x')}?id=x&slug=x&songId=x&userIds=a&handle=x`,
        { headers: { cookie: 'better-auth.session_token=abc', 'cf-connecting-ip': '10.9.9.9' } },
      ),
      params: Object.fromEntries([...url.matchAll(/\$([A-Za-z]+)/g)].map((m) => [m[1], 'x'])),
    });
    expect(getSession).not.toHaveBeenCalled();
  });
});
