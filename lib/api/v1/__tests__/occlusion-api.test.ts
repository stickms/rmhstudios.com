/**
 * Picture-occlusion cards through `/api/v1/me/decks/{id}/cards*` (s09-03), driven through the real developer-API
 * wrapper and the real deck editor with an in-memory study database: a card is created with `kind: 'occlusion'`, a front
 * picture and masks, read back with `occlusion` (null on every other kind), patched without losing a sibling's review
 * history when the ids are sent back, upserted by external id, and every malformed body is an `invalid_request`.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handlersOf, type TestHandler } from '@/lib/__tests__/api-handlers-of';
import type { FakeDb } from '@/lib/study/__tests__/fake-study-db';

const h = vi.hoisted(() => ({
  db: null as unknown as FakeDb,
  keyRow: { current: null as Record<string, unknown> | null },
  /** Heads the store returns, by object key; absent means a still WebP. */
  heads: {} as Record<string, Buffer>,
}));
const STILL = vi.hoisted(() => Buffer.from('RIFF\0\0\0\0WEBPVP8X\u000a\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0', 'latin1'));
const ANIMATED = vi.hoisted(() =>
  Buffer.from('RIFF\0\0\0\0WEBPVP8X\u000a\0\0\0\u0012\0\0\0\0\0\0\0\0\0\0\0', 'latin1'),
);

vi.mock('@/lib/prisma.server', async () => {
  const { newFakeDb: fresh, makeStudyPrisma: make } = await import('@/lib/study/__tests__/fake-study-db');
  h.db = fresh();
  const study = make(h.db);
  return {
    prisma: {
      ...study,
      flashcardDeck: {
        ...study.flashcardDeck,
        findFirst: async (args: { where: Record<string, unknown> }) => {
          const row = await study.flashcardDeck.findFirst(args);
          return row && { ...row, updatedAt: new Date('2026-11-20T10:00:00.000Z') };
        },
      },
      $queryRaw: vi.fn(async () => [] as unknown[]),
      developerApiKey: { findUnique: vi.fn(async () => h.keyRow.current), update: vi.fn(async () => ({})) },
      apiKeyRefusalDaily: { upsert: vi.fn(async () => ({})) },
      apiIdempotencyKey: { findUnique: vi.fn(), create: vi.fn(), deleteMany: vi.fn() },
    },
  };
});
vi.mock('@/lib/storage/s3.server', () => ({
  deleteObject: async () => {},
  getObjectRange: async (objectKey: string) => {
    const head = h.heads[objectKey] ?? STILL;
    return { body: head, contentType: 'image/webp', start: 0, end: head.length - 1, total: head.length };
  },
}));
vi.mock('@/lib/entitlements', () => ({ getUserTier: vi.fn(async () => 'starter'), hasApiAccess: () => true }));
vi.mock('@/lib/admin-audit.server', () => ({ getActiveBan: vi.fn(async () => null) }));
vi.mock('@/lib/redis.server', () => ({
  redisRateLimit: vi.fn(async () => null),
  redisIncrBy: vi.fn(async () => null),
}));
vi.mock('@/lib/api/usage.server', () => ({ recordUsage: vi.fn() }));
vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (config: unknown) => ({ options: config }),
}));

const routes = {
  cards: handlersOf<TestHandler>((await import('../../../../app/routes/api/v1/me/decks/$id/cards')).Route),
  card: handlersOf<TestHandler>((await import('../../../../app/routes/api/v1/me/decks/$id/cards/$cardId')).Route),
  upsert: handlersOf<TestHandler>(
    (await import('../../../../app/routes/api/v1/me/decks/$id/cards/by-external-id/$externalId')).Route,
  ),
};
const { KEY_PREFIX } = await import('@/lib/api/developer-auth.server');

const OWNER = 'owner_1';
const BEARER = `Bearer ${KEY_PREFIX}${'k'.repeat(24)}`;
const urlOf = (name: string) => `/api/feed/image/${name}.webp`;

function call(handler: TestHandler | undefined, method: string, params: Record<string, string>, body?: unknown) {
  if (!handler) throw new Error(`no ${method} handler`);
  return handler({
    request: new Request('https://rmhstudios.com/api/v1/me/decks/mine/cards', {
      method,
      headers: {
        authorization: BEARER,
        'cf-connecting-ip': '203.0.113.9',
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
    params,
  });
}

const box = { x: 0.1, y: 0.1, w: 0.2, h: 0.2 };
const maskOf = (label: string, extra: Record<string, unknown> = {}) => ({ ...box, label, ...extra });
const picture = (id = 'm1') => ({ media_id: id, alt: 'A labelled heart' });
const occlusionCard = (over: Record<string, unknown> = {}) => ({
  kind: 'occlusion',
  front: 'Name the part',
  back: 'A note',
  frontImage: picture(),
  occlusion: { mode: 'hide-all', masks: [maskOf('aorta'), maskOf('valve'), maskOf('atrium')] },
  ...over,
});
const post = (cards: unknown[]) => call(routes.cards.POST, 'POST', { id: 'mine' }, { cards });
const siblingsOf = (id: string) => h.db.cards.filter((c) => c.sourceId === id);

beforeEach(() => {
  vi.clearAllMocks();
  const db = h.db;
  for (const key of Object.keys(h.heads)) delete h.heads[key];
  db.decks = [
    { id: 'mine', userId: OWNER, title: 'Mine', description: null, isPublic: false, cardCount: 1 },
    { id: 'theirs', userId: 'other', title: 'Theirs', description: null, isPublic: true, cardCount: 0 },
  ];
  db.cards = [{ id: 'basic1', deckId: 'mine', front: 'f', back: 'b', position: 0 }];
  db.reviews = [];
  db.writes = 0;
  db.locks = [];
  db.nextId = 1;
  db.media = ['m1', 'm2', 'm3'].map((id) => ({
    id,
    userId: OWNER,
    key: `rmharks/${id}.webp`,
    url: urlOf(id),
    contentType: 'image/webp',
    bytes: 1000,
    status: 'PENDING' as const,
  }));
  db.media.push({
    id: 'x1',
    userId: 'other',
    key: 'rmharks/x1.webp',
    url: urlOf('x1'),
    contentType: 'image/webp',
    bytes: 1000,
    status: 'PENDING',
  });
  h.keyRow.current = {
    id: 'key_1',
    userId: OWNER,
    revokedAt: null,
    expiresAt: null,
    scopes: ['read:study', 'write:study'],
    testMode: false,
    allowedCidrs: [] as string[],
    rateLimitPerMinute: null,
  };
});

describe('creating an occlusion card', () => {
  it('answers 201 with the masks, their ids and the picture, and makes one card per mask', async () => {
    const res = await post([occlusionCard()]);
    expect(res.status).toBe(201);
    const body = (await res.json()) as { data: Record<string, unknown>[]; cardCount: number };
    expect(body.data[0]).toMatchObject({
      kind: 'occlusion',
      front: 'Name the part',
      back: 'A note',
      frontImage: { url: urlOf('m1'), alt: 'A labelled heart' },
      backImage: null,
      occlusion: {
        mode: 'hide-all',
        masks: [
          { id: 1, label: 'aorta', ...box },
          { id: 2, label: 'valve', ...box },
          { id: 3, label: 'atrium', ...box },
        ],
      },
    });
    const id = String(body.data[0]?.id);
    expect(siblingsOf(id).map((s) => [s.kind, s.clozeIndex, s.back])).toEqual([
      ['occlusion', 1, 'aorta'],
      ['occlusion', 2, 'valve'],
      ['occlusion', 3, 'atrium'],
    ]);
    expect(h.db.locks).toContain('deck-cards:mine');
  });

  it('needs no prompt, and keeps the ids it was sent', async () => {
    const res = await post([
      occlusionCard({
        front: undefined,
        back: undefined,
        occlusion: { mode: 'hide-one', masks: [maskOf('a', { id: 5 }), maskOf('b')] },
      }),
    ]);
    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      data: { front: string; occlusion: { mode: string; masks: { id: number }[] } }[];
    };
    expect(body.data[0]?.front).toBe('');
    expect(body.data[0]?.occlusion.mode).toBe('hide-one');
    expect(body.data[0]?.occlusion.masks.map((m) => m.id)).toEqual([5, 6]);
  });

  it('counts the generated cards against the deck’s limit, and the batch is all or nothing', async () => {
    for (let i = 0; i < 1998; i++)
      h.db.cards.push({ id: `f${i}`, deckId: 'mine', front: 'f', back: 'b', position: i + 1 });
    const before = h.db.writes;
    const res = await post([occlusionCard()]);
    expect(res.status).toBe(400);
    expect(h.db.writes).toBe(before);
    expect(h.db.cards.filter((c) => c.kind === 'occlusion')).toHaveLength(0);
  });

  it.each([
    ['no front picture', { frontImage: undefined }],
    ['a back picture', { backImage: picture('m2') }],
    ['no masks', { occlusion: { mode: 'hide-all', masks: [] } }],
    ['no occlusion at all', { occlusion: undefined }],
    ['21 masks', { occlusion: { mode: 'hide-all', masks: Array.from({ length: 21 }, (_, i) => maskOf(`m${i}`)) } }],
    ['a mask under 2 % wide', { occlusion: { mode: 'hide-all', masks: [maskOf('a', { w: 0.01 })] } }],
    ['a mask outside the picture', { occlusion: { mode: 'hide-all', masks: [maskOf('a', { x: 0.95 })] } }],
    ['a blank label', { occlusion: { mode: 'hide-all', masks: [maskOf('   ')] } }],
    ['a label over 200 characters', { occlusion: { mode: 'hide-all', masks: [maskOf('x'.repeat(201))] } }],
    ['a duplicate id', { occlusion: { mode: 'hide-all', masks: [maskOf('a', { id: 1 }), maskOf('b', { id: 1 })] } }],
    ['an unknown mode', { occlusion: { mode: 'show-all', masks: [maskOf('a')] } }],
    ['an unknown key on a mask', { occlusion: { mode: 'hide-all', masks: [maskOf('a', { colour: 'red' })] } }],
    ['a front picture with no description', { frontImage: { media_id: 'm1', alt: '  ' } }],
  ])('is invalid_request with %s, and writes nothing', async (_name, over) => {
    const before = h.db.writes;
    const res = await post([occlusionCard(over)]);
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('invalid_request');
    expect(h.db.writes).toBe(before);
  });

  it('refuses masks on a card of another kind, and still needs a front on every other kind', async () => {
    const masks = { mode: 'hide-all', masks: [maskOf('a')] };
    expect((await post([{ kind: 'basic', front: 'a', back: 'b', occlusion: masks }])).status).toBe(400);
    expect((await post([{ kind: 'basic', back: 'b' }])).status).toBe(400);
    expect((await post([{ kind: 'reversible', front: '', back: 'b' }])).status).toBe(400);
  });

  it('refuses a media_id that is not the key owner’s, and an animated picture', async () => {
    const foreign = await post([occlusionCard({ frontImage: picture('x1') })]);
    expect(foreign.status).toBe(400);
    expect(((await foreign.json()) as { error: { code: string } }).error.code).toBe('invalid_media');
    h.heads['rmharks/m1.webp'] = ANIMATED;
    const animated = await post([occlusionCard()]);
    expect(animated.status).toBe(400);
    expect(h.db.cards.filter((c) => c.kind === 'occlusion')).toHaveLength(0);
    expect(h.db.media?.find((m) => m.id === 'm1')?.status).toBe('PENDING');
  });
});

describe('reading', () => {
  it('lists the occlusion card with its masks and every other kind with occlusion null, never the generated cards', async () => {
    await post([occlusionCard()]);
    const res = await call(routes.cards.GET, 'GET', { id: 'mine' });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { kind: string; occlusion: { masks: unknown[] } | null }[] };
    expect(body.data.map((c) => [c.kind, c.occlusion === null ? null : c.occlusion.masks.length])).toEqual([
      ['basic', null],
      ['occlusion', 3],
    ]);
  });
});

describe('patching', () => {
  async function made() {
    const res = await post([occlusionCard()]);
    const body = (await res.json()) as {
      data: { id: string; occlusion: { mode: string; masks: Record<string, unknown>[] } }[];
    };
    const card = body.data[0]!;
    h.db.reviews = siblingsOf(card.id).map((s, i) => ({ id: `r${i}`, cardId: s.id, userId: OWNER }));
    return card;
  }
  const patch = (id: string, body: unknown) => call(routes.card.PATCH, 'PATCH', { id: 'mine', cardId: id }, body);

  it('renames and reorders masks with their ids sent back, keeping every sibling and its reviews', async () => {
    const card = await made();
    const rows = siblingsOf(card.id).map((s) => s.id);
    const masks = [...card.occlusion.masks].reverse().map((m) => (m.id === 2 ? { ...m, label: 'mitral valve' } : m));
    const res = await patch(card.id, { occlusion: { mode: 'hide-one', masks } });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      kind: 'occlusion',
      occlusion: { mode: 'hide-one', masks: [{ id: 3 }, { id: 2, label: 'mitral valve' }, { id: 1 }] },
    });
    expect(siblingsOf(card.id).map((s) => s.id)).toEqual(rows);
    expect(h.db.reviews).toHaveLength(3);
  });

  it('adds a mask without an id as one new card, and removing one drops its card and reviews', async () => {
    const card = await made();
    const keep = card.occlusion.masks.filter((m) => m.id !== 1);
    const res = await patch(card.id, { occlusion: { mode: 'hide-all', masks: [...keep, maskOf('ventricle')] } });
    expect(res.status).toBe(200);
    expect(siblingsOf(card.id).map((s) => s.clozeIndex)).toEqual([2, 3, 4]);
    expect(h.db.reviews).toHaveLength(2);
  });

  it('changes only the prompt without touching the masks', async () => {
    const card = await made();
    const res = await patch(card.id, { front: 'What is this?' });
    expect(res.status).toBe(200);
    expect(siblingsOf(card.id).map((s) => s.front)).toEqual(['What is this?', 'What is this?', 'What is this?']);
    expect(((await res.json()) as { occlusion: { masks: unknown[] } }).occlusion.masks).toHaveLength(3);
  });

  it('turns it into a basic card: occlusion null, the generated cards gone', async () => {
    const card = await made();
    const res = await patch(card.id, { kind: 'basic', front: 'Heart', back: 'Organ' });
    // The front picture is kept, so a basic card with a picture and a description is fine.
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ kind: 'basic', occlusion: null });
    expect(siblingsOf(card.id)).toHaveLength(0);
  });

  it('turns a basic card into an occlusion card only with a picture and masks', async () => {
    const created = await post([{ front: 'Heart', back: 'Organ', frontImage: picture('m2') }]);
    const id = ((await created.json()) as { data: { id: string }[] }).data[0]!.id;
    expect((await patch(id, { kind: 'occlusion' })).status).toBe(400);
    const ok = await patch(id, {
      kind: 'occlusion',
      occlusion: { mode: 'hide-all', masks: [maskOf('a'), maskOf('b')] },
    });
    expect(ok.status).toBe(200);
    expect(siblingsOf(id)).toHaveLength(2);
  });

  it('refuses a bad mask, an empty patch and a null it cannot take, changing nothing', async () => {
    const card = await made();
    const before = h.db.writes;
    expect((await patch(card.id, { occlusion: { mode: 'hide-all', masks: [maskOf('a', { h: 0.001 })] } })).status).toBe(
      400,
    );
    expect((await patch(card.id, {})).status).toBe(400);
    // Clearing the masks of a card that is still an occlusion card leaves it with none.
    expect((await patch(card.id, { occlusion: null })).status).toBe(400);
    expect(h.db.writes).toBe(before);
    expect(siblingsOf(card.id)).toHaveLength(3);
  });

  it('is 404 for a generated card', async () => {
    const card = await made();
    const sibling = siblingsOf(card.id)[0]!;
    expect((await patch(sibling.id, { front: 'x' })).status).toBe(404);
  });
});

describe('upserting by external id', () => {
  const put = (body: unknown) => call(routes.upsert.PUT, 'PUT', { id: 'mine', externalId: 'heart-1' }, body);

  it('creates the card (201), then changes nothing the second time (200) and updates it on a change', async () => {
    const body = occlusionCard({
      occlusion: { mode: 'hide-all', masks: [maskOf('a', { id: 1 }), maskOf('b', { id: 2 })] },
    });
    delete (body as Record<string, unknown>).kind;
    const first = await put({ ...body, kind: 'occlusion' });
    expect(first.status).toBe(201);
    const created = (await first.json()) as { id: string; externalId: string; occlusion: { masks: unknown[] } };
    expect(created).toMatchObject({ externalId: 'heart-1' });
    expect(created.occlusion.masks).toHaveLength(2);
    expect(siblingsOf(created.id)).toHaveLength(2);

    const writes = h.db.writes;
    const again = await put({ ...body, kind: 'occlusion' });
    expect(again.status).toBe(200);
    expect(h.db.writes).toBe(writes);

    const changed = await put({
      ...body,
      kind: 'occlusion',
      occlusion: { mode: 'hide-all', masks: [maskOf('a', { id: 1 }), maskOf('b renamed', { id: 2 }), maskOf('c')] },
    });
    expect(changed.status).toBe(200);
    expect(siblingsOf(created.id).map((s) => [s.clozeIndex, s.back])).toEqual([
      [1, 'a'],
      [2, 'b renamed'],
      [3, 'c'],
    ]);
  });
});
