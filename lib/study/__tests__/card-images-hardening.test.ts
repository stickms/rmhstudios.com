/**
 * The three follow-ups of the card-picture work (s08-15) that picture-occlusion cards, the next writer of card
 * pictures, inherit (s09-03): an apply of the author's changes re-reads each card under the picture locks, every
 * picture lock a transaction takes is taken in sorted order (all at once, before any card is touched), and a picture
 * claim refuses an animated WebP (the feed surface keeps an animated GIF as one).
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { newFakeDb, type FakeDb } from './fake-study-db';

const db = vi.hoisted(() => ({
  decks: [] as unknown[],
  cards: [] as unknown[],
  reviews: [] as unknown[],
  media: [] as unknown[],
  writes: 0,
  locks: [] as string[],
  nextId: 1,
})) as unknown as FakeDb;
/** What the store returns for the first bytes of an object, by key; absent means a still WebP, null a missing object. */
const heads = vi.hoisted(() => ({}) as Record<string, Buffer | null>);
const STILL = vi.hoisted(() => Buffer.from('RIFF\0\0\0\0WEBPVP8X\u000a\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0', 'latin1'));
const ANIMATED = vi.hoisted(() =>
  Buffer.from('RIFF\0\0\0\0WEBPVP8X\u000a\0\0\0\u0012\0\0\0\0\0\0\0\0\0\0\0', 'latin1'),
);

vi.mock('@/lib/auth', () => ({ auth: { api: { getSession: vi.fn() } } }));
vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (config: unknown) => ({ options: config }),
}));
vi.mock('@/lib/moderation.server', () => ({ getBlockedAuthorIds: async () => [] as string[] }));
vi.mock('@/lib/rate-limit', () => ({ RATE_LIMIT_POLICIES: {}, rateLimit: vi.fn(async () => ({ allowed: true })) }));
vi.mock('@/lib/storage/s3.server', () => ({
  deleteObject: async () => {},
  getObjectRange: async (key: string) => {
    const head = key in heads ? heads[key] : STILL;
    return head ? { body: head, contentType: 'image/webp', start: 0, end: head.length - 1, total: head.length } : null;
  },
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

const { addCard, importCardsDetailed, updateCard, upsertCardByExternalId } =
  await import('@/lib/study/deck-editor.server');
const { cloneDeck } = await import('@/lib/study.server');
const { applyUpdates, deckUpdates } = await import('@/lib/study/deck-sync.server');
const { lockPictureUrls } = await import('@/lib/study/card-images.server');
const { isAnimatedWebp } = await import('@/lib/study/card-images');

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
const cards = (deckId: string) => db.cards.filter((c) => c.deckId === deckId && !c.sourceId);
const mediaOf = (id: string) => db.media?.find((m) => m.id === id);

beforeEach(() => {
  Object.assign(db, newFakeDb());
  for (const key of Object.keys(heads)) delete heads[key];
  db.decks = [
    { id: 'mine', userId: 'me', title: 'Mine', description: null, isPublic: false, cardCount: 0 },
    { id: 'pub', userId: 'author', title: 'Pub', description: null, isPublic: true, cardCount: 0 },
  ];
  db.media = ['m1', 'm2', 'm3']
    .map((id) => media(id, 'me'))
    .concat(['a1', 'a2', 'a3', 'a4'].map((id) => media(id, 'author')));
});

describe('an animated picture is refused at the claim', () => {
  const masks = { mode: 'hide-all' as const, masks: [{ x: 0.1, y: 0.1, w: 0.2, h: 0.2, label: 'aorta' }] };

  it('reads the VP8X animation flag from the first bytes of a WebP', () => {
    expect(isAnimatedWebp(STILL)).toBe(false);
    expect(isAnimatedWebp(ANIMATED)).toBe(true);
    // A lossy still has no VP8X chunk at all; whatever its bitstream says, it is not animated.
    expect(isAnimatedWebp(Buffer.from('RIFF\0\0\0\0WEBPVP8 \0\0\0\0ÿÿÿÿÿÿ', 'latin1'))).toBe(false);
    expect(isAnimatedWebp(Buffer.from('RIFF', 'latin1'))).toBe(false);
    expect(isAnimatedWebp(new Uint8Array(0))).toBe(false);
  });

  it('refuses it on a new card, whatever the kind, and leaves the upload pending and nothing written', async () => {
    heads['rmharks/m1.webp'] = ANIMATED;
    const before = db.writes;
    for (const card of [
      { front: 'Heart', back: 'Organ', frontImage: pic('m1') },
      { kind: 'occlusion' as const, front: '', back: '', frontImage: pic('m1'), occlusion: masks },
      { kind: 'cloze' as const, front: 'The {{c1::heart}}', backImage: pic('m1') },
    ]) {
      expect(await addCard('me', 'mine', card)).toMatchObject({
        ok: false,
        status: 400,
        error: 'Use a still picture, not an animated one',
      });
    }
    expect(db.writes).toBe(before);
    expect(cards('mine')).toHaveLength(0);
    expect(mediaOf('m1')?.status).toBe('PENDING');
  });

  it('refuses it on an edit, an import and an upsert, and takes a still one', async () => {
    await addCard('me', 'mine', { front: 'Heart', back: 'Organ', frontImage: pic('m2') });
    const id = cards('mine')[0]!.id;
    heads['rmharks/m1.webp'] = ANIMATED;
    expect(await updateCard('me', id, { frontImage: pic('m1') })).toMatchObject({ ok: false, status: 400 });
    expect(cards('mine')[0]).toMatchObject({ frontImageUrl: urlOf('m2') });
    expect(await importCardsDetailed('me', 'mine', [{ front: 'a', back: 'b', frontImage: pic('m1') }])).toMatchObject({
      ok: false,
      status: 400,
    });
    expect(
      await upsertCardByExternalId('me', 'mine', 'k', { front: 'a', back: 'b', frontImage: pic('m1') }),
    ).toMatchObject({
      ok: false,
      status: 400,
    });
    expect(mediaOf('m1')?.status).toBe('PENDING');
    expect(await updateCard('me', id, { frontImage: pic('m3') })).toEqual({ ok: true });
    expect(mediaOf('m3')?.status).toBe('ATTACHED');
  });

  it('refuses what it cannot inspect: an object the store no longer has', async () => {
    heads['rmharks/m1.webp'] = null;
    expect(await addCard('me', 'mine', { front: 'a', back: 'b', frontImage: pic('m1') })).toMatchObject({
      ok: false,
      status: 400,
    });
    expect(mediaOf('m1')?.status).toBe('PENDING');
  });

  it('does not read the store for a picture a card of the member already shows', async () => {
    await addCard('me', 'mine', { front: 'a', back: 'b', frontImage: pic('m1') });
    heads['rmharks/m1.webp'] = null;
    // Already attached, not pending: reusing it is an import of the member's own picture, as before.
    expect(await addCard('me', 'mine', { front: 'c', back: 'd', frontImage: pic('m1') })).toMatchObject({ ok: true });
  });
});

describe('picture locks are taken in sorted order', () => {
  const lockKeys = () => db.locks.filter((k) => k.startsWith('card-image:'));

  it('sorts and de-duplicates the URLs of one call', async () => {
    const tx = {
      $executeRaw: async (_s: TemplateStringsArray, ...values: unknown[]) => {
        db.locks.push(String(values[0]));
        return 0;
      },
    };
    await lockPictureUrls(tx as never, [urlOf('c'), urlOf('a'), urlOf('b'), urlOf('a')]);
    expect(lockKeys()).toEqual([urlOf('a'), urlOf('b'), urlOf('c')].map((u) => `card-image:${u}`));
  });

  async function twoPicturedCopy() {
    // The cards' pictures sort the opposite way round to the cards' order, so card-by-card locking would be unsorted.
    await addCard('author', 'pub', { front: 'First', back: 'a', frontImage: pic('a4') });
    await addCard('author', 'pub', { front: 'Second', back: 'b', frontImage: pic('a3') });
    const cloned = await cloneDeck('me', 'pub');
    if (!cloned.ok) throw new Error(cloned.error);
    const byFront = (front: string) => cards('pub').find((c) => c.front === front)!;
    await updateCard('author', byFront('First').id, { frontImage: pic('a2') });
    await updateCard('author', byFront('Second').id, { frontImage: pic('a1') });
    const detail = await deckUpdates('me', cloned.id);
    if (!detail.ok) throw new Error('no detail');
    expect(detail.diff.changed).toHaveLength(2);
    return { cloned, items: detail.diff.changed };
  }

  it('an apply takes every picture lock once, sorted, before it touches a card', async () => {
    const { cloned, items } = await twoPicturedCopy();
    db.locks.length = 0;
    const applied = await applyUpdates(
      'me',
      cloned.id,
      items.map((i) => ({ type: 'changed' as const, cardId: i.cardId, expectedHash: i.expectedHash })),
    );
    expect(applied).toMatchObject({ ok: true, applied: 2 });
    const firstCardLock = db.locks.findIndex((k) => k.startsWith('deck-cards:'));
    expect(firstCardLock).toBeGreaterThan(0);
    const beforeCards = db.locks.slice(0, firstCardLock).filter((k) => k.startsWith('card-image:'));
    expect(beforeCards).toEqual([...beforeCards].sort());
    expect(new Set(beforeCards)).toEqual(
      new Set([urlOf('a1'), urlOf('a2'), urlOf('a3'), urlOf('a4')].map((u) => `card-image:${u}`)),
    );
    expect(beforeCards).toHaveLength(4);
  });

  it('the only callers are a copy and an apply, and an apply calls it once', () => {
    const walk = (dir: string): string[] =>
      readdirSync(dir).flatMap((name) => {
        if (name === 'node_modules' || name === '__tests__' || name.startsWith('.')) return [];
        const path = join(dir, name);
        return statSync(path).isDirectory() ? walk(path) : /\.(ts|tsx)$/.test(name) ? [path] : [];
      });
    const callers = ['lib', 'app', 'components', 'features', 'server']
      .flatMap((dir) => walk(dir))
      .filter((file) => !/\.test\.tsx?$/.test(file))
      .filter((file) => /\blockPictureUrls\(/.test(readFileSync(file, 'utf8')))
      .sort();
    expect(callers).toEqual([
      'lib/study.server.ts',
      'lib/study/card-images.server.ts',
      'lib/study/deck-sync.server.ts',
    ]);
    const sync = readFileSync('lib/study/deck-sync.server.ts', 'utf8');
    expect(sync.match(/\blockPictureUrls\(/g)).toHaveLength(1);
  });
});

describe('an apply re-reads the author’s card under the locks', () => {
  /** Run `change` the moment the apply takes its first picture lock, as an author's save committing while it waits. */
  function whenFirstLocked(change: () => void) {
    let done = false;
    const target = db.locks;
    db.locks = new Proxy(target, {
      get(list, prop, receiver) {
        if (prop !== 'push') return Reflect.get(list, prop, receiver);
        return (...keys: string[]) => {
          const result = list.push(...keys);
          if (!done && keys.some((k) => k.startsWith('card-image:'))) {
            done = true;
            change();
          }
          return result;
        };
      },
    });
  }

  async function copied() {
    await addCard('author', 'pub', { front: 'Heart', back: 'Organ', frontImage: pic('a1', 'old description') });
    const cloned = await cloneDeck('me', 'pub');
    if (!cloned.ok) throw new Error(cloned.error);
    const source = cards('pub')[0]!;
    await updateCard('author', source.id, { frontImage: pic('a1', 'newer description'), back: 'Muscle' });
    const detail = await deckUpdates('me', cloned.id);
    if (!detail.ok) throw new Error('no detail');
    const item = detail.diff.changed[0]!;
    return { cloned, source, item };
  }

  it('applies what the card says now, not what it said before the wait', async () => {
    const { cloned, source, item } = await copied();
    whenFirstLocked(() => {
      Object.assign(source, { back: 'Muscle that pumps', frontImageAlt: 'newest description' });
    });
    const applied = await applyUpdates('me', cloned.id, [
      { type: 'changed', cardId: item.cardId, expectedHash: item.expectedHash },
    ]);
    expect(applied).toMatchObject({ ok: true, applied: 1 });
    expect(cards(cloned.id)[0]).toMatchObject({
      back: 'Muscle that pumps',
      frontImageAlt: 'newest description',
      frontImageUrl: urlOf('a1'),
    });
    // The copy is in step with the card as it is now: nothing is left to offer.
    const after = await deckUpdates('me', cloned.id);
    if (!after.ok) throw new Error('no detail');
    expect(after.diff.changed).toHaveLength(0);
  });

  it('skips a card whose picture moved to one it did not lock, and changes nothing', async () => {
    const { cloned, source, item } = await copied();
    whenFirstLocked(() => {
      Object.assign(source, { frontImageUrl: urlOf('a2') });
    });
    const before = { ...cards(cloned.id)[0]! };
    const applied = await applyUpdates('me', cloned.id, [
      { type: 'changed', cardId: item.cardId, expectedHash: item.expectedHash },
    ]);
    expect(applied).toMatchObject({ ok: true, applied: 0, skipped: [{ id: item.cardId, reason: 'stale' }] });
    expect(cards(cloned.id)[0]).toMatchObject({ back: before.back, frontImageAlt: before.frontImageAlt });
  });

  it('skips a card the author removed while it waited', async () => {
    const { cloned, source, item } = await copied();
    whenFirstLocked(() => {
      db.cards = db.cards.filter((c) => c.id !== source.id);
    });
    const applied = await applyUpdates('me', cloned.id, [
      { type: 'changed', cardId: item.cardId, expectedHash: item.expectedHash },
    ]);
    expect(applied).toMatchObject({ ok: true, applied: 0 });
    expect(cards(cloned.id)).toHaveLength(1);
  });
});
