/**
 * `GET /api/v1/me/decks/{id}/review` and `POST /api/v1/me/decks/{id}/cards/{cardId}/review` (s12-12), driven through
 * the real developer-API wrapper, the real queue and the real `reviewCard` on a stand-in Prisma: the explicit
 * `write:study-reviews` scope (no wildcard and no `write:study` grades), no quest or XP from an API grade, the
 * 120-a-minute ceiling per key owner, a card of another deck or an unreadable deck is 404, a suspended card is 409,
 * a retried `Idempotency-Key` grades once, no card sound in any response, and the deck's pace limits new cards.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handlersOf, type TestHandler } from '@/lib/__tests__/api-handlers-of';

type Row = Record<string, unknown>;
const h = vi.hoisted(() => ({
  scopes: [] as string[],
  keyN: 0,
  decks: new Map<string, { id: string; isPublic: boolean; userId: string }>(),
  cards: [] as Row[],
  reviews: [] as Row[],
  scheduled: [] as Row[],
  fresh: [] as Row[][],
  externalIds: new Map<string, string | null>(),
  introduced: [] as { deckId: string; n: number }[],
  idempotency: new Map<string, Row>(),
  saveReview: vi.fn(async (_input: unknown) => ({ leech: false })),
  recordStudyReview: vi.fn(async (_userId: string) => undefined),
  queueCalls: [] as Row[],
}));

vi.mock('@/lib/api/developer-auth.server', async (orig) => ({
  ...(await orig<typeof import('@/lib/api/developer-auth.server')>()),
  authenticateApiKey: async () => ({
    ok: true,
    userId: 'me',
    tier: 'enterprise',
    keyId: `key_${h.keyN}`,
    scopes: h.scopes,
    testMode: false,
    allowedCidrs: [],
    rateLimitPerMinute: null,
  }),
  touchApiKeyLastUsed: () => undefined,
}));
vi.mock('@/lib/redis.server', () => ({ redisRateLimit: async () => null, redisIncrBy: async () => null }));
vi.mock('@/lib/api/usage.server', () => ({ recordUsage: vi.fn() }));
vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (config: unknown) => ({ options: config }),
}));
vi.mock('@/lib/study/review-log.server', () => ({ saveReview: h.saveReview }));
vi.mock('@/lib/quests/engine.server', () => ({ recordStudyReview: h.recordStudyReview }));

vi.mock('@/lib/prisma.server', () => ({
  prisma: {
    flashcardDeck: {
      findUnique: vi.fn(async (a: { where: { id: string } }) => h.decks.get(a.where.id) ?? null),
    },
    flashcard: {
      findFirst: vi.fn(async (a: { where: { id: string; deckId: string } }) => {
        const c = h.cards.find((x) => x.id === a.where.id && x.deckId === a.where.deckId);
        if (!c || ((c.kind === 'cloze' || c.kind === 'occlusion') && c.sourceId === null)) return null;
        const deck = h.decks.get(c.deckId as string)!;
        return {
          id: c.id,
          deck: { isPublic: deck.isPublic, userId: deck.userId },
          reviews: h.reviews.filter((r) => r.cardId === c.id).map((r) => ({ suspendedAt: r.suspendedAt ?? null })),
        };
      }),
      findUnique: vi.fn(async (a: { where: { id: string } }) => {
        const c = h.cards.find((x) => x.id === a.where.id);
        if (!c) return null;
        const deck = h.decks.get(c.deckId as string)!;
        return { ...c, deck: { isPublic: deck.isPublic, userId: deck.userId } };
      }),
      findMany: vi.fn(async (a: { where: { id?: { in: string[] } } }) => {
        if (a.where.id?.in) return a.where.id.in.map((id) => ({ id, externalId: h.externalIds.get(id) ?? null }));
        h.queueCalls.push(a as unknown as Row);
        return h.fresh.shift() ?? [];
      }),
      count: vi.fn(async () => 0),
      groupBy: vi.fn(async () => []),
    },
    flashcardReview: {
      findUnique: vi.fn(async (a: { where: { userId_cardId: { cardId: string } } }) => {
        const r = h.reviews.find((x) => x.cardId === a.where.userId_cardId.cardId);
        return r ?? null;
      }),
      findMany: vi.fn(async (a: { where: { cardId?: { in: string[] }; dueAt?: unknown } }) => {
        if (a.where.cardId?.in) return h.reviews.filter((r) => a.where.cardId!.in.includes(r.cardId as string));
        h.queueCalls.push(a as unknown as Row);
        return h.scheduled;
      }),
    },
    deckEditor: { findUnique: vi.fn(async () => null) },
    userBlock: { findFirst: vi.fn(async () => null) },
    user: { findUnique: vi.fn(async () => ({ bannedUntil: null })) },
    $queryRaw: vi.fn(async () => h.introduced),
    apiIdempotencyKey: {
      findUnique: vi.fn(
        async (a: { where: { keyId_idempotency: { keyId: string; idempotency: string } } }) =>
          h.idempotency.get(`${a.where.keyId_idempotency.keyId}:${a.where.keyId_idempotency.idempotency}`) ?? null,
      ),
      create: vi.fn(async (a: { data: Row }) => {
        h.idempotency.set(`${a.data.keyId}:${a.data.idempotency}`, a.data);
        return a.data;
      }),
      deleteMany: vi.fn(async () => ({ count: 0 })),
    },
  },
}));

const review = await import('@/app/routes/api/v1/me/decks/$id/review');
const grade = await import('@/app/routes/api/v1/me/decks/$id/cards/$cardId/review');
const { gradeBudgetExceeded } = await import('@/lib/api/v1/study.server');
const { RATE_LIMIT_MULTIPLIER } = await import('@/lib/rate-limit');
/** The site's own ceiling, as its review route applies it: 120 a minute times the deployment's multiplier. */
const CEILING = 120 * RATE_LIMIT_MULTIPLIER;

const GET = handlersOf<TestHandler>(review.Route).GET!;
const POST = handlersOf<TestHandler>(grade.Route).POST!;

const SOUND = { frontSoundUrl: '/api/study/card-sound/f.webm', frontSoundText: 'words', frontSoundMs: 900 };
const NO_SOUND = { ...SOUND, frontSoundUrl: null, frontSoundText: null, frontSoundMs: null };
const NONE = {
  frontImageUrl: null,
  frontImageAlt: null,
  backImageUrl: null,
  backImageAlt: null,
  ...NO_SOUND,
  backSoundUrl: null,
  backSoundText: null,
  backSoundMs: null,
};
const queueCard = (id: string, deckId: string, over: Row = {}, deck: Row = {}) => ({
  id,
  front: `front ${id}`,
  back: `back ${id}`,
  kind: 'basic',
  sourceId: null,
  clozeIndex: null,
  deckId,
  ...NONE,
  source: null,
  deck: {
    title: 'Spanish',
    userId: 'me',
    frontLang: null,
    backLang: null,
    newPerDay: null,
    extraNewDay: null,
    extraNew: 0,
    ...deck,
  },
  ...over,
});

const get = (deckId: string, query = '') =>
  GET({
    request: new Request(`https://rmhstudios.com/api/v1/me/decks/${deckId}/review${query}`),
    params: { id: deckId },
  });
const post = (deckId: string, cardId: string, body: unknown, headers: Record<string, string> = {}) =>
  POST({
    request: new Request(`https://rmhstudios.com/api/v1/me/decks/${deckId}/cards/${cardId}/review`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
    }),
    params: { id: deckId, cardId },
  });

beforeEach(() => {
  vi.clearAllMocks();
  h.keyN++;
  h.scopes = ['read:study', 'write:study-reviews'];
  h.decks = new Map([
    ['d1', { id: 'd1', isPublic: false, userId: 'me' }],
    ['d2', { id: 'd2', isPublic: false, userId: 'me' }],
    ['theirs', { id: 'theirs', isPublic: false, userId: 'other' }],
  ]);
  h.cards = [
    { id: 'c1', deckId: 'd1', kind: 'basic', sourceId: null },
    { id: 'c2', deckId: 'd2', kind: 'basic', sourceId: null },
    { id: 'cz', deckId: 'd1', kind: 'cloze', sourceId: null },
    { id: 'ct', deckId: 'theirs', kind: 'basic', sourceId: null },
  ];
  h.reviews = [];
  h.scheduled = [];
  h.fresh = [];
  h.externalIds = new Map();
  h.introduced = [];
  h.idempotency = new Map();
  h.queueCalls = [];
});

describe('scopes', () => {
  it.each([
    ['read:study'],
    ['write:study'],
    ['*'],
    ['write:*'],
    ['read:study', 'write:study'],
    ['read:*', 'write:*', 'manage:*'],
  ])('refuses a grade from a key with %s', async (...scopes) => {
    h.scopes = scopes;
    const res = await post('d1', 'c1', { grade: 'good' });
    expect(res.status).toBe(403);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('insufficient_scope');
    expect(h.saveReview).not.toHaveBeenCalled();
  });

  it('lets write:study-reviews grade', async () => {
    h.scopes = ['write:study-reviews'];
    const res = await post('d1', 'c1', { grade: 'good' });
    expect(res.status).toBe(200);
    expect(h.saveReview).toHaveBeenCalledTimes(1);
  });

  it('needs read:study to fetch the queue, and write:study-reviews alone is not enough', async () => {
    h.scopes = ['write:study-reviews'];
    expect((await get('d1')).status).toBe(403);
    h.scopes = ['read:study'];
    expect((await get('d1')).status).toBe(200);
    h.scopes = ['read:*'];
    expect((await get('d1')).status).toBe(200);
  });
});

describe('grading', () => {
  it('maps the names to grades 0 to 3 and answers the new schedule', async () => {
    for (const [name, n] of [
      ['again', 0],
      ['hard', 1],
      ['good', 2],
      ['easy', 3],
    ] as const) {
      h.saveReview.mockClear();
      const res = await post('d1', 'c1', { grade: name });
      expect(res.status).toBe(200);
      expect((h.saveReview.mock.calls[0]![0] as { grade: number }).grade).toBe(n);
      const body = (await res.json()) as { data: { dueAt: string; intervalDays: number; leech: boolean } };
      expect(Object.keys(body.data).sort()).toEqual(['dueAt', 'intervalDays', 'leech']);
      expect(Number.isNaN(Date.parse(body.data.dueAt))).toBe(false);
    }
  });

  it('refuses a grade that is not one of the four names, and a body with other fields', async () => {
    for (const body of [{ grade: 2 }, { grade: 'GOOD' }, { grade: 'meh' }, {}, { grade: 'good', extra: 1 }]) {
      expect((await post('d1', 'c1', body)).status).toBe(400);
    }
    expect(h.saveReview).not.toHaveBeenCalled();
  });

  it('earns no quest progress or XP', async () => {
    expect((await post('d1', 'c1', { grade: 'easy' })).status).toBe(200);
    expect(h.recordStudyReview).not.toHaveBeenCalled();
  });

  it('is 404 for a card of another deck in the path, an authored cloze card and a missing card', async () => {
    for (const [deck, card] of [
      ['d1', 'c2'],
      ['d2', 'c1'],
      ['d1', 'cz'],
      ['d1', 'nope'],
    ] as const) {
      expect((await post(deck, card, { grade: 'good' })).status).toBe(404);
    }
    expect(h.saveReview).not.toHaveBeenCalled();
  });

  it('is 404 for a card in another member’s private deck, whatever the card’s state', async () => {
    h.reviews = [{ cardId: 'ct', suspendedAt: new Date() }];
    const res = await post('theirs', 'ct', { grade: 'good' });
    expect(res.status).toBe(404);
    expect(h.saveReview).not.toHaveBeenCalled();
  });

  it('is 409 for a suspended card', async () => {
    h.reviews = [
      { cardId: 'c1', suspendedAt: new Date('2026-11-01'), easeFactor: 2.5, intervalDays: 0, repetitions: 0 },
    ];
    const res = await post('d1', 'c1', { grade: 'good' });
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('conflict');
    expect(h.saveReview).not.toHaveBeenCalled();
  });

  it('grades a card of a public deck on the key owner’s own schedule', async () => {
    h.decks.set('pub', { id: 'pub', isPublic: true, userId: 'other' });
    h.cards.push({ id: 'cp', deckId: 'pub', kind: 'basic', sourceId: null });
    expect((await post('pub', 'cp', { grade: 'good' })).status).toBe(200);
    expect((h.saveReview.mock.calls[0]![0] as { userId: string }).userId).toBe('me');
  });

  it('grades once for a retried Idempotency-Key and replays the first answer', async () => {
    const first = await post('d1', 'c1', { grade: 'good' }, { 'idempotency-key': 'retry-1' });
    expect(first.status).toBe(200);
    const second = await post('d1', 'c1', { grade: 'good' }, { 'idempotency-key': 'retry-1' });
    expect(second.status).toBe(200);
    expect(second.headers.get('Idempotency-Replayed')).toBe('true');
    expect(await second.text()).toBe(await first.text());
    expect(h.saveReview).toHaveBeenCalledTimes(1);
    // The same key with a different grade is a conflict, not a second grade.
    const other = await post('d1', 'c1', { grade: 'easy' }, { 'idempotency-key': 'retry-1' });
    expect(other.status).toBe(409);
    expect(h.saveReview).toHaveBeenCalledTimes(1);
  });
});

describe('the ceiling per key owner', () => {
  it('allows the site’s 120 grades a minute (the deployment multiplier applies as on the site), then refuses, per account', () => {
    for (let i = 0; i < CEILING; i++) expect(gradeBudgetExceeded('budget-owner')).toBe(false);
    expect(gradeBudgetExceeded('budget-owner')).toBe(true);
    expect(gradeBudgetExceeded('another-owner')).toBe(false);
  });

  it('answers 429 from the route when the owner is over it', async () => {
    for (let i = 0; i < CEILING; i++) gradeBudgetExceeded('me');
    const res = await post('d1', 'c1', { grade: 'good' });
    expect(res.status).toBe(429);
    expect(h.saveReview).not.toHaveBeenCalled();
  });
});

describe('the queue', () => {
  it('returns the due cards of that one deck in the queue’s order, with schedule and external id', async () => {
    const due = new Date('2026-11-24T08:00:00Z');
    h.scheduled = [{ dueAt: due, card: queueCard('c1', 'd1') }];
    h.fresh = [[queueCard('n1', 'd1'), queueCard('n2', 'd1')]];
    h.reviews = [{ cardId: 'c1', dueAt: due, intervalDays: 6, suspendedAt: null }];
    h.externalIds = new Map([['c1', 'ext-1']]);
    const res = await get('d1');
    expect(res.status).toBe(200);
    const { data } = (await res.json()) as { data: Row[] };
    expect(data.map((c) => c.id)).toEqual(['c1', 'n1', 'n2']);
    expect(data[0]).toMatchObject({
      kind: 'basic',
      front: 'front c1',
      back: 'back c1',
      clozeIndex: null,
      externalId: 'ext-1',
      frontImage: null,
      backImage: null,
      occlusion: null,
      schedule: { state: 'review', dueAt: due.toISOString(), intervalDays: 6 },
    });
    expect(data[1]).toMatchObject({ externalId: null, schedule: { state: 'new', dueAt: null, intervalDays: 0 } });
  });

  it('narrows the queue to the deck in the path, in both the scheduled and the new-card reads', async () => {
    h.fresh = [[queueCard('n1', 'd1')]];
    await get('d1');
    expect(h.queueCalls).toHaveLength(2);
    for (const call of h.queueCalls) {
      const text = JSON.stringify(call);
      expect(text).toContain('"AND"');
      expect(text).toContain('{"id":"d1"}');
    }
  });

  it('honours ?limit= (1 to 50, default 20) and refuses the rest', async () => {
    h.fresh = [Array.from({ length: 30 }, (_, i) => queueCard(`n${i}`, 'd1'))];
    expect(((await (await get('d1')).json()) as { data: Row[] }).data).toHaveLength(20);
    h.fresh = [Array.from({ length: 30 }, (_, i) => queueCard(`n${i}`, 'd1'))];
    expect(((await (await get('d1', '?limit=3')).json()) as { data: Row[] }).data).toHaveLength(3);
    for (const q of ['?limit=0', '?limit=51', '?limit=abc']) expect((await get('d1', q)).status).toBe(400);
  });

  it('gives a deck’s generated cloze and occlusion cards their kind, index and masks', async () => {
    h.fresh = [
      [
        queueCard('g1', 'd1', { kind: 'cloze', sourceId: 'cz', clozeIndex: 2, front: 'The {{c2::heart}}' }),
        queueCard('g2', 'd1', {
          kind: 'occlusion',
          sourceId: 'oc',
          clozeIndex: 1,
          source: {
            ...NONE,
            back: 'n',
            occlusion: { mode: 'hide-one', masks: [{ id: 1, x: 0.1, y: 0.1, w: 0.2, h: 0.2, label: 'aorta' }] },
          },
        }),
      ],
    ];
    const { data } = (await (await get('d1')).json()) as { data: Row[] };
    expect(data[0]).toMatchObject({ kind: 'cloze', clozeIndex: 2, occlusion: null });
    expect(data[1]).toMatchObject({
      kind: 'occlusion',
      clozeIndex: 1,
      occlusion: { mode: 'hide-one', masks: [{ id: 1, label: 'aorta' }] },
    });
    expect(Object.keys((data[1] as { occlusion: Row }).occlusion).sort()).toEqual(['masks', 'mode']);
  });

  it('is 404 for a private deck of another member and for a deck that does not exist', async () => {
    expect((await get('theirs')).status).toBe(404);
    expect((await get('missing')).status).toBe(404);
    expect(h.queueCalls).toHaveLength(0);
  });

  it('respects the deck’s pace: a pace of 2 gives 2 new cards, and none once they were taken today', async () => {
    h.fresh = [Array.from({ length: 6 }, (_, i) => queueCard(`n${i}`, 'd1', {}, { newPerDay: 2 })), []];
    const first = (await (await get('d1')).json()) as { data: Row[] };
    expect(first.data.map((c) => c.id)).toEqual(['n0', 'n1']);
    h.introduced = [{ deckId: 'd1', n: 2 }];
    h.fresh = [Array.from({ length: 6 }, (_, i) => queueCard(`n${i}`, 'd1', {}, { newPerDay: 2 })), []];
    const second = (await (await get('d1')).json()) as { data: Row[] };
    expect(second.data).toEqual([]);
  });

  it('never carries a card sound, even on the key owner’s own recorded card', async () => {
    h.scheduled = [
      {
        dueAt: new Date('2026-11-24'),
        card: queueCard('c1', 'd1', {
          ...SOUND,
          backSoundUrl: '/api/study/card-sound/b.webm',
          backSoundText: 'b',
          backSoundMs: 800,
        }),
      },
    ];
    h.reviews = [{ cardId: 'c1', dueAt: new Date('2026-11-24'), intervalDays: 1, suspendedAt: null }];
    const res = await get('d1');
    const text = await res.text();
    expect(res.status).toBe(200);
    expect(text).not.toMatch(/card-sound|Sound|transcript|durationMs/);
  });

  it('keeps the sound columns out of the code that builds the answer', () => {
    const src = readFileSync(join(__dirname, '..', 'study.server.ts'), 'utf8');
    const start = src.indexOf('export async function reviewQueueFor');
    const end = src.indexOf('/** Grades also draw on', start);
    const own = src.slice(start, end);
    expect(own.length).toBeGreaterThan(500);
    expect(own).not.toMatch(/Sound|SOUND/);
  });
});
