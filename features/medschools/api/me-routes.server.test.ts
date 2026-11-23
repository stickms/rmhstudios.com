import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handlersOf } from '@/lib/__tests__/api-handlers-of';

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  getTracker: vi.fn(),
  putCycle: vi.fn(),
  deleteCycle: vi.fn(),
  addApplication: vi.fn(),
  patchApplication: vi.fn(),
  deleteApplication: vi.fn(),
  putMilestone: vi.fn(),
  deleteMilestone: vi.fn(),
}));
vi.mock('@/lib/auth', () => ({ auth: { api: { getSession: mocks.session } } }));
vi.mock('@/lib/prisma.server', () => ({ prisma: {} }));
vi.mock('@/lib/rate-limit.server', () => ({ withRateLimitAsync: async () => null }));
vi.mock('./tracker.server', () => ({
  getTracker: mocks.getTracker,
  putCycle: mocks.putCycle,
  deleteCycle: mocks.deleteCycle,
  addApplication: mocks.addApplication,
  patchApplication: mocks.patchApplication,
  deleteApplication: mocks.deleteApplication,
  putMilestone: mocks.putMilestone,
  deleteMilestone: mocks.deleteMilestone,
}));

import { route as tracker } from './medschools.me.tracker.server';
import { route as cycle } from './medschools.me.tracker.cycle.server';
import { route as applications } from './medschools.me.tracker.applications.server';
import { route as application } from './medschools.me.tracker.applications.$id.server';
import { route as milestone } from './medschools.me.tracker.applications.$id.milestones.$type.server';
import { AccountTooNewError, SharingUnavailableError } from './share-sync.server';

type Handler = (ctx: { request: Request; params: Record<string, string> }) => Promise<Response>;
const call = (
  route: unknown,
  method: string,
  opts: { body?: unknown; query?: string; params?: Record<string, string> } = {},
) =>
  handlersOf<Handler>(route)[method]!({
    params: opts.params ?? {},
    request: new Request(`https://rmhstudios.com/api/medschools/me/x${opts.query ?? ''}`, {
      method,
      headers: { cookie: 'better-auth.session_token=t', 'content-type': 'application/json' },
      ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
    }),
  });

const P = { id: 'app1', type: 'INTERVIEW' };
const YEAR = new Date().getUTCFullYear() + (new Date().getUTCMonth() >= 5 ? 1 : 0);
const cycleBody = { cycleYear: YEAR, shareAnonymously: true };

const all: Array<[string, unknown, string, Parameters<typeof call>[2], ReturnType<typeof vi.fn>]> = [
  ['GET tracker', tracker, 'GET', {}, mocks.getTracker],
  ['PUT cycle', cycle, 'PUT', { body: cycleBody }, mocks.putCycle],
  ['DELETE cycle', cycle, 'DELETE', { query: `?cycleYear=${YEAR}` }, mocks.deleteCycle],
  [
    'POST applications',
    applications,
    'POST',
    { body: { cycleYear: YEAR, schoolSlug: 'duke', program: 'REG' } },
    mocks.addApplication,
  ],
  ['PATCH application', application, 'PATCH', { body: { notes: 'n' }, params: P }, mocks.patchApplication],
  ['DELETE application', application, 'DELETE', { params: P }, mocks.deleteApplication],
  ['PUT milestone', milestone, 'PUT', { body: { date: '2026-11-18' }, params: P }, mocks.putMilestone],
  ['DELETE milestone', milestone, 'DELETE', { params: P }, mocks.deleteMilestone],
];

beforeEach(() => {
  vi.clearAllMocks();
  mocks.session.mockResolvedValue({ user: { id: 'u1' } });
  for (const [, , , , fn] of all) fn.mockResolvedValue({ ok: true });
});

describe('me/** tracker routes', () => {
  it.each(all)('%s: signed out is 401 and the service is not called', async (_n, route, method, opts, svc) => {
    mocks.session.mockResolvedValue(null);
    const res = await call(route, method, opts);
    expect(res.status).toBe(401);
    expect(svc).not.toHaveBeenCalled();
  });

  it.each(all)(
    '%s: the user id comes from the session and is the first argument',
    async (_n, route, method, opts, svc) => {
      const res = await call(route, method, opts);
      expect(res.status).toBe(200);
      expect(svc.mock.calls[0]?.[0]).toBe('u1');
    },
  );

  it.each(all)('%s: never publicly cached, no etag', async (_n, route, method, opts) => {
    const res = await call(route, method, opts);
    const cc = res.headers.get('cache-control') ?? '';
    expect(cc).not.toContain('public');
    expect(cc).not.toContain('s-maxage');
    expect(res.headers.get('etag')).toBeNull();
  });

  it('a userId in a body is a 400 and never reaches the service', async () => {
    for (const [route, method, body] of [
      [cycle, 'PUT', { ...cycleBody, userId: 'u2' }],
      [applications, 'POST', { cycleYear: YEAR, schoolSlug: 'duke', program: 'REG', dedupeHash: 'x' }],
      [application, 'PATCH', { notes: null, userId: 'u2' }],
      [milestone, 'PUT', { date: '2026-11-18', userId: 'u2' }],
    ] as const) {
      expect((await call(route, method, { body, params: P })).status).toBe(400);
    }
    expect(mocks.putCycle).not.toHaveBeenCalled();
    expect(mocks.addApplication).not.toHaveBeenCalled();
  });

  it('400 for a string or float cycle year, bad dates and an over-long note', async () => {
    expect((await call(cycle, 'PUT', { body: { cycleYear: String(YEAR), shareAnonymously: true } })).status).toBe(400);
    expect((await call(cycle, 'PUT', { body: { cycleYear: YEAR + 0.5, shareAnonymously: true } })).status).toBe(400);
    expect((await call(cycle, 'DELETE', { query: '?cycleYear=2027.5' })).status).toBe(400);
    expect((await call(tracker, 'GET', { query: '?cycle=abc' })).status).toBe(400);
    for (const date of [20261120, ['2026-11-20'], null, '2026-11-20T10:00']) {
      expect((await call(milestone, 'PUT', { body: { date }, params: P })).status).toBe(400);
    }
    expect((await call(application, 'PATCH', { body: { notes: 'x'.repeat(1001) }, params: P })).status).toBe(400);
    expect(
      (await call(milestone, 'PUT', { body: { date: '2026-11-18' }, params: { id: 'a', type: 'BOGUS' } })).status,
    ).toBe(400);
  });

  it('a date the service rejects is a 400', async () => {
    mocks.putMilestone.mockResolvedValue('bad-date');
    expect((await call(milestone, 'PUT', { body: { date: '2026-02-30' }, params: P })).status).toBe(400);
  });

  it('404 for a null or false service result, with no existence oracle', async () => {
    mocks.deleteCycle.mockResolvedValue(false);
    mocks.patchApplication.mockResolvedValue(null);
    mocks.deleteApplication.mockResolvedValue(false);
    mocks.putMilestone.mockResolvedValue(null);
    mocks.deleteMilestone.mockResolvedValue(null);
    mocks.addApplication.mockResolvedValue('school-missing');
    for (const [, route, method, opts] of all.slice(2)) {
      expect((await call(route, method, opts)).status, `${method}`).toBe(404);
    }
    mocks.addApplication.mockResolvedValue('cycle-missing');
    expect((await call(applications, 'POST', all[3]![3])).status).toBe(404);
  });

  it('path ids of %00, 300 characters or ../ reach the service unchanged and are a 404, never a 500', async () => {
    mocks.patchApplication.mockResolvedValue(null);
    for (const id of ['%00', 'x'.repeat(300), '../']) {
      const res = await call(application, 'PATCH', { body: { notes: null }, params: { id } });
      expect(res.status).toBe(404);
      expect(mocks.patchApplication).toHaveBeenLastCalledWith('u1', id, null);
    }
  });

  it('409 with the right code for a duplicate and the cap', async () => {
    mocks.addApplication.mockResolvedValue('duplicate');
    const dup = await call(applications, 'POST', all[3]![3]);
    expect(dup.status).toBe(409);
    expect(await dup.json()).toMatchObject({ code: 'MEDSCHOOLS_DUPLICATE' });
    mocks.addApplication.mockResolvedValue('cap');
    const cap = await call(applications, 'POST', all[3]![3]);
    expect(cap.status).toBe(409);
    expect(await cap.json()).toMatchObject({ code: 'MEDSCHOOLS_CAP', max: 60 });
  });

  it('503 SHARING_UNAVAILABLE without leaking the secret, and a logged error', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    process.env.MEDSCHOOLS_DEDUPE_SECRET = 'a-very-secret-value-0123456789';
    mocks.putCycle.mockRejectedValue(new SharingUnavailableError());
    const res = await call(cycle, 'PUT', { body: cycleBody });
    expect(res.status).toBe(503);
    const text = await res.text();
    expect(JSON.parse(text)).toMatchObject({ code: 'MEDSCHOOLS_SHARING_UNAVAILABLE' });
    expect(text).not.toContain('a-very-secret-value');
    expect(log).toHaveBeenCalled();
    delete process.env.MEDSCHOOLS_DEDUPE_SECRET;
    log.mockRestore();
  });

  it('409 with a code the UI can explain when the account is too new', async () => {
    mocks.putCycle.mockRejectedValue(new AccountTooNewError());
    const res = await call(cycle, 'PUT', { body: cycleBody });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ code: 'MEDSCHOOLS_ACCOUNT_TOO_NEW', days: 7 });
  });

  it('a service that throws is a bare 500', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mocks.getTracker.mockRejectedValue(new Error('connection string postgres://secret'));
    const res = await call(tracker, 'GET');
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Internal Server Error' });
    log.mockRestore();
  });
});
