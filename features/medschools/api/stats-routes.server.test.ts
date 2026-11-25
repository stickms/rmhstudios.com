import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handlersOf } from '@/lib/__tests__/api-handlers-of';

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  getStats: vi.fn(),
  putStats: vi.fn(),
  clearStats: vi.fn(),
  skipOnboarding: vi.fn(),
}));
vi.mock('@/lib/auth', () => ({ auth: { api: { getSession: mocks.session } } }));
vi.mock('@/lib/prisma.server', () => ({ prisma: {} }));
vi.mock('@/lib/rate-limit.server', () => ({ withRateLimitAsync: async () => null }));
vi.mock('./stats.server', () => ({
  getStats: mocks.getStats,
  putStats: mocks.putStats,
  clearStats: mocks.clearStats,
  skipOnboarding: mocks.skipOnboarding,
}));

import { route as stats } from './medschools.me.stats.server';
import { route as onboarding } from './medschools.me.stats.onboarding.server';

type Handler = (ctx: { request: Request; params: Record<string, string> }) => Promise<Response>;
const call = (route: unknown, method: string, body?: unknown) =>
  handlersOf<Handler>(route)[method]!({
    params: {},
    request: new Request('https://rmhstudios.com/api/medschools/me/stats', {
      method,
      headers: { cookie: 'better-auth.session_token=t', 'content-type': 'application/json' },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    }),
  });

const all: Array<[string, unknown, string, unknown, ReturnType<typeof vi.fn>]> = [
  ['GET stats', stats, 'GET', undefined, mocks.getStats],
  ['PUT stats', stats, 'PUT', { gpa: { cumulative: 3.8 } }, mocks.putStats],
  ['DELETE stats', stats, 'DELETE', undefined, mocks.clearStats],
  ['PUT onboarding', onboarding, 'PUT', { state: 'skipped' }, mocks.skipOnboarding],
];

beforeEach(() => {
  vi.clearAllMocks();
  mocks.session.mockResolvedValue({ user: { id: 'u1' } });
  for (const [, , , , fn] of all) fn.mockResolvedValue({ stats: null, onboarding: 'done', homeState: null });
});

describe('me/stats routes', () => {
  it.each(all)('%s: signed out is 401 and nothing is read or written', async (_n, route, method, body, svc) => {
    mocks.session.mockResolvedValue(null);
    expect((await call(route, method, body)).status).toBe(401);
    expect(svc).not.toHaveBeenCalled();
  });

  it.each(all)('%s: the user id comes from the session; never publicly cached', async (_n, route, method, body, svc) => {
    const res = await call(route, method, body);
    expect(res.status).toBe(200);
    expect(svc.mock.calls[0]?.[0]).toBe('u1');
    const cc = res.headers.get('cache-control') ?? '';
    expect(cc).not.toMatch(/public|s-maxage/);
    expect(res.headers.get('etag')).toBeNull();
  });

  it('a body with a userId, an unknown key or a value out of range is a 400 and never reaches the service', async () => {
    for (const body of [
      { userId: 'u2' },
      { gpa: { cumulative: 5 } },
      { mcat: [{ year: 2026, month: 4, total: 600 }] },
      { notes: 'free text the schema does not have' },
    ]) {
      expect((await call(stats, 'PUT', body)).status).toBe(400);
    }
    expect((await call(onboarding, 'PUT', { state: 'done' })).status).toBe(400);
    expect(mocks.putStats).not.toHaveBeenCalled();
    expect(mocks.skipOnboarding).not.toHaveBeenCalled();
  });
});
