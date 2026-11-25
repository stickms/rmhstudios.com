import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handlersOf } from '@/lib/__tests__/api-handlers-of';

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  buildList: vi.fn(),
  createListWithItems: vi.fn(),
  configured: vi.fn(() => true),
  user: vi.fn(async () => ({ bannedUntil: null as Date | null })),
}));
vi.mock('@/lib/auth', () => ({ auth: { api: { getSession: mocks.session } } }));
vi.mock('@/lib/prisma.server', () => ({ prisma: { user: { findUnique: mocks.user } } }));
vi.mock('@/lib/rate-limit.server', () => ({ withRateLimitAsync: async () => null }));
vi.mock('@/lib/ai/provider.server', () => ({ isAiConfigured: mocks.configured }));
vi.mock('./build.server', () => ({ buildList: mocks.buildList }));
vi.mock('../lists.server', () => ({ createListWithItems: mocks.createListWithItems }));

import { route as builder } from '../medschools.me.list-builder.server';
import { route as save } from '../medschools.me.list-builder.save.server';

type Handler = (ctx: { request: Request; params: Record<string, string> }) => Promise<Response>;
const call = (route: unknown, body: unknown) =>
  handlersOf<Handler>(route).POST!({
    params: {},
    request: new Request('https://rmhstudios.com/api/medschools/me/list-builder', {
      method: 'POST',
      headers: { cookie: 'better-auth.session_token=t', 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  });
const BUILD = { request: '10 schools in Texas', useStats: true };
const SAVE = { name: 'Texas', items: [{ slug: 'alpha' }, { slug: 'bravo', program: 'PHD' }] };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.session.mockResolvedValue({ user: { id: 'u1' } });
  mocks.configured.mockReturnValue(true);
  mocks.user.mockResolvedValue({ bannedUntil: null });
  mocks.buildList.mockResolvedValue({ status: 'built', schools: [] });
  mocks.createListWithItems.mockResolvedValue({ id: 'l1', name: 'Texas', position: 0, items: [] });
});

describe('me/list-builder routes', () => {
  it('signed out is 401 and nothing runs', async () => {
    mocks.session.mockResolvedValue(null);
    expect((await call(builder, BUILD)).status).toBe(401);
    expect((await call(save, SAVE)).status).toBe(401);
    expect(mocks.buildList).not.toHaveBeenCalled();
    expect(mocks.createListWithItems).not.toHaveBeenCalled();
  });

  it('passes the session user, the flags and the request signal; never publicly cached', async () => {
    const res = await call(builder, BUILD);
    expect(res.status).toBe(200);
    expect(mocks.buildList.mock.calls[0]?.[0]).toMatchObject({ userId: 'u1', request: BUILD.request, useStats: true, think: false });
    expect(res.headers.get('cache-control') ?? '').not.toMatch(/public|s-maxage/);
    const saved = await call(save, SAVE);
    expect(saved.status).toBe(200);
    expect(mocks.createListWithItems).toHaveBeenCalledWith('u1', 'Texas', SAVE.items);
  });

  it('no model key is a 503 before anything is reserved; a suspended account is a 403', async () => {
    mocks.configured.mockReturnValue(false);
    expect((await call(builder, BUILD)).status).toBe(503);
    mocks.configured.mockReturnValue(true);
    mocks.user.mockResolvedValue({ bannedUntil: new Date(Date.now() + 60_000) });
    expect((await call(builder, BUILD)).status).toBe(403);
    expect(mocks.buildList).not.toHaveBeenCalled();
  });

  it('strict bodies: unknown keys, a user id, stats in the body or junk are 400', async () => {
    for (const body of [
      { ...BUILD, userId: 'u2' },
      { ...BUILD, stats: { mcat: 520 } },
      { request: 'x' },
      { request: 'a'.repeat(401) },
    ]) {
      expect((await call(builder, body)).status).toBe(400);
    }
    for (const body of [{ name: '', items: [{ slug: 'a' }] }, { name: 'x', items: [] }, { name: 'x', items: [{ slug: 'A B' }] }]) {
      expect((await call(save, body)).status).toBe(400);
    }
    expect(mocks.buildList).not.toHaveBeenCalled();
    expect(mocks.createListWithItems).not.toHaveBeenCalled();
  });

  it('the list cap is a 409 with the shared refusal', async () => {
    mocks.createListWithItems.mockResolvedValue('cap');
    const res = await call(save, SAVE);
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ code: 'MEDSCHOOLS_LIST_CAP' });
  });
});
