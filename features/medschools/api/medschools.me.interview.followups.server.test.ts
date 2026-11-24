import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handlersOf } from '@/lib/__tests__/api-handlers-of';

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  rateLimit: vi.fn(async (..._a: unknown[]): Promise<Response | null> => null),
  generate: vi.fn(),
  examples: vi.fn(),
  isAiConfigured: vi.fn(() => true),
  findUser: vi.fn(),
}));
vi.mock('@/lib/auth', () => ({ auth: { api: { getSession: mocks.session } } }));
vi.mock('@/lib/prisma.server', () => ({ prisma: { user: { findUnique: mocks.findUser } } }));
vi.mock('@/lib/rate-limit.server', () => ({ withRateLimitAsync: mocks.rateLimit }));
vi.mock('@/lib/ai/provider.server', () => ({ isAiConfigured: mocks.isAiConfigured }));
vi.mock('./qa/followups.server', () => ({ generateFollowups: mocks.generate, schoolExampleQuestions: mocks.examples }));

import { AppError } from '@/lib/errors/codes';
import { route } from './medschools.me.interview.followups.server';

type Handler = (ctx: { request: Request; params: Record<string, string> }) => Promise<Response>;
const call = (body?: unknown) =>
  handlersOf<Handler>(route).POST!({
    params: {},
    request: new Request('https://rmhstudios.com/api/medschools/me/interview/followups', {
      method: 'POST',
      headers: { cookie: 'better-auth.session_token=t', 'content-type': 'application/json' },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    }),
  });

const RES = { followups: ['a one?', 'a two?'], tier: 'free', remainingToday: 3, dailyCap: 25, thinking: false };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.session.mockResolvedValue({ user: { id: 'u1' } });
  mocks.isAiConfigured.mockReturnValue(true);
  mocks.findUser.mockResolvedValue({ bannedUntil: null });
  mocks.generate.mockResolvedValue(RES);
  mocks.examples.mockResolvedValue(['Stored one?']);
});

describe('me/interview/followups', () => {
  it('is 401 signed out and calls nothing', async () => {
    mocks.session.mockResolvedValue(null);
    expect((await call({ question: 'Why medicine?' })).status).toBe(401);
    expect(mocks.generate).not.toHaveBeenCalled();
  });

  it('is 400 for a bad question, notes, slug or think, before any call', async () => {
    for (const body of [
      {},
      { question: 'ab' },
      { question: 'x'.repeat(501) },
      { question: 'Why medicine?', notes: 'n'.repeat(2001) },
      { question: 'Why\u0000medicine?' },
      { question: 'Why medicine?', slug: 'Not A Slug' },
      { question: 'Why medicine?', think: 'yes' },
    ])
      expect((await call(body)).status).toBe(400);
    expect(mocks.generate).not.toHaveBeenCalled();
    expect(mocks.findUser).not.toHaveBeenCalled();
  });

  it('accepts the limits exactly, takes the user from the session and returns the pinned key set', async () => {
    const res = await call({ question: 'q'.repeat(500), notes: 'n'.repeat(2000), userId: 'u2' });
    expect(res.status).toBe(200);
    expect(Object.keys(await res.json()).sort()).toEqual([
      'dailyCap',
      'followups',
      'remainingToday',
      'thinking',
      'tier',
    ]);
    expect(mocks.generate).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'u1',
        isAdmin: false,
        stored: [],
        think: false,
        signal: expect.any(AbortSignal),
      }),
    );
    expect(mocks.examples).not.toHaveBeenCalled();
  });

  it('reads the school examples for a slug, and refuses an unknown school with 400 before reserving', async () => {
    await call({ question: 'Why medicine?', slug: 'duke', notes: 'my notes' });
    expect(mocks.examples).toHaveBeenCalledWith('duke');
    expect(mocks.generate).toHaveBeenCalledWith(
      expect.objectContaining({ stored: ['Stored one?'], notes: 'my notes' }),
    );
    mocks.examples.mockResolvedValue(null);
    mocks.generate.mockClear();
    expect((await call({ question: 'Why medicine?', slug: 'nowhere' })).status).toBe(400);
    expect(mocks.generate).not.toHaveBeenCalled();
  });

  it('takes the ai policy, six a minute, per member, and never caches', async () => {
    const res = await call({ question: 'Why medicine?' });
    const [, policy, opts] = mocks.rateLimit.mock.calls[0]!;
    expect(policy).toBe('ai');
    expect(opts).toEqual({ limit: 6, windowMs: 60_000, prefix: 'medschools-followups', scope: 'u1' });
    expect(res.headers.get('cache-control') ?? '').not.toMatch(/public|s-maxage|max-age=[1-9]/);
    expect(res.headers.get('etag')).toBeNull();
  });

  it('is 503 with no model key and 403 for a suspended account, before generating', async () => {
    mocks.isAiConfigured.mockReturnValue(false);
    expect((await call({ question: 'Why medicine?' })).status).toBe(503);
    mocks.isAiConfigured.mockReturnValue(true);
    mocks.findUser.mockResolvedValue({ bannedUntil: new Date(Date.now() + 60_000) });
    expect((await call({ question: 'Why medicine?' })).status).toBe(403);
    expect(mocks.generate).not.toHaveBeenCalled();
  });

  it.each([
    ['MEDSCHOOLS_QA_DAILY_CAP', 429],
    ['MEDSCHOOLS_QA_PAUSED', 503],
    ['AI_BUDGET_EXCEEDED', 402],
    ['AI_UNAVAILABLE', 503],
  ] as const)('maps %s to %i', async (code, status) => {
    mocks.generate.mockRejectedValue(new AppError(code));
    const res = await call({ question: 'Why medicine?' });
    expect(res.status).toBe(status);
    expect(await res.json()).toMatchObject({ code });
  });

  it('passes the session admin flag, never a body field, and skips the rate limit', async () => {
    mocks.session.mockResolvedValue({ user: { id: 'a1', isAdmin: true } });
    await call({ question: 'Why medicine?', isAdmin: false });
    expect(mocks.generate).toHaveBeenCalledWith(expect.objectContaining({ userId: 'a1', isAdmin: true }));
    expect(mocks.rateLimit).not.toHaveBeenCalled();
  });
});
