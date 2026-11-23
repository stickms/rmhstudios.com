import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handlersOf } from '@/lib/__tests__/api-handlers-of';
import { clearResponseCache } from '@/lib/api/response-cache.server';

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  getSchoolSecondaries: vi.fn(),
  getOverlap: vi.fn(),
  recordSchoolPrompts: vi.fn(),
  fetch: vi.fn(),
}));
vi.mock('@/lib/auth', () => ({ auth: { api: { getSession: mocks.session } } }));
vi.mock('@/lib/prisma.server', () => ({ prisma: {} }));
vi.mock('@/lib/rate-limit.server', () => ({ withRateLimitAsync: async () => null }));
vi.mock('./secondaries.server', () => ({ getSchoolSecondaries: mocks.getSchoolSecondaries }));
vi.mock('./secondaries-overlap.server', () => ({ getOverlap: mocks.getOverlap }));
vi.mock('./secondaries-admin.server', () => ({ recordSchoolPrompts: mocks.recordSchoolPrompts }));

import { route as publicRoute } from './medschools.schools.$slug.secondaries.server';
import { route as overlapRoute } from './medschools.me.secondaries.overlap.server';
import { route as adminRoute } from './admin.medschools.secondaries.server';

type Handler = (ctx: { request: Request; params: Record<string, string> }) => Promise<Response>;
const call = (
  route: unknown,
  method: string,
  o: { query?: string; params?: Record<string, string>; body?: unknown; cookie?: string } = {},
) =>
  handlersOf<Handler>(route)[method]!({
    params: o.params ?? {},
    request: new Request(`https://rmhstudios.com/api/medschools/x${o.query ?? ''}`, {
      method,
      headers: {
        ...(o.cookie !== '' ? { cookie: o.cookie ?? 'better-auth.session_token=t' } : {}),
        'content-type': 'application/json',
      },
      ...(o.body !== undefined ? { body: JSON.stringify(o.body) } : {}),
    }),
  });

beforeEach(() => {
  vi.clearAllMocks();
  clearResponseCache();
  vi.stubGlobal('fetch', mocks.fetch);
  mocks.session.mockResolvedValue({ user: { id: 'u1', isAdmin: false } });
  mocks.getSchoolSecondaries.mockResolvedValue({
    cycleYear: 2027,
    groups: [],
    sources: [],
    admissions: [],
    turnaround: [],
  });
  mocks.getOverlap.mockResolvedValue({
    cycleYear: 2027,
    source: 'list',
    groups: [],
    withoutPrompts: [],
    schoolCount: 0,
  });
  mocks.recordSchoolPrompts.mockResolvedValue({ prompts: 1, created: 1, rejected: 0 });
});

describe('GET schools/$slug/secondaries (public)', () => {
  it('answers anonymously with the exact public cache header', async () => {
    mocks.session.mockResolvedValue(null);
    const res = await call(publicRoute, 'GET', { params: { slug: 'duke' }, cookie: '' });
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('public, max-age=300, s-maxage=900, stale-while-revalidate=3600');
  });

  it('is byte-identical for any viewer and never reads the session', async () => {
    mocks.session.mockResolvedValue(null);
    const a = await (await call(publicRoute, 'GET', { params: { slug: 'duke' }, cookie: '' })).text();
    clearResponseCache();
    mocks.session.mockResolvedValue({ user: { id: 'u1' } });
    const b = await (
      await call(publicRoute, 'GET', { params: { slug: 'duke' }, cookie: 'better-auth.session_token=t' })
    ).text();
    expect(a).toBe(b);
    expect(mocks.session).not.toHaveBeenCalled();
  });

  it('is a 404 for an unknown slug and a 400 for a bad program', async () => {
    mocks.getSchoolSecondaries.mockResolvedValue(null);
    expect((await call(publicRoute, 'GET', { params: { slug: 'nope' } })).status).toBe(404);
    expect((await call(publicRoute, 'GET', { params: { slug: 'duke' }, query: '?program=BOGUS' })).status).toBe(400);
  });

  it('passes the program through to the loader', async () => {
    await call(publicRoute, 'GET', { params: { slug: 'duke' }, query: '?program=PHD' });
    expect(mocks.getSchoolSecondaries).toHaveBeenCalledWith('duke', { program: 'PHD' });
  });
});

describe('GET me/secondaries/overlap (private)', () => {
  it('signed out is 401 and the service is not called', async () => {
    mocks.session.mockResolvedValue(null);
    expect((await call(overlapRoute, 'GET', { query: '?source=tracker' })).status).toBe(401);
    expect(mocks.getOverlap).not.toHaveBeenCalled();
  });

  it('takes the user id from the session, is never publicly cached and sets no etag', async () => {
    const res = await call(overlapRoute, 'GET', {
      query: '?source=list&list=L1',
      cookie: 'better-auth.session_token=t',
    });
    expect(res.status).toBe(200);
    expect(mocks.getOverlap).toHaveBeenCalledWith('u1', { source: 'list', list: 'L1' });
    const cc = res.headers.get('cache-control') ?? '';
    expect(cc).not.toContain('public');
    expect(res.headers.get('etag')).toBeNull();
  });

  it('a list source needs a list, and a tracker source takes none (400)', async () => {
    expect((await call(overlapRoute, 'GET', { query: '?source=list' })).status).toBe(400);
    expect((await call(overlapRoute, 'GET', { query: '?source=tracker&list=L1' })).status).toBe(400);
    expect((await call(overlapRoute, 'GET', { query: '' })).status).toBe(400);
  });

  it("another member's list is a 404 with the same body as an unknown one", async () => {
    mocks.getOverlap.mockResolvedValue('not-found');
    const res = await call(overlapRoute, 'GET', { query: '?source=list&list=theirs' });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'Not found' });
  });
});

describe('POST admin/medschools/secondaries', () => {
  const body = {
    schoolId: 's1',
    program: 'REG',
    cycleYear: 2027,
    sourceUrl: 'https://med.duke.edu/secondary',
    prompts: [{ text: 'Describe a challenge you faced.' }],
  };

  it('anonymous is 401 and a normal user is 403', async () => {
    mocks.session.mockResolvedValue(null);
    expect((await call(adminRoute, 'POST', { body })).status).toBe(401);
    mocks.session.mockResolvedValue({ user: { id: 'u1', isAdmin: false } });
    expect((await call(adminRoute, 'POST', { body })).status).toBe(403);
    expect(mocks.recordSchoolPrompts).not.toHaveBeenCalled();
  });

  it('an admin writes, and the URL is stored without ever being fetched', async () => {
    mocks.session.mockResolvedValue({ user: { id: 'admin', isAdmin: true } });
    const res = await call(adminRoute, 'POST', { body });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ prompts: 1, created: 1, rejected: 0 });
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it.each([
    ['http', 'http://med.duke.edu/secondary'],
    ['javascript', 'javascript:alert(1)'],
    ['userinfo', 'https://user:pw@med.duke.edu/secondary'],
    ['a query string', 'https://med.duke.edu/secondary?x=1'],
    ['a third-party host', 'https://med.admit.org/secondary-essays/duke'],
    ['too long', `https://med.duke.edu/${'a'.repeat(500)}`],
  ])('rejects %s as the source URL (400)', async (_n, sourceUrl) => {
    mocks.session.mockResolvedValue({ user: { id: 'admin', isAdmin: true } });
    expect((await call(adminRoute, 'POST', { body: { ...body, sourceUrl } })).status).toBe(400);
    expect(mocks.recordSchoolPrompts).not.toHaveBeenCalled();
  });

  it('rejects over 40 prompts, text over 1500, an empty list and a half limit', async () => {
    mocks.session.mockResolvedValue({ user: { id: 'admin', isAdmin: true } });
    const many = Array.from({ length: 41 }, (_, i) => ({ text: `Prompt number ${i}` }));
    for (const prompts of [many, [{ text: 'x'.repeat(1501) }], [], [{ text: 'ok', limitKind: 'WORDS' }]])
      expect((await call(adminRoute, 'POST', { body: { ...body, prompts } })).status).toBe(400);
  });

  it('an unknown school is a 404', async () => {
    mocks.session.mockResolvedValue({ user: { id: 'admin', isAdmin: true } });
    mocks.recordSchoolPrompts.mockResolvedValue('not-found');
    expect((await call(adminRoute, 'POST', { body })).status).toBe(404);
  });
});
