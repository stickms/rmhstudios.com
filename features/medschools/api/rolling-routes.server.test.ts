import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handlersOf } from '@/lib/__tests__/api-handlers-of';
import { clearResponseCache } from '@/lib/api/response-cache.server';

const mocks = vi.hoisted(() => ({ session: vi.fn(), getRollingGuidance: vi.fn() }));
vi.mock('@/lib/auth', () => ({ auth: { api: { getSession: mocks.session } } }));
vi.mock('@/lib/prisma.server', () => ({ prisma: {} }));
vi.mock('@/lib/rate-limit.server', () => ({ withRateLimitAsync: async () => null }));
vi.mock('./rolling-guidance.server', () => ({ getRollingGuidance: mocks.getRollingGuidance }));

import { route } from './medschools.me.rolling.server';

type Handler = (ctx: { request: Request; params: Record<string, string> }) => Promise<Response>;
const call = (query: string, cookie = 'better-auth.session_token=t') =>
  handlersOf<Handler>(route)['GET']!({
    params: {},
    request: new Request(`https://rmhstudios.com/api/medschools/me/rolling${query}`, {
      method: 'GET',
      headers: cookie ? { cookie } : {},
    }),
  });

beforeEach(() => {
  vi.clearAllMocks();
  clearResponseCache();
  mocks.session.mockResolvedValue({ user: { id: 'u1', isAdmin: false } });
  mocks.getRollingGuidance.mockResolvedValue({ cycleYear: 2027, source: 'list', entries: [], schoolCount: 0 });
});

describe('GET me/rolling (private)', () => {
  it('signed out is 401 and the service is not called', async () => {
    mocks.session.mockResolvedValue(null);
    expect((await call('?source=tracker')).status).toBe(401);
    expect(mocks.getRollingGuidance).not.toHaveBeenCalled();
  });

  it('takes the user id from the session, is never publicly cached and sets no etag', async () => {
    const res = await call('?source=list&list=L1');
    expect(res.status).toBe(200);
    expect(mocks.getRollingGuidance).toHaveBeenCalledWith('u1', { source: 'list', list: 'L1' });
    expect(res.headers.get('cache-control') ?? '').not.toContain('public');
    expect(res.headers.get('etag')).toBeNull();
  });

  it('a list source needs a list, and a tracker source takes none (400)', async () => {
    expect((await call('?source=list')).status).toBe(400);
    expect((await call('?source=tracker&list=L1')).status).toBe(400);
    expect((await call('')).status).toBe(400);
  });

  it("another member's list is a 404 with the same body as an unknown one", async () => {
    mocks.getRollingGuidance.mockResolvedValue('not-found');
    const res = await call('?source=list&list=theirs');
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'Not found' });
  });
});
