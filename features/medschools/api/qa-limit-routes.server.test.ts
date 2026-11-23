import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handlersOf } from '@/lib/__tests__/api-handlers-of';

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  rateLimit: vi.fn(async (..._a: unknown[]): Promise<Response | null> => null),
  state: vi.fn(),
  submit: vi.fn(),
  list: vi.fn(),
  decide: vi.fn(),
}));
vi.mock('@/lib/auth', () => ({ auth: { api: { getSession: mocks.session } } }));
vi.mock('@/lib/prisma.server', () => ({ prisma: {} }));
vi.mock('@/lib/rate-limit.server', () => ({ withRateLimitAsync: mocks.rateLimit }));
vi.mock('./qa-limit.server', () => ({
  getLimitRequestState: mocks.state,
  submitLimitRequest: mocks.submit,
  listLimitRequests: mocks.list,
  decideLimitRequest: mocks.decide,
}));

import { AppError } from '@/lib/errors/codes';
import { route as adminRoute } from './admin.medschools.qa-limit-requests.server';
import { route as meRoute } from './medschools.me.qa-limit-request.server';

type Handler = (ctx: { request: Request; params: Record<string, string> }) => Promise<Response>;
const call = (r: unknown, method: 'GET' | 'POST', body?: unknown) =>
  handlersOf<Handler>(r as never)[method]!({
    params: {},
    request: new Request('https://rmhstudios.com/api/x', {
      method,
      headers: { cookie: 'better-auth.session_token=t', 'content-type': 'application/json' },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    }),
  });

const STATE = { state: 'none', tier: 'free', requestedAt: null, decidedAt: null, adminNote: '', reapplyOn: null };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.session.mockResolvedValue({ user: { id: 'u1', isAdmin: false } });
  mocks.state.mockResolvedValue(STATE);
  mocks.submit.mockResolvedValue({ ...STATE, state: 'pending' });
  mocks.list.mockResolvedValue({ pending: [], recent: [] });
  mocks.decide.mockResolvedValue(undefined);
});

describe('me/qa-limit-request', () => {
  it('is 401 signed out, and calls nothing', async () => {
    mocks.session.mockResolvedValue(null);
    expect((await call(meRoute, 'GET')).status).toBe(401);
    expect((await call(meRoute, 'POST', {})).status).toBe(401);
    expect(mocks.state).not.toHaveBeenCalled();
    expect(mocks.submit).not.toHaveBeenCalled();
  });
  it('reads the state and passes the admin flag from the session, never from the client', async () => {
    mocks.session.mockResolvedValue({ user: { id: 'a1', isAdmin: true } });
    expect(await (await call(meRoute, 'GET')).json()).toEqual(STATE);
    expect(mocks.state).toHaveBeenCalledWith('a1', true);
    await call(meRoute, 'POST', { note: 'please', isAdmin: false });
    expect(mocks.submit).toHaveBeenCalledWith('a1', true, 'please');
  });
  it('validates the note (500 characters, no control characters) before any write', async () => {
    for (const body of [{ note: 'x'.repeat(501) }, { note: 'a\u0000b' }, { note: 5 }]) {
      expect((await call(meRoute, 'POST', body)).status).toBe(400);
    }
    expect(mocks.submit).not.toHaveBeenCalled();
    expect((await call(meRoute, 'POST', {})).status).toBe(200);
  });
  it('turns the refusals into 409 with their codes, and is never cached', async () => {
    mocks.submit.mockRejectedValue(new AppError('MEDSCHOOLS_QA_LIMIT_PENDING'));
    const res = await call(meRoute, 'POST', { note: 'x' });
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('MEDSCHOOLS_QA_LIMIT_PENDING');
    const ok = await call(meRoute, 'GET');
    expect(ok.headers.get('cache-control') ?? '').not.toMatch(/public|s-maxage|max-age=[1-9]/);
  });
  it('rate limits the write', async () => {
    mocks.rateLimit.mockResolvedValueOnce(new Response('{}', { status: 429 }));
    expect((await call(meRoute, 'POST', {})).status).toBe(429);
    expect(mocks.submit).not.toHaveBeenCalled();
  });
});

describe('admin/medschools/qa-limit-requests', () => {
  it('is 401 signed out and 403 for a member, on GET and POST, before anything runs', async () => {
    const body = { id: 'r1', action: 'approve' };
    mocks.session.mockResolvedValue(null);
    expect((await call(adminRoute, 'GET')).status).toBe(401);
    expect((await call(adminRoute, 'POST', body)).status).toBe(401);
    mocks.session.mockResolvedValue({ user: { id: 'u1', isAdmin: false } });
    expect((await call(adminRoute, 'GET')).status).toBe(403);
    expect((await call(adminRoute, 'POST', body)).status).toBe(403);
    expect(mocks.list).not.toHaveBeenCalled();
    expect(mocks.decide).not.toHaveBeenCalled();
  });
  it('lets an admin list and decide, validating the action and the note', async () => {
    mocks.session.mockResolvedValue({ user: { id: 'a1', isAdmin: true } });
    expect(await (await call(adminRoute, 'GET')).json()).toEqual({ pending: [], recent: [] });
    expect((await call(adminRoute, 'POST', { id: 'r1', action: 'delete' })).status).toBe(400);
    expect((await call(adminRoute, 'POST', { id: 'r1', action: 'decline', adminNote: 'x'.repeat(501) })).status).toBe(400);
    const res = await call(adminRoute, 'POST', { id: 'r1', action: 'decline', adminNote: 'later' });
    expect(res.status).toBe(200);
    expect(mocks.decide).toHaveBeenCalledWith('a1', { id: 'r1', action: 'decline', adminNote: 'later' });
  });
  it('answers a lost race with 409 and an unknown id with 404', async () => {
    mocks.session.mockResolvedValue({ user: { id: 'a1', isAdmin: true } });
    mocks.decide.mockRejectedValueOnce(new AppError('CONFLICT'));
    expect((await call(adminRoute, 'POST', { id: 'r1', action: 'approve' })).status).toBe(409);
    mocks.decide.mockRejectedValueOnce(new AppError('NOT_FOUND'));
    expect((await call(adminRoute, 'POST', { id: 'r2', action: 'approve' })).status).toBe(404);
  });
});
