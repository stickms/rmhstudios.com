/**
 * WS4 — `GET /api/feedback` read every feedback row ever submitted (public, no
 * `take`). It is now newest-100 with a column select.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { findMany } = vi.hoisted(() => ({ findMany: vi.fn() }));

const getSession = vi.hoisted(() => vi.fn());
vi.mock('@/lib/auth', () => ({ auth: { api: { getSession } } }));
vi.mock('@/lib/rate-limit', () => ({ rateLimit: vi.fn(), getClientIp: vi.fn() }));
vi.mock('@/lib/prisma.server', () => ({ prisma: { feedback: { findMany } } }));
vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (config: unknown) => ({ options: config }),
}));

import { Route } from '@/app/routes/api/feedback';

const ADMIN = { user: { id: 'a1', name: 'Root', isAdmin: true } };
beforeEach(() => {
  findMany.mockReset().mockResolvedValue([]);
  getSession.mockReset().mockResolvedValue(ADMIN);
});

type Get = (a: { request: Request; params: Record<string, string> }) => Promise<Response>;
const getHandler = () =>
  (Route as unknown as { options: { server: { handlers: { GET: Get } } } }).options.server.handlers
    .GET;
const call = () =>
  getHandler()({
    params: {},
    request: new Request('https://x.test/api/feedback', {
      headers: { cookie: 'better-auth.session_token=abc', 'cf-connecting-ip': '1.2.3.4' },
    }),
  });

describe('GET /api/feedback', () => {
  it('reads at most 100 newest rows, selecting only returned columns', async () => {
    const res = await call();
    expect(res.status).toBe(200);
    expect(findMany).toHaveBeenCalledTimes(1);
    const args = findMany.mock.calls[0][0];
    expect(args.take).toBe(100);
    expect(args.orderBy).toEqual({ createdAt: 'desc' });
    expect(args.include).toBeUndefined();
    expect(Object.keys(args.select).sort()).toEqual([
      'category',
      'createdAt',
      'id',
      'message',
      'user',
    ]);
  });

  it('is admin only: 401 anonymous, 403 non-admin, and never reads the table for them', async () => {
    getSession.mockResolvedValue(null);
    expect((await call()).status).toBe(401);
    getSession.mockResolvedValue({ user: { id: 'u1', name: 'Ada', isAdmin: false } });
    expect((await call()).status).toBe(403);
    expect(findMany).not.toHaveBeenCalled();
  });
});
