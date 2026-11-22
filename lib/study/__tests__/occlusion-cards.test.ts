/**
 * Picture-occlusion flashcards (s09-03), the server side, against the in-memory study database: a card makes one
 * sibling per mask under the deck lock, the deck's card cap counts them, a label edit or reorder keeps a sibling's
 * review history while a deleted mask takes its sibling and reviews with it, a copy carries the masks and SHARES the
 * picture, the author's mask edit reaches the copier as an update, the export lists the cards, and the raw SQL that
 * counts due cards leaves the authored occlusion rows out.
 */
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { newFakeDb, type FakeCard, type FakeDb } from './fake-study-db';

const db = vi.hoisted(() => ({
  decks: [] as unknown[],
  cards: [] as unknown[],
  reviews: [] as unknown[],
  media: [] as unknown[],
  writes: 0,
  locks: [] as string[],
  nextId: 1,
})) as unknown as FakeDb;
const deleted = vi.hoisted(() => [] as string[]);
const STILL_WEBP_HEAD = vi.hoisted(() =>
  Buffer.from('RIFF\0\0\0\0WEBPVP8X\u000a\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0', 'latin1'),
);

vi.mock('@/lib/auth', () => ({ auth: { api: { getSession: vi.fn() } } }));
vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (config: unknown) => ({ options: config }),
}));
vi.mock('@/lib/moderation.server', () => ({ getBlockedAuthorIds: async () => [] as string[] }));
vi.mock('@/lib/rate-limit', () => ({ RATE_LIMIT_POLICIES: {}, rateLimit: vi.fn(async () => ({ allowed: true })) }));
vi.mock('@/lib/storage/s3.server', () => ({
  deleteObject: async (key: string) => {
    deleted.push(key);
  },
  getObjectRange: async () => ({ body: STILL_WEBP_HEAD, contentType: 'image/webp', start: 0, end: 31, total: 32 }),
}));
vi.mock('@/lib/media/ingest.server', () => ({
  ingest: vi.fn(),
  POLICIES: { flashcard: { mime: ['image/png', 'image/jpeg', 'image/webp'], maxBytes: 5 * 1024 * 1024 } },
  IngestError: class IngestError extends Error {},
}));
vi.mock('@/lib/prisma.server', async () => {
  const { makeStudyPrisma } = await import('./fake-study-db');
  const prisma = makeStudyPrisma(db);
  return { prisma: { ...prisma, $queryRaw: vi.fn(async () => [] as unknown[]) } };
});

const { addCard, deleteCard, importCardsDetailed, updateCard, upsertCardByExternalId } =
  await import('@/lib/study/deck-editor.server');
const { cloneDeck } = await import('@/lib/study.server');
const { applyUpdates, deckUpdates } = await import('@/lib/study/deck-sync.server');
const { exportOcclusionCards } = await import('@/lib/study/occlusion.server');
const { MAX_DECK_CARDS } = await import('@/lib/study/limits');

const urlOf = (name: string) => `/api/feed/image/${name}.webp`;
const media = (id: string, userId: string) => ({
  id,
  userId,
  key: `rmharks/${id}.webp`,
  url: urlOf(id),
  contentType: 'image/webp',
  bytes: 1000,
  status: 'PENDING' as const,
});
const pic = (id: string, alt = 'A labelled heart') => ({ url: urlOf(id), alt });
const box = { x: 0.1, y: 0.1, w: 0.2, h: 0.2 };
const masks = (...labels: string[]) => ({
  mode: 'hide-all' as const,
  masks: labels.map((label, i) => ({ ...box, x: 0.1 * (i + 1), label })),
});
const occlusionCard = (over: Record<string, unknown> = {}) => ({
  kind: 'occlusion' as const,
  front: 'Name the part',
  back: 'A note',
  frontImage: pic('m1'),
  occlusion: masks('aorta', 'valve', 'atrium'),
  ...over,
});
const authored = (deckId: string) => db.cards.filter((c) => c.deckId === deckId && !c.sourceId);
const siblingsOf = (id: string) => db.cards.filter((c) => c.sourceId === id);

async function add(deckId = 'mine', userId = 'me', over: Record<string, unknown> = {}) {
  const res = await addCard(userId, deckId, occlusionCard(over));
  if (!res.ok) throw new Error(res.error);
  return res.card.id;
}

beforeEach(() => {
  Object.assign(db, newFakeDb());
  deleted.length = 0;
  db.decks = [
    { id: 'mine', userId: 'me', title: 'Mine', description: null, isPublic: false, cardCount: 0 },
    { id: 'pub', userId: 'author', title: 'Pub', description: null, isPublic: true, cardCount: 0 },
  ];
  db.media = [media('m1', 'me'), media('m2', 'me'), media('a1', 'author'), media('a2', 'author')];
});

describe('creating an occlusion card', () => {
  it('makes one sibling per mask, under the deck lock, each keyed by its mask id', async () => {
    const id = await add();
    expect(db.locks).toContain('deck-cards:mine');
    const row = authored('mine')[0]!;
    expect(row).toMatchObject({
      id,
      kind: 'occlusion',
      front: 'Name the part',
      back: 'A note',
      frontImageUrl: urlOf('m1'),
    });
    expect((row.occlusion as { masks: { id: number }[] }).masks.map((m) => m.id)).toEqual([1, 2, 3]);
    const siblings = siblingsOf(id);
    expect(siblings.map((s) => [s.kind, s.clozeIndex, s.back, s.front])).toEqual([
      ['occlusion', 1, 'aorta', 'Name the part'],
      ['occlusion', 2, 'valve', 'Name the part'],
      ['occlusion', 3, 'atrium', 'Name the part'],
    ]);
    // Siblings hold no picture and no masks of their own: they read the authored card's.
    for (const s of siblings) expect(s).toMatchObject({ frontImageUrl: null, occlusion: null });
    expect(db.decks.find((d) => d.id === 'mine')?.cardCount).toBe(1);
  });

  it('claims the picture like any other card picture, and keeps the prompt and note optional', async () => {
    await add('mine', 'me', { front: '', back: '' });
    expect(db.media?.find((m) => m.id === 'm1')?.status).toBe('ATTACHED');
    expect(authored('mine')[0]).toMatchObject({ front: '', back: '' });
  });

  it('keeps the ids a client sent and gives a mask with none the next free one', async () => {
    const id = await add('mine', 'me', {
      occlusion: {
        mode: 'hide-one',
        masks: [
          { ...box, id: 7, label: 'a' },
          { ...box, label: 'b' },
        ],
      },
    });
    const row = db.cards.find((c) => c.id === id)!;
    expect((row.occlusion as { masks: { id: number }[] }).masks.map((m) => m.id)).toEqual([7, 8]);
    expect(siblingsOf(id).map((s) => s.clozeIndex)).toEqual([7, 8]);
  });

  it('is refused, writing nothing, without a front picture, with a back picture, or with bad masks', async () => {
    const before = db.writes;
    for (const over of [
      { frontImage: null },
      { backImage: pic('m2') },
      { occlusion: { mode: 'hide-all', masks: [] } },
      { occlusion: null },
      { occlusion: { mode: 'hide-all', masks: [{ ...box, w: 0.01, label: 'a' }] } },
      { occlusion: { mode: 'hide-all', masks: [{ ...box, label: '  ' }] } },
    ]) {
      expect(await addCard('me', 'mine', occlusionCard(over))).toMatchObject({ ok: false, status: 400 });
    }
    expect(db.writes).toBe(before);
    expect(authored('mine')).toHaveLength(0);
    expect(db.media?.find((m) => m.id === 'm1')?.status).toBe('PENDING');
  });

  it('refuses masks on a card of another kind', async () => {
    const res = await addCard('me', 'mine', { kind: 'basic', front: 'a', back: 'b', occlusion: masks('x') });
    expect(res).toMatchObject({ ok: false, status: 400 });
  });

  it('is created, and read back unchanged, by an import and by an upsert on the member’s own key', async () => {
    const imported = await importCardsDetailed('me', 'mine', [occlusionCard()]);
    expect(imported).toMatchObject({ ok: true, created: 1 });
    const upserted = await upsertCardByExternalId('me', 'mine', 'heart-1', occlusionCard({ frontImage: pic('m1') }));
    expect(upserted).toMatchObject({ ok: true, created: true });
    const again = await upsertCardByExternalId('me', 'mine', 'heart-1', occlusionCard({ frontImage: pic('m1') }));
    expect(again).toMatchObject({ ok: true, created: false, changed: false });
    const moved = await upsertCardByExternalId(
      'me',
      'mine',
      'heart-1',
      occlusionCard({ frontImage: pic('m1'), occlusion: masks('aorta', 'valve') }),
    );
    expect(moved).toMatchObject({ ok: true, changed: true });
    expect(siblingsOf((moved as { id: string }).id)).toHaveLength(2);
  });
});

describe('the deck’s card cap', () => {
  const fill = (rows: number) => {
    for (let i = 0; i < rows; i++) {
      db.cards.push({ id: `fill${i}`, deckId: 'mine', front: `f${i}`, back: 'b', position: i } as FakeCard);
    }
  };

  it('counts the siblings: three masks are four rows', async () => {
    fill(MAX_DECK_CARDS - 3);
    const before = db.writes;
    expect(await addCard('me', 'mine', occlusionCard())).toMatchObject({
      ok: false,
      status: 400,
      error: 'Deck is full',
    });
    expect(db.writes).toBe(before);
    fill(0);
    db.cards.pop();
    expect(await addCard('me', 'mine', occlusionCard())).toMatchObject({ ok: true });
    expect(db.cards.filter((c) => c.deckId === 'mine')).toHaveLength(MAX_DECK_CARDS);
  });

  it('holds for an import and for an edit that adds masks', async () => {
    fill(MAX_DECK_CARDS - 4);
    expect(
      await importCardsDetailed('me', 'mine', [occlusionCard(), occlusionCard({ occlusion: masks('x', 'y') })]),
    ).toMatchObject({
      ok: false,
      status: 400,
    });
    const id = await add();
    expect(db.cards.filter((c) => c.deckId === 'mine')).toHaveLength(MAX_DECK_CARDS);
    const res = await updateCard('me', id, { occlusion: masks('aorta', 'valve', 'atrium', 'extra') });
    expect(res).toMatchObject({ ok: false, status: 400, error: 'Deck is full' });
    expect(siblingsOf(id)).toHaveLength(3);
  });
});

describe('editing the masks keeps what should be kept', () => {
  async function withReviews() {
    const id = await add();
    const rows = siblingsOf(id);
    db.reviews = rows.map((r, i) => ({ id: `rev${i}`, cardId: r.id, userId: 'me' }));
    return { id, rows: rows.map((r) => r.id) };
  }
  const stored = (id: string) =>
    db.cards.find((c) => c.id === id)!.occlusion as { masks: { id: number; label: string }[] };

  it('keeps a sibling and its review when its label is renamed', async () => {
    const { id, rows } = await withReviews();
    const next = stored(id);
    const res = await updateCard('me', id, {
      occlusion: { mode: 'hide-all', masks: next.masks.map((m) => (m.id === 2 ? { ...m, label: 'mitral valve' } : m)) },
    });
    expect(res).toEqual({ ok: true });
    expect(siblingsOf(id).map((s) => s.id)).toEqual(rows);
    expect(siblingsOf(id).find((s) => s.clozeIndex === 2)?.back).toBe('mitral valve');
    expect(db.reviews).toHaveLength(3);
  });

  it('keeps every sibling and review when the masks are reordered', async () => {
    const { id, rows } = await withReviews();
    const reversed = [...stored(id).masks].reverse();
    expect(await updateCard('me', id, { occlusion: { mode: 'hide-all', masks: reversed } })).toEqual({ ok: true });
    expect(stored(id).masks.map((m) => m.id)).toEqual([3, 2, 1]);
    expect(
      siblingsOf(id)
        .map((s) => s.id)
        .sort(),
    ).toEqual([...rows].sort());
    expect(db.reviews).toHaveLength(3);
  });

  it('takes a deleted mask’s sibling and its reviews with it, and makes one card for a new mask', async () => {
    const { id, rows } = await withReviews();
    const kept = stored(id).masks.filter((m) => m.id !== 2);
    const res = await updateCard('me', id, {
      occlusion: { mode: 'hide-all', masks: [...kept, { ...box, label: 'ventricle' }] },
    });
    expect(res).toEqual({ ok: true });
    const after = siblingsOf(id);
    expect(after.map((s) => s.clozeIndex)).toEqual([1, 3, 4]);
    expect(after.filter((s) => rows.includes(s.id))).toHaveLength(2);
    expect(db.reviews.map((r) => r.cardId).sort()).toEqual(
      rows.filter((r) => siblingsOf(id).some((s) => s.id === r)).sort(),
    );
    expect(db.reviews).toHaveLength(2);
  });

  it('never reuses a deleted mask’s id for a mask sent without one while a higher one is in use', async () => {
    const { id } = await withReviews();
    const kept = stored(id).masks.filter((m) => m.id !== 2);
    await updateCard('me', id, { occlusion: { mode: 'hide-all', masks: [...kept, { ...box, label: 'new' }] } });
    expect(stored(id).masks.map((m) => m.id)).toEqual([1, 3, 4]);
  });

  it('copies a changed prompt to every sibling and leaves their ids alone', async () => {
    const { id, rows } = await withReviews();
    expect(await updateCard('me', id, { front: 'What is this?' })).toEqual({ ok: true });
    expect(siblingsOf(id).map((s) => s.front)).toEqual(['What is this?', 'What is this?', 'What is this?']);
    expect(siblingsOf(id).map((s) => s.id)).toEqual(rows);
  });

  it('drops every sibling and the masks when the card becomes basic', async () => {
    const { id } = await withReviews();
    const res = await updateCard('me', id, { kind: 'basic', front: 'Heart', back: 'Organ', frontImage: pic('m1') });
    expect(res).toEqual({ ok: true });
    expect(siblingsOf(id)).toHaveLength(0);
    expect(db.cards.find((c) => c.id === id)).toMatchObject({ kind: 'basic', occlusion: null });
    expect(db.reviews).toHaveLength(0);
  });

  it('can turn a picture card into an occlusion card, and refuses it without masks', async () => {
    await addCard('me', 'mine', { kind: 'basic', front: 'Heart', back: 'Organ', frontImage: pic('m1') });
    const id = authored('mine')[0]!.id;
    expect(await updateCard('me', id, { kind: 'occlusion' })).toMatchObject({ ok: false, status: 400 });
    expect(await updateCard('me', id, { kind: 'occlusion', occlusion: masks('a', 'b') })).toEqual({ ok: true });
    expect(siblingsOf(id)).toHaveLength(2);
  });

  it('deletes the card with its siblings and reviews, and releases the picture', async () => {
    const { id } = await withReviews();
    expect(await deleteCard('me', id)).toEqual({ ok: true });
    expect(db.cards).toHaveLength(0);
    expect(db.reviews).toHaveLength(0);
    expect(deleted).toEqual(['rmharks/m1.webp', 'rmharks/m1-400.webp']);
  });
});

describe('copies', () => {
  const authorCard = async () => {
    const id = await add('pub', 'author', { frontImage: pic('a1') });
    return id;
  };

  it('carry the masks, make their own siblings and share the picture object', async () => {
    const sourceId = await authorCard();
    const mediaBefore = db.media?.length;
    const cloned = await cloneDeck('me', 'pub');
    if (!cloned.ok) throw new Error(cloned.error);
    const copy = authored(cloned.id)[0]!;
    expect(copy).toMatchObject({
      kind: 'occlusion',
      front: 'Name the part',
      back: 'A note',
      frontImageUrl: urlOf('a1'),
      originCardId: sourceId,
    });
    expect(copy.occlusion).toEqual(db.cards.find((c) => c.id === sourceId)!.occlusion);
    expect(siblingsOf(copy.id).map((s) => [s.kind, s.clozeIndex, s.back])).toEqual([
      ['occlusion', 1, 'aorta'],
      ['occlusion', 2, 'valve'],
      ['occlusion', 3, 'atrium'],
    ]);
    // The copy's siblings are new rows; the picture is the author's object, not a second one.
    expect(siblingsOf(copy.id).some((s) => siblingsOf(sourceId).some((o) => o.id === s.id))).toBe(false);
    expect(db.media?.length).toBe(mediaBefore);
    expect(db.locks).toContain(`card-image:${urlOf('a1')}`);
  });

  it('are offered the author’s new label as an update, and applying it keeps the copy’s siblings', async () => {
    const sourceId = await authorCard();
    const cloned = await cloneDeck('me', 'pub');
    if (!cloned.ok) throw new Error(cloned.error);
    const copy = authored(cloned.id)[0]!;
    const copySiblings = siblingsOf(copy.id).map((s) => s.id);
    db.reviews = [{ id: 'r1', cardId: copySiblings[0]!, userId: 'me' }];

    const masksNow = (db.cards.find((c) => c.id === sourceId)!.occlusion as { masks: { id: number; label: string }[] })
      .masks;
    await updateCard('author', sourceId, {
      occlusion: { mode: 'hide-all', masks: masksNow.map((m) => (m.id === 1 ? { ...m, label: 'aortic arch' } : m)) },
    });
    const detail = await deckUpdates('me', cloned.id);
    if (!detail.ok) throw new Error('no detail');
    expect(detail.diff.changed).toHaveLength(1);
    const item = detail.diff.changed[0]!;
    expect(item.theirs.occlusion?.masks.find((m) => m.id === 1)?.label).toBe('aortic arch');

    const applied = await applyUpdates('me', cloned.id, [
      { type: 'changed', cardId: item.cardId, expectedHash: item.expectedHash },
    ]);
    expect(applied).toMatchObject({ ok: true, applied: 1 });
    expect(siblingsOf(copy.id).map((s) => s.id)).toEqual(copySiblings);
    expect(siblingsOf(copy.id).find((s) => s.clozeIndex === 1)?.back).toBe('aortic arch');
    expect(db.reviews).toHaveLength(1);
    expect(authored(cloned.id)[0]!.frontImageUrl).toBe(urlOf('a1'));
  });
});

describe('the account export', () => {
  it('lists the member’s occlusion cards with deck, card id, mode and masks, and no one else’s', async () => {
    const id = await add();
    await addCard('me', 'mine', { kind: 'basic', front: 'a', back: 'b' });
    await add('pub', 'author', { frontImage: pic('a1') });
    const out = await exportOcclusionCards('me');
    expect(out).toEqual([
      {
        deckId: 'mine',
        deck: 'Mine',
        cardId: id,
        prompt: 'Name the part',
        note: 'A note',
        mode: 'hide-all',
        masks: [
          { id: 1, ...box, x: 0.1, label: 'aorta' },
          { id: 2, ...box, x: 0.2, label: 'valve' },
          { id: 3, ...box, x: 0.3, label: 'atrium' },
        ],
      },
    ]);
  });
});

describe('due counts', () => {
  const schema = readFileSync('prisma/schema/rmhstudy.prisma', 'utf8');
  const flashcardModel = schema.slice(schema.indexOf('model Flashcard {'), schema.indexOf('model FlashcardReview {'));

  it('the raw SQL leaves authored occlusion rows out, by the real table and column names', () => {
    expect(flashcardModel).toContain('@@map("flashcard")');
    for (const column of ['kind', 'sourceId', 'deckId', 'occlusion']) {
      expect(flashcardModel).toMatch(new RegExp(`\\n\\s+${column}\\s`));
    }
    const sources: [string, string][] = [
      ['lib/study/queue.server.ts', `NOT (c."kind" = 'occlusion' AND c."sourceId" IS NULL)`],
      ['lib/api/v1/study.server.ts', `NOT (c."kind" = 'occlusion' AND c."sourceId" IS NULL)`],
      ['lib/study/stats.server.ts', `NOT (c.kind = 'occlusion' AND c."sourceId" IS NULL)`],
    ];
    for (const [file, needle] of sources) expect(readFileSync(file, 'utf8')).toContain(needle);
  });

  it('every Prisma read of reviewable cards leaves them out through the one shared filter', async () => {
    const { REVIEWABLE_WHERE } = await import('@/lib/study/card-query.server');
    expect(REVIEWABLE_WHERE).toEqual({ NOT: { kind: { in: ['cloze', 'occlusion'] }, sourceId: null } });
  });
});
