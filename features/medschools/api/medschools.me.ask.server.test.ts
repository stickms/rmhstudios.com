import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handlersOf } from '@/lib/__tests__/api-handlers-of';

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  rateLimit: vi.fn(async (..._a: unknown[]): Promise<Response | null> => null),
  answerQuestion: vi.fn(),
  dailyStatus: vi.fn(),
  isAiConfigured: vi.fn(() => true),
  findUser: vi.fn(),
  order: [] as string[],
}));
vi.mock('@/lib/auth', () => ({ auth: { api: { getSession: mocks.session } } }));
vi.mock('@/lib/prisma.server', () => ({ prisma: { user: { findUnique: mocks.findUser } } }));
vi.mock('@/lib/rate-limit.server', () => ({ withRateLimitAsync: mocks.rateLimit }));
vi.mock('@/lib/ai/provider.server', () => ({ isAiConfigured: mocks.isAiConfigured }));
vi.mock('./qa/answer.server', () => ({ answerQuestion: mocks.answerQuestion }));
vi.mock('./qa/budget.server', () => ({ dailyStatus: mocks.dailyStatus }));

import { AppError } from '@/lib/errors/codes';
import { route } from './medschools.me.ask.server';

type Handler = (ctx: { request: Request; params: Record<string, string> }) => Promise<Response>;
const call = (method: 'GET' | 'POST', body?: unknown) =>
  handlersOf<Handler>(route)[method]!({
    params: {},
    request: new Request('https://rmhstudios.com/api/medschools/me/ask', {
      method,
      headers: { cookie: 'better-auth.session_token=t', 'content-type': 'application/json' },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    }),
  });

const ANSWER = {
  status: 'answered',
  segments: [{ text: 'Duke has 412 reported interview events.', cites: ['f1'] }],
  citations: [],
  notice: null,
  decline: null,
  schools: [],
  cycleYear: 2027,
  mine: null,
  remainingToday: 9,
  dailyCap: 15,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.session.mockResolvedValue({ user: { id: 'u1' } });
  mocks.isAiConfigured.mockReturnValue(true);
  mocks.findUser.mockResolvedValue({ bannedUntil: null });
  mocks.answerQuestion.mockResolvedValue(ANSWER);
  mocks.dailyStatus.mockResolvedValue({ tier: 'free', remainingToday: 7, dailyCap: 15 });
});

describe('me/ask: sign-in', () => {
  it('is 401 for a signed-out POST and GET, and calls nothing', async () => {
    mocks.session.mockResolvedValue(null);
    expect((await call('POST', { question: 'Duke MCAT?' })).status).toBe(401);
    expect((await call('GET')).status).toBe(401);
    expect(mocks.answerQuestion).not.toHaveBeenCalled();
    expect(mocks.dailyStatus).not.toHaveBeenCalled();
    expect(mocks.findUser).not.toHaveBeenCalled();
  });
});

describe('me/ask: never cached', () => {
  it('declares no cache and sends nothing a shared cache would keep', async () => {
    for (const res of [await call('POST', { question: 'Duke MCAT?' }), await call('GET')]) {
      expect(res.status).toBe(200);
      expect(res.headers.get('cache-control') ?? '').not.toMatch(/public|s-maxage|max-age=[1-9]/);
      expect(res.headers.get('etag')).toBeNull();
    }
  });
});

describe('me/ask: POST input', () => {
  it('is 400 for a short, long, blank or control-character question and a bad slug, before any call', async () => {
    for (const body of [
      { question: 'ab' },
      { question: 'x'.repeat(401) },
      { question: '    ' },
      { question: 'a\u0000b c' },
      { question: 'Duke MCAT?', slug: 'Not A Slug' },
      {},
      { question: 7 },
    ]) {
      expect((await call('POST', body)).status).toBe(400);
    }
    expect(mocks.answerQuestion).not.toHaveBeenCalled();
    expect(mocks.findUser).not.toHaveBeenCalled();
  });

  it('ignores extra keys, takes the user from the session and passes the question and slug on', async () => {
    const res = await call('POST', { question: ' What is the median? ', slug: 'duke', userId: 'u2', extra: 1 });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(ANSWER);
    expect(mocks.answerQuestion).toHaveBeenCalledTimes(1);
    expect(mocks.answerQuestion).toHaveBeenCalledWith({
      userId: 'u1',
      isAdmin: false,
      question: 'What is the median?',
      slug: 'duke',
      signal: expect.any(AbortSignal),
    });
  });
});

describe('me/ask: limits', () => {
  it('takes the ai policy, six a minute, per member', async () => {
    await call('POST', { question: 'Duke MCAT?' });
    const [, policy, opts] = mocks.rateLimit.mock.calls[0]!;
    expect(policy).toBe('ai');
    expect(opts).toEqual({ limit: 6, windowMs: 60_000, prefix: 'medschools-ask', scope: 'u1' });
  });

  it('checks in order: input, suspension, model key, then the answer (which runs the ledger gates)', async () => {
    mocks.findUser.mockImplementation(async () => {
      mocks.order.push('ban');
      return { bannedUntil: null };
    });
    mocks.isAiConfigured.mockImplementation(() => {
      mocks.order.push('configured');
      return true;
    });
    mocks.answerQuestion.mockImplementation(async () => {
      mocks.order.push('answer');
      return ANSWER;
    });
    mocks.order.length = 0;
    await call('POST', { question: 'Duke MCAT?' });
    expect(mocks.order).toEqual(['ban', 'configured', 'answer']);
  });

  it('is 503 AI_UNAVAILABLE with no model key, before the answer is attempted', async () => {
    mocks.isAiConfigured.mockReturnValue(false);
    const res = await call('POST', { question: 'Duke MCAT?' });
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ code: 'AI_UNAVAILABLE' });
    expect(mocks.answerQuestion).not.toHaveBeenCalled();
  });

  it('is 403 for a suspended account', async () => {
    mocks.findUser.mockResolvedValue({ bannedUntil: new Date(Date.now() + 60_000) });
    expect((await call('POST', { question: 'Duke MCAT?' })).status).toBe(403);
    expect(mocks.answerQuestion).not.toHaveBeenCalled();
    mocks.findUser.mockResolvedValue({ bannedUntil: new Date(Date.now() - 60_000) });
    expect((await call('POST', { question: 'Duke MCAT?' })).status).toBe(200);
  });

  it.each([
    ['MEDSCHOOLS_QA_DAILY_CAP', 429],
    ['MEDSCHOOLS_QA_PAUSED', 503],
    ['AI_BUDGET_EXCEEDED', 402],
    ['AI_UNAVAILABLE', 503],
    ['RATE_LIMITED', 429],
  ] as const)('maps %s to %i with its code in the body', async (code, status) => {
    mocks.answerQuestion.mockRejectedValue(new AppError(code));
    const res = await call('POST', { question: 'Duke MCAT?' });
    expect(res.status).toBe(status);
    expect(await res.json()).toMatchObject({ code });
  });

  it('answers a rate-limited request with the limiter response and calls nothing', async () => {
    mocks.rateLimit.mockResolvedValueOnce(Response.json({ error: 'slow' }, { status: 429 }));
    expect((await call('POST', { question: 'Duke MCAT?' })).status).toBe(429);
    expect(mocks.answerQuestion).not.toHaveBeenCalled();
  });

  it('hides an unexpected failure behind a bare 500', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mocks.answerQuestion.mockRejectedValue(new Error('select * from secrets'));
    const res = await call('POST', { question: 'Duke MCAT?' });
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain('secrets');
  });
});

describe('me/ask: admin bypass (R19)', () => {
  it('passes the session admin flag, never a body field, and skips the per-minute rate limit', async () => {
    mocks.session.mockResolvedValue({ user: { id: 'a1', isAdmin: true } });
    await call('POST', { question: 'What is the median?', isAdmin: false });
    expect(mocks.answerQuestion).toHaveBeenCalledWith(expect.objectContaining({ userId: 'a1', isAdmin: true }));
    expect(mocks.rateLimit).not.toHaveBeenCalled();
  });
  it('still rate limits a member', async () => {
    await call('POST', { question: 'What is the median?' });
    expect(mocks.rateLimit).toHaveBeenCalled();
  });
  it('reports an admin as tier admin with no cap', async () => {
    mocks.session.mockResolvedValue({ user: { id: 'a1', isAdmin: true } });
    mocks.dailyStatus.mockResolvedValue({ tier: 'admin', remainingToday: null, dailyCap: null });
    expect(await (await call('GET')).json()).toEqual({
      configured: true,
      tier: 'admin',
      remainingToday: null,
      dailyCap: null,
    });
    expect(mocks.dailyStatus).toHaveBeenCalledWith('a1', expect.any(Date), { isAdmin: true });
  });
});

describe('me/ask: GET status', () => {
  it('returns whether Q&A is on and the questions left, and calls no model', async () => {
    const res = await call('GET');
    expect(await res.json()).toEqual({ configured: true, tier: 'free', remainingToday: 7, dailyCap: 15 });
    expect(mocks.dailyStatus).toHaveBeenCalledWith('u1', expect.any(Date), { isAdmin: false });
    expect(mocks.answerQuestion).not.toHaveBeenCalled();
    mocks.isAiConfigured.mockReturnValue(false);
    expect((await (await call('GET')).json()).configured).toBe(false);
  });
  it('is 503 paused when the ledger cannot be read', async () => {
    mocks.dailyStatus.mockRejectedValue(new AppError('MEDSCHOOLS_QA_PAUSED'));
    const res = await call('GET');
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ code: 'MEDSCHOOLS_QA_PAUSED' });
  });
});
