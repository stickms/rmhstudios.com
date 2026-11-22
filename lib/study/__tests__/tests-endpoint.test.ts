/**
 * Practice-test results are a member's data: a private deck of someone else is a 404 for both
 * methods, the server bounds what it stores, and nothing here touches SM-2 state. Prisma is mocked;
 * the handlers are driven directly.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handlersOf } from '@/lib/__tests__/api-handlers-of';

const db = vi.hoisted(() => ({
  decks: [] as { id: string; userId: string; isPublic: boolean }[],
  cards: [] as { id: string; deckId: string }[],
  results: [] as Record<string, unknown>[],
  reviewWrites: 0,
}));
const getSession = vi.hoisted(() => vi.fn());

vi.mock('@/lib/auth', () => ({ auth: { api: { getSession } } }));
vi.mock('@/lib/rate-limit.server', async (orig) => ({
  ...(await orig<typeof import('@/lib/rate-limit.server')>()),
  checkRateLimit: vi.fn(async () => ({ allowed: true })),
}));
vi.mock('@/lib/prisma.server', () => ({
  prisma: {
    flashcardDeck: {
      findUnique: vi.fn(
        async ({ where }: { where: { id: string } }) => db.decks.find((d) => d.id === where.id) ?? null,
      ),
    },
    flashcard: {
      count: vi.fn(
        async ({ where }: { where: { deckId: string; id?: { in: string[] } } }) =>
          db.cards.filter((c) => c.deckId === where.deckId && (!where.id || where.id.in.includes(c.id))).length,
      ),
    },
    flashcardTestResult: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        db.results.push({ ...data, id: BigInt(db.results.length + 1), createdAt: new Date(0) });
        return { id: BigInt(db.results.length) };
      }),
      findMany: vi.fn(async ({ where, take }: { where: { userId: string; deckId: string }; take: number }) =>
        db.results
          .filter((r) => r.userId === where.userId && r.deckId === where.deckId)
          .reverse()
          .slice(0, take),
      ),
    },
    flashcardReview: {
      upsert: vi.fn(async () => {
        db.reviewWrites++;
      }),
    },
  },
}));
vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (config: unknown) => ({ options: config }),
}));

import { route } from '@/lib/study/api/study.decks.$id.tests.server';

type H = (a: { request: Request; params: Record<string, string> }) => Promise<Response>;
const handlers = handlersOf<H>(route);
const headers = { cookie: 'better-auth.session_token=abc', 'cf-connecting-ip': '1.2.3.4' };

const signIn = (id: string) => getSession.mockResolvedValue({ user: { id }, session: { id: 's' } });
const get = (deckId: string) =>
  handlers.GET!({
    params: { id: deckId },
    request: new Request(`https://x.test/api/study/decks/${deckId}/tests`, { headers }),
  });
const post = (deckId: string, body: unknown) =>
  handlers.POST!({
    params: { id: deckId },
    request: new Request(`https://x.test/api/study/decks/${deckId}/tests`, {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  });

const valid = {
  total: 10,
  correct: 7,
  kinds: ['multiple-choice', 'written'],
  durationMs: 61_000,
  missedCardIds: ['k1', 'k2'],
  seed: 12345,
};

beforeEach(() => {
  db.decks = [
    { id: 'mine', userId: 'u1', isPublic: false },
    { id: 'theirs-private', userId: 'u2', isPublic: false },
    { id: 'theirs-public', userId: 'u2', isPublic: true },
  ];
  db.cards = [
    { id: 'k1', deckId: 'mine' },
    { id: 'k2', deckId: 'mine' },
    ...Array.from({ length: 9 }, (_, i) => ({ id: `m${i}`, deckId: 'mine' })),
    { id: 'other', deckId: 'theirs-private' },
    { id: 'p1', deckId: 'theirs-public' },
  ];
  db.results = [];
  db.reviewWrites = 0;
  signIn('u1');
});

describe('POST /api/study/decks/$id/tests', () => {
  it("records a result on the viewer's own deck and never touches SM-2 state", async () => {
    const res = await post('mine', valid);
    expect(res.status).toBe(201);
    expect(db.results).toHaveLength(1);
    expect(db.results[0]).toMatchObject({ userId: 'u1', deckId: 'mine', total: 10, correct: 7, seed: 12345 });
    expect(db.reviewWrites).toBe(0);
  });

  it('is a 404 for a private deck of someone else, and a missing deck', async () => {
    expect((await post('theirs-private', { ...valid, missedCardIds: [] })).status).toBe(404);
    expect((await post('nope', valid)).status).toBe(404);
    expect(db.results).toHaveLength(0);
  });

  it('lets a signed-in viewer record a test of a public deck', async () => {
    const res = await post('theirs-public', { ...valid, total: 1, correct: 0, missedCardIds: ['p1'] });
    expect(res.status).toBe(201);
    expect(db.results[0]).toMatchObject({ userId: 'u1', deckId: 'theirs-public' });
  });

  it('rejects correct above total', async () => {
    expect((await post('mine', { ...valid, correct: 11 })).status).toBe(400);
    expect(db.results).toHaveLength(0);
  });

  it('rejects a total above the deck size and more missed cards than lost points', async () => {
    expect((await post('mine', { ...valid, total: 12, correct: 12, missedCardIds: [] })).status).toBe(400);
    expect((await post('mine', { ...valid, total: 10, correct: 9, missedCardIds: ['k1', 'k2'] })).status).toBe(400);
    expect(db.results).toHaveLength(0);
  });

  it('rejects missed cards that belong to another deck, or to none', async () => {
    expect((await post('mine', { ...valid, missedCardIds: ['k1', 'other'] })).status).toBe(400);
    expect((await post('mine', { ...valid, missedCardIds: ['ghost'] })).status).toBe(400);
    expect(db.results).toHaveLength(0);
  });

  it('rejects out-of-range totals, unknown kinds, an empty kind list and a bad seed', async () => {
    for (const bad of [
      { total: 0, correct: 0 },
      { total: 301, correct: 1 },
      { kinds: ['essay'] },
      { kinds: [] },
      { seed: -1 },
      { seed: 2 ** 31 },
      { correct: -1 },
    ]) {
      expect((await post('mine', { ...valid, ...bad })).status).toBe(400);
    }
    expect(db.results).toHaveLength(0);
  });

  it('clamps an absurd duration to four hours and de-duplicates missed cards', async () => {
    await post('mine', { ...valid, durationMs: 99 * 60 * 60 * 1000, missedCardIds: ['k1', 'k1'] });
    expect(db.results[0]).toMatchObject({ durationMs: 4 * 60 * 60 * 1000, missedCardIds: ['k1'] });
  });

  it('requires a session', async () => {
    getSession.mockResolvedValue(null);
    expect((await post('mine', valid)).status).toBe(401);
  });
});

describe('GET /api/study/decks/$id/tests', () => {
  it('is a 404 for a private deck of someone else', async () => {
    expect((await get('theirs-private')).status).toBe(404);
  });

  it("returns only the viewer's own results, newest first, as plain data", async () => {
    await post('mine', valid);
    await post('mine', { ...valid, correct: 9, missedCardIds: ['k1'] });
    signIn('u2');
    await post('theirs-public', { ...valid, total: 1, correct: 1, missedCardIds: [] });
    signIn('u1');
    const res = await get('mine');
    expect(res.status).toBe(200);
    const { results } = (await res.json()) as { results: { id: number; correct: number }[] };
    expect(results.map((r) => r.correct)).toEqual([9, 7]);
    expect(results[0]).not.toHaveProperty('missedCardIds');
    expect(typeof results[0]?.id).toBe('number');
    expect((await get('theirs-public')).status).toBe(200);
  });
});
