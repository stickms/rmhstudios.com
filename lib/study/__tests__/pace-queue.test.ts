/**
 * A deck's study pace against a recording Prisma stub: the queue never adds more than a paced deck's allowance for
 * the day, an unpaced deck costs no extra query, another member's deck is refused at the endpoint, a copy does not
 * inherit its source's pace, and the raw SQL names the real table and quoted columns.
 */
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handlersOf } from '@/lib/__tests__/api-handlers-of';

const h = vi.hoisted(() => {
  const state = {
    fresh: [] as unknown[][],
    introduced: [] as { deckId: string; n: number }[],
    raw: [] as { sql: string; values: unknown[] }[],
    deckRows: new Map<
      string,
      { userId: string; newPerDay: number | null; extraNewDay: string | null; extraNew: number }
    >(),
  };
  const flashcard = {
    findMany: vi.fn(async (_a: unknown) => state.fresh.shift() ?? []),
    count: vi.fn(async (_a: unknown) => 0),
    groupBy: vi.fn(async (_a: unknown) => [] as unknown[]),
  };
  const flashcardDeck = {
    findFirst: vi.fn(async (a: { where: { id: string; userId: string } }) => {
      const d = state.deckRows.get(a.where.id);
      return d && d.userId === a.where.userId ? { ...d, testDate: null } : null;
    }),
    updateMany: vi.fn(async (a: { where: { id: string; userId: string }; data: Record<string, unknown> }) => {
      const d = state.deckRows.get(a.where.id);
      if (!d || d.userId !== a.where.userId) return { count: 0 };
      Object.assign(d, a.data);
      return { count: 1 };
    }),
  };
  const prisma = {
    flashcard,
    flashcardDeck,
    flashcardReview: {
      findMany: vi.fn(async (_a: unknown) => [] as unknown[]),
      count: vi.fn(async (_a: unknown) => 0),
    },
    $queryRaw: vi.fn(async (strings: TemplateStringsArray, ...values: unknown[]) => {
      state.raw.push({ sql: strings.join('?'), values });
      return state.introduced;
    }),
  };
  return { state, prisma, flashcard, flashcardDeck };
});

const getSession = vi.hoisted(() => vi.fn());
vi.mock('@/lib/prisma.server', () => ({ prisma: h.prisma }));
vi.mock('@/lib/auth', () => ({ auth: { api: { getSession } } }));
vi.mock('@/lib/rate-limit.server', async (orig) => ({
  ...(await orig<typeof import('@/lib/rate-limit.server')>()),
  checkRateLimit: vi.fn(async () => ({ allowed: true })),
}));
vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (config: unknown) => ({ options: config }),
}));

const { reviewQueue } = await import('@/lib/study/queue.server');
const { newIntroducedToday, setDeckPace, learnMore } = await import('@/lib/study/pace.server');
const { route } = await import('@/lib/study/api/study.decks.$id.pace.server');

const NOW = new Date('2026-11-30T15:00:00Z');
const card = (id: string, deckId: string, deck: Record<string, unknown> = {}) => ({
  id,
  front: id,
  back: id,
  kind: 'basic',
  sourceId: null,
  clozeIndex: null,
  deckId,
  deck: { title: `Deck ${deckId}`, newPerDay: null, extraNewDay: null, extraNew: 0, ...deck },
});
const many = (deckId: string, n: number, deck: Record<string, unknown> = {}) =>
  Array.from({ length: n }, (_, i) => card(`${deckId}${i}`, deckId, deck));

beforeEach(() => {
  vi.clearAllMocks();
  h.state.fresh = [];
  h.state.introduced = [];
  h.state.raw = [];
  h.state.deckRows = new Map([
    ['mine', { userId: 'me', newPerDay: null, extraNewDay: null, extraNew: 0 }],
    ['theirs', { userId: 'other', newPerDay: null, extraNewDay: null, extraNew: 0 }],
  ]);
  getSession.mockResolvedValue({ user: { id: 'me' }, session: { id: 's' } });
});

describe('the queue with a pace', () => {
  it('a deck with no pace is the single query it always was, with no daily count', async () => {
    h.state.fresh = [many('a', 3)];
    const res = await reviewQueue('me', undefined, NOW);
    expect(res.cards).toHaveLength(3);
    expect(h.flashcard.findMany).toHaveBeenCalledTimes(1);
    expect(h.state.raw).toHaveLength(0);
    expect(res.learnMore).toBeUndefined();
  });

  it('adds at most the deck allowance: a pace of 5 gives 5 in the first session', async () => {
    h.state.fresh = [many('a', 20, { newPerDay: 5 }), many('a', 0)];
    const res = await reviewQueue('me', undefined, NOW);
    expect(res.cards.map((c) => c.id)).toEqual(['a0', 'a1', 'a2', 'a3', 'a4']);
    expect(res.includesNew).toBe(true);
  });

  it('adds none in a second session the same day (five were first graded today)', async () => {
    h.state.introduced = [{ deckId: 'a', n: 5 }];
    h.state.fresh = [many('a', 20, { newPerDay: 5 }), []];
    const res = await reviewQueue('me', undefined, NOW);
    expect(res.cards).toHaveLength(0);
    expect(res.includesNew).toBe(false);
    expect(res.learnMore).toEqual([{ deckId: 'a', deckTitle: 'Deck a' }]);
  });

  it('a zero pace adds none and offers "learn more"', async () => {
    h.state.fresh = [many('a', 4, { newPerDay: 0 }), []];
    const res = await reviewQueue('me', undefined, NOW);
    expect(res.cards).toHaveLength(0);
    expect(res.learnMore?.map((d) => d.deckId)).toEqual(['a']);
  });

  it('refills from the decks after a used-up paced deck, leaving that deck out of the next read', async () => {
    h.state.introduced = [{ deckId: 'a', n: 2 }];
    h.state.fresh = [many('a', 20, { newPerDay: 2 }), many('b', 6)];
    const res = await reviewQueue('me', undefined, NOW);
    expect(res.cards.map((c) => c.deckId)).toEqual(['b', 'b', 'b', 'b', 'b', 'b']);
    const second = h.flashcard.findMany.mock.calls[1]?.[0] as { where: { deckId: unknown }; take: number };
    expect(second.where.deckId).toEqual({ notIn: ['a'] });
    expect(second.take).toBe(20);
  });

  it('paced cards count toward the batch of 20 with unpaced ones', async () => {
    h.state.fresh = [[...many('a', 5, { newPerDay: 5 }), ...many('b', 15)]];
    const res = await reviewQueue('me', undefined, NOW);
    expect(res.cards).toHaveLength(20);
  });

  it('"Learn more" lifts the allowance by the extra for today only', async () => {
    h.state.introduced = [{ deckId: 'a', n: 5 }];
    h.state.fresh = [many('a', 30, { newPerDay: 5, extraNewDay: '2026-11-30', extraNew: 10 })];
    const res = await reviewQueue('me', undefined, NOW);
    expect(res.cards).toHaveLength(10);
  });

  it('counts the day in the member zone: 2am UTC is still the evening before in Los Angeles', async () => {
    h.state.fresh = [many('a', 3, { newPerDay: 5 })];
    await reviewQueue('me', undefined, new Date('2026-11-30T02:00:00Z'), undefined, 'America/Los_Angeles');
    expect(h.state.raw[0]?.values).toContainEqual(new Date('2026-11-29T08:00:00Z'));
  });
});

describe('the daily count reads the review log', () => {
  it('names flashcard_review_log and its quoted camelCase columns, and binds every value', async () => {
    await newIntroducedToday('me', ['a', 'b'], new Date('2026-11-30T00:00:00Z'));
    const { sql, values } = h.state.raw[0]!;
    expect(sql).toContain('flashcard_review_log');
    for (const col of ['"userId"', '"deckId"', '"cardId"', '"reviewedAt"']) expect(sql).toContain(col);
    expect(sql).not.toMatch(/\bflashcard_review\b(?!_log)/);
    expect(values).toContain('me');
    expect(values.some((v) => (v as { values?: unknown[] }).values?.join() === 'a,b')).toBe(true);
  });

  it('does nothing for no decks', async () => {
    expect((await newIntroducedToday('me', [], NOW)).size).toBe(0);
    expect(h.state.raw).toHaveLength(0);
  });
});

describe('who may set a pace', () => {
  it('the owner sets it', async () => {
    const r = await setDeckPace('me', 'mine', { newPerDay: 5 }, NOW);
    expect(r).toMatchObject({ ok: true, newPerDay: 5 });
  });

  it('refuses another member’s deck and changes nothing', async () => {
    const r = await setDeckPace('me', 'theirs', { newPerDay: 5 }, NOW);
    expect(r).toEqual({ ok: false, status: 404, error: 'Not found' });
    expect(h.state.deckRows.get('theirs')?.newPerDay).toBeNull();
    expect(h.flashcardDeck.updateMany.mock.calls[0]?.[0]).toMatchObject({ where: { id: 'theirs', userId: 'me' } });
  });

  it('refuses a test date in the past in the member zone', async () => {
    const r = await setDeckPace('me', 'mine', { testDate: '2026-11-29', tz: 'UTC' }, NOW);
    expect(r).toMatchObject({ ok: false, status: 400 });
    expect(await setDeckPace('me', 'mine', { testDate: '2026-11-30', tz: 'UTC' }, NOW)).toMatchObject({ ok: true });
  });

  it('"Learn more" needs a paced deck of your own', async () => {
    expect(await learnMore('me', 'theirs', 'UTC', NOW)).toMatchObject({ ok: false, status: 404 });
    const unpaced = await learnMore('me', 'mine', 'UTC', NOW);
    expect(unpaced.ok).toBe(true);
  });

  it('the endpoint answers 404 for a deck that is not yours and 400 for a bad body', async () => {
    type H = (a: { request: Request; params: Record<string, string> }) => Promise<Response>;
    const { PATCH } = { PATCH: handlersOf<H>(route).PATCH! };
    const headers = {
      cookie: 'better-auth.session_token=abc',
      'cf-connecting-ip': '9.9.9.9',
      'content-type': 'application/json',
    };
    const send = (id: string, body: unknown) =>
      PATCH({
        request: new Request(`https://rmhstudios.com/api/study/decks/${id}/pace`, {
          method: 'PATCH',
          headers,
          body: JSON.stringify(body),
        }),
        params: { id },
      });
    expect((await send('theirs', { newPerDay: 5 })).status).toBe(404);
    expect((await send('mine', { newPerDay: 500 })).status).toBe(400);
    expect((await send('mine', { newPerDay: 5 })).status).toBe(200);
  });
});

describe('a copy does not inherit the pace', () => {
  it('cloneDeck writes none of the pace columns', () => {
    const src = readFileSync('lib/study.server.ts', 'utf8');
    const create = src.slice(src.indexOf('tx.flashcardDeck.create'), src.indexOf('tx.flashcardDeck.create') + 600);
    expect(create).toContain('clonedFromId: sourceId');
    expect(create).not.toMatch(/newPerDay|testDate|extraNew/);
  });
});
