/**
 * `/api/v1/me/decks*`, driven through the real developer-API wrapper and the real deck editor with an
 * in-memory study database: scopes per method, the key owner being the only member whose decks exist
 * (404 everywhere else), generated cards never listed or writable, the 100-card batch, all-or-nothing
 * writes, the 2,000-row cap, and the upsert by external id being idempotent under the deck lock.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handlersOf, type TestHandler } from '@/lib/__tests__/api-handlers-of';
import type { FakeDb } from '@/lib/study/__tests__/fake-study-db';

const h = vi.hoisted(() => ({
  db: null as unknown as FakeDb,
  keyRow: {
    current: null as Record<string, unknown> | null,
  },
  raw: vi.fn(async (..._args: unknown[]) => [] as unknown[]),
}));

vi.mock('@/lib/prisma.server', async () => {
  const { newFakeDb: fresh, makeStudyPrisma: make } = await import('@/lib/study/__tests__/fake-study-db');
  h.db = fresh();
  const study = make(h.db);
  return {
    prisma: {
      ...study,
      flashcardDeck: {
        ...study.flashcardDeck,
        // The fake keeps no `updatedAt`; a real row always has one.
        findFirst: async (args: { where: Record<string, unknown> }) => {
          const row = await study.flashcardDeck.findFirst(args);
          return (
            row && {
              ...row,
              updatedAt: new Date('2026-11-20T10:00:00.000Z'),
            }
          );
        },
        findMany: async ({
          where,
        }: {
          where: {
            userId: string;
          };
        }) =>
          h.db.decks
            .filter((d) => d.userId === where.userId)
            .map((d) => ({
              ...d,
              updatedAt: new Date('2026-11-20T10:00:00.000Z'),
            })),
        deleteMany: async ({
          where,
        }: {
          where: {
            id: string;
            userId: string;
          };
        }) => {
          const before = h.db.decks.length;
          h.db.decks = h.db.decks.filter((d) => !(d.id === where.id && d.userId === where.userId));
          h.db.cards = h.db.cards.filter((c) => h.db.decks.some((d) => d.id === c.deckId));
          if (h.db.decks.length < before) h.db.writes++;
          return {
            count: before - h.db.decks.length,
          };
        },
      },
      $queryRaw: h.raw,
      developerApiKey: {
        findUnique: vi.fn(async () => h.keyRow.current),
        update: vi.fn(async () => ({})),
      },
      apiKeyRefusalDaily: {
        upsert: vi.fn(async () => ({})),
      },
      apiIdempotencyKey: {
        findUnique: vi.fn(),
        create: vi.fn(),
        deleteMany: vi.fn(),
      },
    },
  };
});
vi.mock('@/lib/entitlements', () => ({
  getUserTier: vi.fn(async () => 'starter'),
  hasApiAccess: () => true,
}));
vi.mock('@/lib/admin-audit.server', () => ({
  getActiveBan: vi.fn(async () => null),
}));
vi.mock('@/lib/redis.server', () => ({
  redisRateLimit: vi.fn(async () => null),
  redisIncrBy: vi.fn(async () => null),
}));
vi.mock('@/lib/api/usage.server', () => ({
  recordUsage: vi.fn(),
}));
vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (config: unknown) => ({
    options: config,
  }),
}));

const routes = {
  decks: handlersOf<TestHandler>((await import('../../../app/routes/api/v1/me/decks')).Route),
  deck: handlersOf<TestHandler>((await import('../../../app/routes/api/v1/me/decks/$id')).Route),
  cards: handlersOf<TestHandler>((await import('../../../app/routes/api/v1/me/decks/$id/cards')).Route),
  card: handlersOf<TestHandler>((await import('../../../app/routes/api/v1/me/decks/$id/cards/$cardId')).Route),
  upsert: handlersOf<TestHandler>(
    (await import('../../../app/routes/api/v1/me/decks/$id/cards/by-external-id/$externalId')).Route,
  ),
  due: handlersOf<TestHandler>((await import('../../../app/routes/api/v1/me/decks/$id/due')).Route),
};
const { KEY_PREFIX } = await import('@/lib/api/developer-auth.server');

const OWNER = 'owner_1';
const BEARER = `Bearer ${KEY_PREFIX}${'k'.repeat(24)}`;

function key(scopes: string[]) {
  return {
    id: 'key_1',
    userId: OWNER,
    revokedAt: null,
    expiresAt: null,
    scopes,
    testMode: false,
    allowedCidrs: [] as string[],
    rateLimitPerMinute: null,
  };
}

function call(
  handler: TestHandler | undefined,
  method: string,
  params: Record<string, string>,
  body?: unknown,
  path = '/api/v1/me/decks',
) {
  if (!handler) throw new Error(`no ${method} handler`);
  return handler({
    request: new Request(`https://rmhstudios.com${path}`, {
      method,
      headers: {
        authorization: BEARER,
        'cf-connecting-ip': '203.0.113.9',
        ...(body === undefined
          ? {}
          : {
              'content-type': 'application/json',
            }),
      },
      ...(body === undefined
        ? {}
        : {
            body: JSON.stringify(body),
          }),
    }),
    params,
  });
}

const mine = (n: number) => `mine${n}`;

beforeEach(() => {
  vi.clearAllMocks();
  const db = h.db;
  db.decks = [
    {
      id: 'mine',
      userId: OWNER,
      title: 'Mine',
      description: null,
      isPublic: false,
      cardCount: 1,
    },
    {
      id: 'theirs',
      userId: 'other',
      title: 'Theirs',
      description: null,
      isPublic: true,
      cardCount: 1,
    },
  ];
  db.cards = [
    {
      id: 'a',
      deckId: 'mine',
      front: 'f',
      back: 'b',
      position: 0,
      kind: 'reversible',
    },
    {
      id: 'a-rev',
      deckId: 'mine',
      front: 'b',
      back: 'f',
      position: 0,
      kind: 'reversible',
      sourceId: 'a',
    },
    {
      id: 'x',
      deckId: 'theirs',
      front: 'xf',
      back: 'xb',
      position: 0,
    },
  ];
  db.reviews = [];
  db.writes = 0;
  db.locks = [];
  db.nextId = 1;
  h.keyRow.current = key(['read:study', 'write:study']);
  h.raw.mockResolvedValue([]);
});

describe('scopes', () => {
  it('a read:study key cannot write on any method and nothing is written', async () => {
    h.keyRow.current = key(['read:study']);
    const card = {
      front: 'q',
      back: 'a',
    };
    const results = await Promise.all([
      call(
        routes.decks.POST,
        'POST',
        {},
        {
          title: 'T',
        },
      ),
      call(
        routes.deck.PATCH,
        'PATCH',
        {
          id: 'mine',
        },
        {
          title: 'T',
        },
      ),
      call(routes.deck.DELETE, 'DELETE', {
        id: 'mine',
      }),
      call(
        routes.cards.POST,
        'POST',
        {
          id: 'mine',
        },
        {
          cards: [card],
        },
      ),
      call(
        routes.card.PATCH,
        'PATCH',
        {
          id: 'mine',
          cardId: 'a',
        },
        {
          front: 'z',
        },
      ),
      call(routes.card.DELETE, 'DELETE', {
        id: 'mine',
        cardId: 'a',
      }),
      call(
        routes.upsert.PUT,
        'PUT',
        {
          id: 'mine',
          externalId: 'e1',
        },
        card,
      ),
    ]);
    for (const res of results) {
      expect(res.status).toBe(403);
      expect(res.headers.get('X-Accepted-Scope')).toBe('write:study');
    }
    expect(h.db.writes).toBe(0);
    expect(h.db.cards).toHaveLength(3);
  });

  it('a key without a study scope, or with only write:study, cannot read', async () => {
    for (const scopes of [['read:profile'], ['write:study']]) {
      h.keyRow.current = key(scopes);
      const results = await Promise.all([
        call(routes.decks.GET, 'GET', {}),
        call(routes.deck.GET, 'GET', {
          id: 'mine',
        }),
        call(routes.cards.GET, 'GET', {
          id: 'mine',
        }),
        call(routes.due.GET, 'GET', {
          id: 'mine',
        }),
      ]);
      for (const res of results) {
        expect(res.status).toBe(403);
        expect(res.headers.get('X-Accepted-Scope')).toBe('read:study');
      }
    }
  });
});

describe("another member's deck is 404 on every endpoint", () => {
  it('answers 404 and writes nothing', async () => {
    const card = {
      front: 'q',
      back: 'a',
    };
    const results = await Promise.all([
      call(routes.deck.GET, 'GET', {
        id: 'theirs',
      }),
      call(
        routes.deck.PATCH,
        'PATCH',
        {
          id: 'theirs',
        },
        {
          title: 'T',
        },
      ),
      call(routes.deck.DELETE, 'DELETE', {
        id: 'theirs',
      }),
      call(routes.cards.GET, 'GET', {
        id: 'theirs',
      }),
      call(
        routes.cards.POST,
        'POST',
        {
          id: 'theirs',
        },
        {
          cards: [card],
        },
      ),
      call(
        routes.card.PATCH,
        'PATCH',
        {
          id: 'theirs',
          cardId: 'x',
        },
        {
          front: 'z',
        },
      ),
      call(routes.card.DELETE, 'DELETE', {
        id: 'theirs',
        cardId: 'x',
      }),
      call(
        routes.upsert.PUT,
        'PUT',
        {
          id: 'theirs',
          externalId: 'e1',
        },
        card,
      ),
      call(routes.due.GET, 'GET', {
        id: 'theirs',
      }),
      call(routes.deck.GET, 'GET', {
        id: 'missing',
      }),
    ]);
    for (const res of results) expect(res.status).toBe(404);
    expect(h.db.writes).toBe(0);
    expect(h.db.decks.map((d) => d.id)).toContain('theirs');
    expect(h.db.cards.find((c) => c.id === 'x')?.front).toBe('xf');
  });

  it("a card of the owner's other deck is not reachable through this deck's path", async () => {
    h.db.decks.push({
      id: 'second',
      userId: OWNER,
      title: 'S',
      description: null,
      isPublic: false,
      cardCount: 0,
    });
    expect(
      (
        await call(
          routes.card.PATCH,
          'PATCH',
          {
            id: 'second',
            cardId: 'a',
          },
          {
            front: 'z',
          },
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await call(routes.card.DELETE, 'DELETE', {
          id: 'second',
          cardId: 'a',
        })
      ).status,
    ).toBe(404);
  });
});

describe('generated cards', () => {
  it('are never listed', async () => {
    const res = await call(routes.cards.GET, 'GET', {
      id: 'mine',
    });
    const body = (await res.json()) as {
      data: {
        id: string;
        externalId: string | null;
      }[];
    };
    expect(body.data.map((c) => c.id)).toEqual(['a']);
    expect(body.data[0]).toMatchObject({
      id: 'a',
      kind: 'reversible',
      front: 'f',
      back: 'b',
      position: 0,
    });
  });

  it('are never writable: a sibling id is 404 for edit and delete', async () => {
    expect(
      (
        await call(
          routes.card.PATCH,
          'PATCH',
          {
            id: 'mine',
            cardId: 'a-rev',
          },
          {
            front: 'z',
          },
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await call(routes.card.DELETE, 'DELETE', {
          id: 'mine',
          cardId: 'a-rev',
        })
      ).status,
    ).toBe(404);
    expect(h.db.cards.find((c) => c.id === 'a-rev')?.front).toBe('b');
  });

  it('a reversible card created through the API gets its sibling, and cardCount counts authored cards', async () => {
    const res = await call(
      routes.cards.POST,
      'POST',
      {
        id: 'mine',
      },
      {
        cards: [
          {
            kind: 'reversible',
            front: 'q',
            back: 'a',
          },
        ],
      },
    );
    expect(res.status).toBe(201);
    const made = h.db.cards.filter((c) => c.deckId === 'mine' && c.id !== 'a' && c.id !== 'a-rev');
    expect(made).toHaveLength(2);
    expect(made.filter((c) => c.sourceId)).toHaveLength(1);
    expect(h.db.decks.find((d) => d.id === 'mine')?.cardCount).toBe(2);
    expect(h.db.decks.find((d) => d.id === 'mine')?.cardsChangedAt).toBeInstanceOf(Date);
  });
});

describe('batch create', () => {
  const basic = (i: number) => ({
    front: `q${i}`,
    back: `a${i}`,
  });

  it('refuses 101 cards before writing', async () => {
    const res = await call(
      routes.cards.POST,
      'POST',
      {
        id: 'mine',
      },
      {
        cards: Array.from(
          {
            length: 101,
          },
          (_, i) => basic(i),
        ),
      },
    );
    expect(res.status).toBe(400);
    expect(h.db.writes).toBe(0);
  });

  it('accepts exactly 100 in one call, in order', async () => {
    const res = await call(
      routes.cards.POST,
      'POST',
      {
        id: 'mine',
      },
      {
        cards: Array.from(
          {
            length: 100,
          },
          (_, i) => basic(i),
        ),
      },
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      data: {
        front: string;
      }[];
      cardCount: number;
    };
    expect(body.data).toHaveLength(100);
    expect(body.cardCount).toBe(101);
    expect(h.db.locks).toContain('deck-cards:mine');
  });

  it('writes nothing when one card is invalid', async () => {
    const res = await call(
      routes.cards.POST,
      'POST',
      {
        id: 'mine',
      },
      {
        cards: [
          basic(1),
          {
            front: 'no back',
          },
          basic(3),
        ],
      },
    );
    expect(res.status).toBe(400);
    expect(h.db.writes).toBe(0);
    expect(h.db.cards).toHaveLength(3);
  });

  it('writes nothing when an external id repeats or is already used', async () => {
    const dup = await call(
      routes.cards.POST,
      'POST',
      {
        id: 'mine',
      },
      {
        cards: [
          {
            ...basic(1),
            externalId: 'same',
          },
          {
            ...basic(2),
            externalId: 'same',
          },
        ],
      },
    );
    expect(dup.status).toBe(409);
    await call(
      routes.upsert.PUT,
      'PUT',
      {
        id: 'mine',
        externalId: 'taken',
      },
      basic(9),
    );
    h.db.writes = 0;
    const used = await call(
      routes.cards.POST,
      'POST',
      {
        id: 'mine',
      },
      {
        cards: [
          basic(1),
          {
            ...basic(2),
            externalId: 'taken',
          },
        ],
      },
    );
    expect(used.status).toBe(409);
    expect(h.db.writes).toBe(0);
  });

  it('enforces the 2,000-row cap, generated rows included, and writes nothing over it', async () => {
    h.db.cards = Array.from(
      {
        length: 1999,
      },
      (_, i) => ({
        id: mine(i),
        deckId: 'mine',
        front: 'f',
        back: 'b',
        position: i,
      }),
    );
    const over = await call(
      routes.cards.POST,
      'POST',
      {
        id: 'mine',
      },
      {
        cards: [basic(1), basic(2)],
      },
    );
    expect(over.status).toBe(400);
    expect(h.db.cards).toHaveLength(1999);
    const reversible = await call(
      routes.cards.POST,
      'POST',
      {
        id: 'mine',
      },
      {
        cards: [
          {
            kind: 'reversible',
            ...basic(1),
          },
        ],
      },
    );
    expect(reversible.status).toBe(400);
    expect(h.db.cards).toHaveLength(1999);
    const fits = await call(
      routes.cards.POST,
      'POST',
      {
        id: 'mine',
      },
      {
        cards: [basic(1)],
      },
    );
    expect(fits.status).toBe(201);
    expect(h.db.cards).toHaveLength(2000);
  });
});

describe('upsert by external id', () => {
  const put = (body: unknown, externalId = 'note-1') =>
    call(
      routes.upsert.PUT,
      'PUT',
      {
        id: 'mine',
        externalId,
      },
      body,
    );

  it('creates, then the same upsert changes nothing and writes nothing', async () => {
    const first = await put({
      front: 'hablar',
      back: 'to speak',
    });
    expect(first.status).toBe(201);
    const created = (await first.json()) as {
      id: string;
      externalId: string;
    };
    expect(created.externalId).toBe('note-1');
    const rows = h.db.cards.length;
    const count = h.db.decks.find((d) => d.id === 'mine')?.cardCount;
    const changedAt = h.db.decks.find((d) => d.id === 'mine')?.cardsChangedAt;
    h.db.writes = 0;

    const second = await put({
      front: 'hablar',
      back: 'to speak',
    });
    expect(second.status).toBe(200);
    expect(
      (
        (await second.json()) as {
          id: string;
        }
      ).id,
    ).toBe(created.id);
    expect(h.db.cards).toHaveLength(rows);
    expect(h.db.decks.find((d) => d.id === 'mine')?.cardCount).toBe(count);
    expect(h.db.decks.find((d) => d.id === 'mine')?.cardsChangedAt).toBe(changedAt);
    expect(h.db.writes).toBe(0);
    expect(h.db.locks.filter((l) => l === 'deck-cards:mine').length).toBeGreaterThanOrEqual(2);
  });

  it('updates the same card when the content changes, through the editor (cardsChangedAt moves)', async () => {
    const first = (await (
      await put({
        front: 'hablar',
        back: 'to speak',
      })
    ).json()) as {
      id: string;
    };
    const deck = h.db.decks.find((d) => d.id === 'mine');
    if (deck) deck.cardsChangedAt = null;
    const res = await put({
      front: 'hablar',
      back: 'to talk',
    });
    expect(res.status).toBe(200);
    expect(
      (await res.json()) as {
        id: string;
        back: string;
      },
    ).toMatchObject({
      id: first.id,
      back: 'to talk',
    });
    expect(h.db.cards.filter((c) => c.id === first.id)).toHaveLength(1);
    expect(deck?.cardsChangedAt).toBeInstanceOf(Date);
  });

  it('refuses an invalid card and a full deck', async () => {
    expect(
      (
        await put({
          front: 'no back',
        })
      ).status,
    ).toBe(400);
    h.db.cards = Array.from(
      {
        length: 2000,
      },
      (_, i) => ({
        id: mine(i),
        deckId: 'mine',
        front: 'f',
        back: 'b',
        position: i,
      }),
    );
    expect(
      (
        await put({
          front: 'q',
          back: 'a',
        })
      ).status,
    ).toBe(400);
    expect(h.db.cards).toHaveLength(2000);
  });
});

describe('decks', () => {
  it('lists only the key owner decks with the documented shape', async () => {
    const res = await call(routes.decks.GET, 'GET', {});
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: Record<string, unknown>[];
      nextCursor: string | null;
    };
    expect(body.data.map((d) => d.id)).toEqual(['mine']);
    expect(Object.keys(body.data[0] ?? {}).sort()).toEqual([
      'cardCount',
      'description',
      'dueCount',
      'id',
      'isPublic',
      'suspended',
      'title',
      'updatedAt',
    ]);
  });

  it('refuses a bad limit and a malformed cursor', async () => {
    const big = await routes.decks.GET?.({
      request: new Request('https://rmhstudios.com/api/v1/me/decks?limit=101', {
        headers: {
          authorization: BEARER,
        },
      }),
      params: {},
    });
    expect(big?.status).toBe(400);
    const bad = await routes.decks.GET?.({
      request: new Request('https://rmhstudios.com/api/v1/me/decks?cursor=!!!', {
        headers: {
          authorization: BEARER,
        },
      }),
      params: {},
    });
    expect(bad?.status).toBe(400);
  });

  it('creates, updates and deletes the owner deck only', async () => {
    const created = await call(
      routes.decks.POST,
      'POST',
      {},
      {
        title: '  New  ',
      },
    );
    expect(created.status).toBe(201);
    const deck = (await created.json()) as {
      id: string;
      title: string;
    };
    expect(deck.title).toBe('New');
    expect(h.db.decks.find((d) => d.id === deck.id)?.userId).toBe(OWNER);
    expect(
      (
        await call(
          routes.deck.PATCH,
          'PATCH',
          {
            id: deck.id,
          },
          {
            description: 'd',
          },
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await call(routes.deck.DELETE, 'DELETE', {
          id: deck.id,
        })
      ).status,
    ).toBe(204);
    expect(h.db.decks.find((d) => d.id === deck.id)).toBeUndefined();
  });

  it('refuses a body with unknown or invalid fields', async () => {
    expect(
      (
        await call(
          routes.decks.POST,
          'POST',
          {},
          {
            title: 'T',
            userId: 'other',
          },
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await call(
          routes.decks.POST,
          'POST',
          {},
          {
            title: '',
          },
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await call(
          routes.deck.PATCH,
          'PATCH',
          {
            id: 'mine',
          },
          {},
        )
      ).status,
    ).toBe(400);
  });

  it('refuses a new deck past 200', async () => {
    for (let i = 0; i < 199; i++) {
      h.db.decks.push({
        id: `d${i}`,
        userId: OWNER,
        title: 'x',
        description: null,
        isPublic: false,
        cardCount: 0,
      });
    }
    expect(h.db.decks.filter((d) => d.userId === OWNER)).toHaveLength(200);
    expect(
      (
        await call(
          routes.decks.POST,
          'POST',
          {},
          {
            title: 'one more',
          },
        )
      ).status,
    ).toBe(400);
  });
});

describe('due counts', () => {
  it('returns counts only, never card content, from the member own reviews', async () => {
    h.raw.mockResolvedValue([
      {
        deckId: 'mine',
        dueNow: 3,
        dueNext24h: 2,
      },
    ]);
    const res = await call(routes.due.GET, 'GET', {
      id: 'mine',
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toMatchObject({
      deckId: 'mine',
      dueNow: 3,
      dueNext24h: 2,
    });
    expect(Object.keys(body).sort()).toEqual(['asOf', 'deckId', 'dueNext24h', 'dueNow']);
  });

  it('uses the real table names and quoted column names', () => {
    const schema = readFileSync(join(process.cwd(), 'prisma/schema/rmhstudy.prisma'), 'utf8');
    expect(schema).toContain('@@map("flashcard")');
    expect(schema).toContain('@@map("flashcard_review")');
    const sql = (
      h.raw.mock.calls[0]?.[0] as
        | {
            strings?: string[];
          }
        | undefined
    )?.strings?.join('?');
    // The query ran in the previous test; run it once more so this one stands alone.
    return (async () => {
      await call(routes.due.GET, 'GET', {
        id: 'mine',
      });
      const text =
        (
          (
            h.raw.mock.calls.at(-1)?.[0] as {
              strings: string[];
            }
          ).strings ?? []
        ).join('?') ||
        sql ||
        '';
      for (const needle of [
        'FROM "flashcard" c',
        'LEFT JOIN "flashcard_review" r',
        'r."cardId" = c."id"',
        'r."userId" =',
        'c."deckId"',
        'r."dueAt"',
        'c."sourceId" IS NULL',
      ]) {
        expect(text).toContain(needle);
      }
      // An authored cloze row is never reviewed, so it never counts as due (the deck page's rule).
      expect(text).toContain(`NOT (c."kind" = 'cloze' AND c."sourceId" IS NULL)`);
    })();
  });
});

describe('reviews are not writable', () => {
  const dir = join(process.cwd(), 'app/routes/api/v1/me/decks');
  const walk = (d: string): string[] =>
    readdirSync(d).flatMap((n) => (statSync(join(d, n)).isDirectory() ? walk(join(d, n)) : [join(d, n)]));

  it('has no review route and no review write in the v1 study code', () => {
    // Match the path below the routes folder: a checkout whose own path says "review" must not fail the test.
    const files = walk(dir);
    expect(files.filter((f) => /review|grade/i.test(f.slice(dir.length)))).toEqual([]);
    for (const file of [...files, join(process.cwd(), 'lib/api/v1/study.server.ts')]) {
      expect(readFileSync(file, 'utf8')).not.toMatch(
        /flashcardReview\.(create|upsert|update|delete)|flashcardReviewLog/,
      );
    }
  });

  it('the registry documents no review endpoint', async () => {
    const { ENDPOINTS } = await import('@/lib/api/registry');
    expect(ENDPOINTS.filter((e) => e.path.includes('/me/decks') && /review|grade/i.test(e.path))).toEqual([]);
    expect(ENDPOINTS.filter((e) => e.path.includes('/me/decks')).length).toBe(11);
  });
});
