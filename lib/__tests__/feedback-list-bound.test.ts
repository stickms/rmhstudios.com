/**
 * WS4 — `GET /api/feedback` read every feedback row ever submitted (public, no
 * `take`). It is now newest-100 with a column select.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { findMany } = vi.hoisted(() => ({ findMany: vi.fn() }));

vi.mock('@/lib/api/handler.server', () => ({
  defineHandler: (_opts: unknown, fn: (ctx: unknown) => unknown) => fn,
}));
vi.mock('@/lib/auth', () => ({ auth: {} }));
vi.mock('@/lib/rate-limit', () => ({ rateLimit: vi.fn(), getClientIp: vi.fn() }));
vi.mock('@/lib/prisma.server', () => ({ prisma: { feedback: { findMany } } }));
vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (config: unknown) => ({ options: config }),
}));

import { Route } from '@/app/routes/api/feedback';

beforeEach(() => findMany.mockReset().mockResolvedValue([]));

describe('GET /api/feedback', () => {
  it('reads at most 100 newest rows, selecting only returned columns', async () => {
    const handlers = (
      Route as unknown as {
        options: { server: { handlers: { GET: () => Promise<Response> } } };
      }
    ).options.server.handlers;
    const res = await handlers.GET();
    expect(res.status).toBe(200);
    expect(findMany).toHaveBeenCalledTimes(1);
    const args = findMany.mock.calls[0][0];
    expect(args.take).toBe(100);
    expect(args.orderBy).toEqual({ createdAt: 'desc' });
    expect(args.include).toBeUndefined();
    expect(Object.keys(args.select).sort()).toEqual(['category', 'createdAt', 'id', 'message', 'user']);
  });
});
